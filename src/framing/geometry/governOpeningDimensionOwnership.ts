import type { CompiledDrawingPage } from "../../compiler/schemas/compiledDrawingPage.schema.js";
import type { PhysicalWallRunRecord } from "../../compiler/schemas/physicalWallRun.schema.js";
import type { TextPrimitiveRecord } from "../../compiler/schemas/textPrimitive.schema.js";
import { roughOpeningZonesOverlap } from "../calculate/netStudDeduction.js";
import type {
  DimensionOwnershipResult,
  OpeningGapCandidate,
} from "./openingGovernanceTypes.js";

/** Max normal distance (PDF pt) from gap to dimension text for opening-width candidacy. */
const MAX_NORMAL_DIST_PT = 120;
/** Max axial distance (PDF pt) along run from gap to dimension text. */
const MAX_AXIAL_DIST_PT = 200;
const MIN_OPENING_WIDTH_FT = 2;
const MAX_OPENING_WIDTH_FT = 24;

type DimCandidate = {
  textPrimitiveId: string;
  parsedFeet: number;
  originalText: string;
  normalDist: number;
  axialDist: number;
};

function gapRelativeDistances(
  run: PhysicalWallRunRecord,
  gapAt: { x: number; y: number },
  pt: { x: number; y: number },
): { normalDist: number; axialDist: number } {
  if (run.orientation === "H") {
    const runY = (run.centerline.y1 + run.centerline.y2) / 2;
    return {
      normalDist: Math.abs(pt.y - runY),
      axialDist: Math.abs(pt.x - gapAt.x),
    };
  }
  const runX = (run.centerline.x1 + run.centerline.x2) / 2;
  return {
    normalDist: Math.abs(pt.x - runX),
    axialDist: Math.abs(pt.y - gapAt.y),
  };
}

function collectImperialTextCandidates(
  page: CompiledDrawingPage,
  run: PhysicalWallRunRecord,
  gapAt: { x: number; y: number },
): DimCandidate[] {
  const primitives: TextPrimitiveRecord[] = [
    ...page.text.imperialCandidates,
    ...page.text.primitives.filter((p) => p.parseStatus === "ok"),
  ];
  const seen = new Set<string>();
  const out: DimCandidate[] = [];

  for (const primitive of primitives) {
    if (seen.has(primitive.id)) continue;
    seen.add(primitive.id);
    if (primitive.parseStatus !== "ok" || primitive.parsedFeet == null) {
      continue;
    }
    if (
      primitive.parsedFeet < MIN_OPENING_WIDTH_FT ||
      primitive.parsedFeet > MAX_OPENING_WIDTH_FT
    ) {
      continue;
    }

    const { normalDist, axialDist } = gapRelativeDistances(
      run,
      gapAt,
      primitive.mid,
    );
    if (
      normalDist > MAX_NORMAL_DIST_PT ||
      axialDist > MAX_AXIAL_DIST_PT
    ) {
      continue;
    }

    out.push({
      textPrimitiveId: primitive.id,
      parsedFeet: primitive.parsedFeet,
      originalText: primitive.rawText,
      normalDist,
      axialDist,
    });
  }

  return out.sort((a, b) => a.axialDist + a.normalDist - (b.axialDist + b.normalDist));
}

function collectTranscriptionDimCandidates(
  page: CompiledDrawingPage,
  run: PhysicalWallRunRecord,
  gapAt: { x: number; y: number },
): DimCandidate[] {
  const emitLengthDims = new Set(page.governance.emitDimIds);
  const out: DimCandidate[] = [];

  for (const assoc of page.ownership.associations) {
    if (assoc.physicalRunKey !== run.physicalRunKey) continue;
    if (emitLengthDims.has(assoc.dimId)) continue;
    if (assoc.parse?.status !== "ok" || assoc.parse.feet == null) continue;
    if (assoc.parse.feet < MIN_OPENING_WIDTH_FT || assoc.parse.feet > MAX_OPENING_WIDTH_FT) {
      continue;
    }

    const transcription = page.transcriptions.find((t) => t.dimId === assoc.dimId);
    const dim = page.geometry.dims.find((d) => d.id === assoc.dimId);
    if (!dim) continue;

    const mid = transcription?.association
      ? {
          x: gapAt.x + (transcription.association.axialOverlap ?? 0),
          y: gapAt.y,
        }
      : gapAt;

    const { normalDist, axialDist } = gapRelativeDistances(run, gapAt, mid);
    if (normalDist > MAX_NORMAL_DIST_PT * 1.5) continue;

    out.push({
      textPrimitiveId: transcription?.textPrimitiveId ?? assoc.dimId,
      parsedFeet: assoc.parse.feet,
      originalText: assoc.parse.originalText ?? transcription?.rawText ?? assoc.dimId,
      normalDist,
      axialDist,
    });
  }

  return out;
}

