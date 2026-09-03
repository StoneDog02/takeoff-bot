import type { PbgRun } from "../pbg/consolidatePhysicalRuns.js";
import type { TextPrimitive } from "../text/extractTextPrimitives.js";
import type { EnclosureCandidate } from "./detectEnclosures.js";
import type { LeaderCandidate } from "./detectLeaders.js";
import type { CandidateStrategy } from "./phase0Decision.schema.js";

export type MarkCandidateRegion = {
  id: string;
  strategy: CandidateStrategy;
  kind: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  mid: { x: number; y: number };
  orientation: "H" | "V" | "unknown";
  physicalRunKey: string | null;
  enclosureId: string | null;
  leaderId: string | null;
};

function bandAroundRun(run: PbgRun, bandPt = 36): MarkCandidateRegion {
  const cl = run.centerline;
  const padAlong = 28;
  if (run.orientation === "H") {
    const x0 = Math.min(cl.x1, cl.x2) - padAlong;
    const x1 = Math.max(cl.x1, cl.x2) + padAlong;
    const y = run.mid.y;
    return {
      id: `rb-${run.physicalRunKey}-mid`,
      strategy: "run-band",
      kind: "run-mid-band",
      bbox: { x0, y0: y - bandPt, x1, y1: y + bandPt },
      mid: run.mid,
      orientation: "H",
      physicalRunKey: run.physicalRunKey,
      enclosureId: null,
      leaderId: null,
    };
  }
  const y0 = Math.min(cl.y1, cl.y2) - padAlong;
  const y1 = Math.max(cl.y1, cl.y2) + padAlong;
  const x = run.mid.x;
  return {
    id: `rb-${run.physicalRunKey}-mid`,
    strategy: "run-band",
    kind: "run-mid-band",
    bbox: { x0: x - bandPt, y0, x1: x + bandPt, y1 },
    mid: run.mid,
    orientation: "V",
    physicalRunKey: run.physicalRunKey,
    enclosureId: null,
    leaderId: null,
  };
}

function endpointCap(run: PbgRun, end: "a" | "b", size = 48): MarkCandidateRegion {
  const pt = end === "a" ? run.endpoints[0]! : run.endpoints[1]!;
  const half = size / 2;
  return {
    id: `rb-${run.physicalRunKey}-ep-${end}`,
    strategy: "run-band",
    kind: "run-endpoint-cap",
    bbox: {
      x0: pt.x - half,
      y0: pt.y - half,
      x1: pt.x + half,
      y1: pt.y + half,
    },
    mid: pt,
    orientation: run.orientation,
    physicalRunKey: run.physicalRunKey,
    enclosureId: null,
    leaderId: null,
  };
}

function expandBbox(
  bbox: { x0: number; y0: number; x1: number; y1: number },
  pad: number,
): { x0: number; y0: number; x1: number; y1: number } {
  return {
    x0: bbox.x0 - pad,
    y0: bbox.y0 - pad,
    x1: bbox.x1 + pad,
    y1: bbox.y1 + pad,
  };
}

function regionIoU(
  a: MarkCandidateRegion["bbox"],
  b: MarkCandidateRegion["bbox"],
): number {
  const x0 = Math.max(a.x0, b.x0);
  const y0 = Math.max(a.y0, b.y0);
  const x1 = Math.min(a.x1, b.x1);
  const y1 = Math.min(a.y1, b.y1);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  const areaA = (a.x1 - a.x0) * (a.y1 - a.y0);
  const areaB = (b.x1 - b.x0) * (b.y1 - b.y0);
  return inter / Math.max(areaA + areaB - inter, 1e-6);
}

function dedupeRegions(regions: MarkCandidateRegion[]): MarkCandidateRegion[] {
  const kept: MarkCandidateRegion[] = [];
  for (const r of regions) {
    if (kept.some((k) => regionIoU(k.bbox, r.bbox) > 0.65)) continue;
    kept.push(r);
  }
  return kept;
}

export function generateRunBandRegions(
  pbgRuns: readonly PbgRun[],
  maxRuns = 40,
): MarkCandidateRegion[] {
  const eligible = pbgRuns
    .filter((r) => r.wallAuthority === "high" || r.wallAuthority === "medium")
    .sort((a, b) => b.lengthPt - a.lengthPt)
    .slice(0, maxRuns);

  const regions: MarkCandidateRegion[] = [];
  for (const run of eligible) {
    regions.push(bandAroundRun(run));
    regions.push(endpointCap(run, "a"));
    regions.push(endpointCap(run, "b"));
  }
  return dedupeRegions(regions);
}

export function generateEnclosureInteriorRegions(
  enclosures: readonly EnclosureCandidate[],
): MarkCandidateRegion[] {
  return enclosures.map((enc) => ({
    id: `enc-int-${enc.id}`,
    strategy: "enclosure-interior" as const,
    kind: "enclosure-interior",
    bbox: expandBbox(enc.bbox, 4),
    mid: enc.mid,
    orientation: enc.widthPt >= enc.heightPt ? ("H" as const) : ("V" as const),
    physicalRunKey: null,
    enclosureId: enc.id,
    leaderId: null,
  }));
}

export function generateLeaderMarkRegions(
  leaders: readonly LeaderCandidate[],
  enclosures: readonly EnclosureCandidate[],
): MarkCandidateRegion[] {
  const encById = new Map(enclosures.map((e) => [e.id, e]));
  const regions: MarkCandidateRegion[] = [];

  for (const leader of leaders) {
    const enc = leader.enclosureId ? encById.get(leader.enclosureId) : null;
    const bbox = enc
      ? expandBbox(enc.bbox, 6)
      : {
          x0: leader.from.x - 24,
          y0: leader.from.y - 24,
          x1: leader.from.x + 24,
          y1: leader.from.y + 24,
        };
    regions.push({
      id: `ldr-mark-${leader.id}`,
      strategy: "leader-endpoint",
      kind: "leader-mark-region",
      bbox,
      mid: enc?.mid ?? leader.from,
      orientation: "unknown",
      physicalRunKey: leader.nearRunKey,
      enclosureId: leader.enclosureId,
      leaderId: leader.id,
    });
  }
  return regions;
}

export function generateNativeTextRegions(
  primitives: readonly TextPrimitive[],
): MarkCandidateRegion[] {
  return primitives
    .filter((p) => p.rawText.trim().length > 0 && p.rawText.trim().length <= 32)
    .map((p) => ({
      id: `native-${p.id}`,
      strategy: "native-text" as const,
      kind: "native-text-bbox",
      bbox: p.bbox,
      mid: p.mid,
      orientation: p.orientation,
      physicalRunKey: null,
      enclosureId: null,
      leaderId: null,
    }));
}

export function regionsForStrategy(
  strategy: CandidateStrategy,
  input: {
    pbgRuns: readonly PbgRun[];
    enclosures: readonly EnclosureCandidate[];
    leaders: readonly LeaderCandidate[];
    primitives: readonly TextPrimitive[];
    maxRunBandRegions?: number;
  },
): MarkCandidateRegion[] {
  switch (strategy) {
    case "run-band":
      return generateRunBandRegions(input.pbgRuns, input.maxRunBandRegions ?? 40);
    case "enclosure-interior":
      return generateEnclosureInteriorRegions(input.enclosures);
    case "leader-endpoint":
      return generateLeaderMarkRegions(input.leaders, input.enclosures);
    case "native-text":
      return generateNativeTextRegions(input.primitives);
  }
}