function dimKey(ownership: DimensionOwnershipResult): string | null {
  if (ownership.status !== "ESTABLISHED") return null;
  if (ownership.textPrimitiveId) return `text:${ownership.textPrimitiveId}`;
  if (ownership.dimId) return `dim:${ownership.dimId}`;
  if (ownership.originalText != null && ownership.roughWidthFeet != null) {
    return `text-value:${ownership.originalText}:${ownership.roughWidthFeet}`;
  }
  return null;
}

function provisionalLeftEdgeFeet(
  candidate: OpeningGapCandidate,
  run: PhysicalWallRunRecord,
  roughWidthFeet: number,
  ptPerFt: number,
): number {
  const axisStart =
    run.orientation === "H"
      ? Math.min(run.centerline.x1, run.centerline.x2)
      : Math.min(run.centerline.y1, run.centerline.y2);
  const gapAxis =
    run.orientation === "H" ? candidate.gapAt.x : candidate.gapAt.y;
  const gapCenterFeet = (gapAxis - axisStart) / ptPerFt;
  return gapCenterFeet - roughWidthFeet / 2;
}

/** Same in-bounds rule as governOpeningPhysicalRunOwnership. */
function provisionalRoFitsOnRun(
  candidate: OpeningGapCandidate,
  run: PhysicalWallRunRecord,
  roughWidthFeet: number,
  ptPerFt: number,
): boolean {
  const leftEdge = provisionalLeftEdgeFeet(
    candidate,
    run,
    roughWidthFeet,
    ptPerFt,
  );
  const runLengthFeet = run.lengthPt / ptPerFt;
  return leftEdge >= -0.5 && leftEdge + roughWidthFeet <= runLengthFeet + 0.5;
}

function compareExclusiveWinners(
  a: { candidate: OpeningGapCandidate; ownership: DimensionOwnershipResult },
  b: { candidate: OpeningGapCandidate; ownership: DimensionOwnershipResult },
  run: PhysicalWallRunRecord,
  ptPerFt: number,
): number {
  const widthA = a.ownership.roughWidthFeet ?? 0;
  const widthB = b.ownership.roughWidthFeet ?? 0;
  const fitA = provisionalRoFitsOnRun(a.candidate, run, widthA, ptPerFt);
  const fitB = provisionalRoFitsOnRun(b.candidate, run, widthB, ptPerFt);
  if (fitA !== fitB) return fitA ? -1 : 1;

  const scoreA = a.ownership.matchScore ?? Number.POSITIVE_INFINITY;
  const scoreB = b.ownership.matchScore ?? Number.POSITIVE_INFINITY;
  if (scoreA !== scoreB) return scoreA < scoreB ? -1 : 1;

  const gapFitA = Math.abs(a.candidate.gapPt / ptPerFt - widthA);
  const gapFitB = Math.abs(b.candidate.gapPt / ptPerFt - widthB);
  if (gapFitA !== gapFitB) return gapFitA < gapFitB ? -1 : 1;
  return a.candidate.gapIndex - b.candidate.gapIndex;
}

function downgradeToAmbiguous(
  ownership: DimensionOwnershipResult,
  reason: string,
): DimensionOwnershipResult {
  return {
    status: "AMBIGUOUS",
    roughWidthFeet: null,
    nominalWidthFeet: null,
    dimId: ownership.dimId,
    textPrimitiveId: ownership.textPrimitiveId,
    originalText: ownership.originalText,
    matchScore: ownership.matchScore,
    notes: [...ownership.notes, reason],
  };
}

/**
 * Parent-run exclusivity: a single dimension text/dim may ESTABLISH at most one
 * gap on the same physical run. When provisional RO zones would overlap, keep
 * the better matchScore and downgrade the rest to AMBIGUOUS.
 */
export function applyParentRunDimensionExclusivity(
  entries: Array<{
    candidate: OpeningGapCandidate;
    ownership: DimensionOwnershipResult;
  }>,
  run: PhysicalWallRunRecord,
  ptPerFt: number,
): DimensionOwnershipResult[] {
  const results = entries.map((e) => e.ownership);

  // Pass 1: shared dim key → single winner (best matchScore, then gap size fit).
  const byDim = new Map<string, number[]>();
  for (let i = 0; i < entries.length; i++) {
    const key = dimKey(results[i]!);
    if (!key) continue;
    const list = byDim.get(key) ?? [];
    list.push(i);
    byDim.set(key, list);
  }

  for (const [, indices] of byDim) {
    if (indices.length < 2) continue;
    let winner = indices[0]!;
    for (const idx of indices.slice(1)) {
      if (
        compareExclusiveWinners(
          entries[idx]!,
          entries[winner]!,
          run,
          ptPerFt,
        ) < 0
      ) {
        winner = idx;
      }
    }
    for (const idx of indices) {
      if (idx === winner) continue;
      results[idx] = downgradeToAmbiguous(
        results[idx]!,
        `Dimension exclusivity: same dim already ESTABLISHED on sibling gap ${entries[winner]!.candidate.openingSubjectKey}.`,
      );
    }
  }

  // Pass 2: overlapping provisional RO zones among remaining ESTABLISHED.
  const established = results
    .map((ownership, index) => ({ ownership, index }))
    .filter(
      (e) =>
        e.ownership.status === "ESTABLISHED" &&
        e.ownership.roughWidthFeet != null,
    );

  for (let i = 0; i < established.length; i++) {
    for (let j = i + 1; j < established.length; j++) {
      const left = established[i]!;
      const right = established[j]!;
      if (
        results[left.index]!.status !== "ESTABLISHED" ||
        results[right.index]!.status !== "ESTABLISHED"
      ) {
        continue;
      }
      const a = entries[left.index]!;
      const b = entries[right.index]!;
      const widthA = a.ownership.roughWidthFeet!;
      const widthB = b.ownership.roughWidthFeet!;
      const leftA = provisionalLeftEdgeFeet(a.candidate, run, widthA, ptPerFt);
      const leftB = provisionalLeftEdgeFeet(b.candidate, run, widthB, ptPerFt);
      if (!roughOpeningZonesOverlap(leftA, widthA, leftB, widthB)) continue;

      const keepLeft =
        compareExclusiveWinners(a, b, run, ptPerFt) <= 0;
      const demote = keepLeft ? right.index : left.index;
      const keep = keepLeft ? left.index : right.index;
      results[demote] = downgradeToAmbiguous(
        results[demote]!,
        `Dimension exclusivity: provisional RO zone overlaps sibling gap ${entries[keep]!.candidate.openingSubjectKey}.`,
      );
    }
  }

  return results;
}

/**
 * Authority C — dimension observation belongs to opening.
 * Never uses nearest-dimension alone; requires geometric co-location with gap on run.
 */
export function governOpeningDimensionOwnership(
  page: CompiledDrawingPage,
  run: PhysicalWallRunRecord,
  candidate: OpeningGapCandidate,
): DimensionOwnershipResult {
  const ptPerFt = page.ptPerFt ?? 18;
  const runLengthFeet = run.lengthPt / ptPerFt;

  const textCandidates = collectImperialTextCandidates(
    page,
    run,
    candidate.gapAt,
  );
  const dimCandidates = collectTranscriptionDimCandidates(
    page,
    run,
    candidate.gapAt,
  );

  const merged = new Map<string, DimCandidate>();
  for (const c of [...textCandidates, ...dimCandidates]) {
    const key = `${c.textPrimitiveId}:${c.parsedFeet}`;
    if (!merged.has(key)) merged.set(key, c);
  }
  const candidates = [...merged.values()].filter(
    (c) => c.parsedFeet < runLengthFeet - 0.5,
  );

  if (candidates.length === 0) {
    return {
      status: "UNRESOLVED",
      roughWidthFeet: null,
      nominalWidthFeet: null,
      dimId: null,
      textPrimitiveId: null,
      originalText: null,
      matchScore: null,
      notes: [
        "No dimension text geometrically co-located with opening gap on parent run.",
      ],
    };
  }

  if (candidates.length > 1) {
    const withinTolerance = candidates.filter(
      (c) => c.axialDist < MAX_AXIAL_DIST_PT * 0.6,
    );
    if (withinTolerance.length === 1) {
      const winner = withinTolerance[0]!;
      return {
        status: "ESTABLISHED",
        roughWidthFeet: winner.parsedFeet,
        nominalWidthFeet: winner.parsedFeet,
        dimId: null,
        textPrimitiveId: winner.textPrimitiveId,
        originalText: winner.originalText,
        matchScore: winner.axialDist + winner.normalDist,
        notes: [
          `Single co-located dimension within tight axial band: ${winner.originalText}`,
        ],
      };
    }

    return {
      status: "AMBIGUOUS",
      roughWidthFeet: null,
      nominalWidthFeet: null,
      dimId: null,
      textPrimitiveId: null,
      originalText: null,
      matchScore: null,
      notes: [
        `${candidates.length} dimension candidates near gap; cannot establish unique opening width.`,
        ...candidates.slice(0, 3).map(
          (c) => `  candidate ${c.originalText} (${c.parsedFeet} ft, axial=${c.axialDist.toFixed(0)}pt)`,
        ),
      ],
    };
  }

  const winner = candidates[0]!;
  return {
    status: "ESTABLISHED",
    roughWidthFeet: winner.parsedFeet,
    nominalWidthFeet: winner.parsedFeet,
    dimId: null,
    textPrimitiveId: winner.textPrimitiveId,
    originalText: winner.originalText,
    matchScore: winner.axialDist + winner.normalDist,
    notes: [
      `Single co-located dimension: ${winner.originalText} (${winner.parsedFeet} ft).`,
    ],
  };
}
