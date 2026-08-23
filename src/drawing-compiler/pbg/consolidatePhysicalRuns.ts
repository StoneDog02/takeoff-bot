/**
 * B2.2G frozen PBG — copied from B2.2E (+ B2.2F stub authority).
 * Thresholds / scoring features unchanged. Claude=0.
 */
import { createHash } from "node:crypto";

export type Point = { x: number; y: number };

/** B2.2D-shaped physical run input (pre-PBG). */
export type B22DRun = {
  id: string;
  pageNumber: number;
  orientation: "H" | "V";
  faceSegmentIds: number[];
  facePairGapsPt: number[];
  thicknessPt: number | null;
  centerline: { x1: number; y1: number; x2: number; y2: number };
  endpoints: [Point, Point];
  connectedRunIds: string[];
  junctions: Array<{
    kind: string;
    at: Point;
    otherRunId?: string;
  }>;
  openingGapSuspects: Array<{ along: string; gapPt: number; at: Point }>;
  confidence: "high" | "medium" | "low";
  unresolvedReason: string | null;
  lengthPt: number;
  mid: Point;
};

export type PbgRun = {
  id: string;
  physicalRunKey: string;
  pageNumber: number;
  orientation: "H" | "V";
  sourceCandidateIds: string[];
  faceSegmentIds: number[];
  thicknessPt: number | null;
  centerline: { x1: number; y1: number; x2: number; y2: number };
  endpoints: [Point, Point];
  lengthPt: number;
  mid: Point;
  openingGapSuspects: B22DRun["openingGapSuspects"];
  junctions: Array<{
    kind: "corner" | "T" | "unknown" | "unresolved";
    at: Point;
    otherRunId?: string;
  }>;
  connectedRunIds: string[];
  wallAuthority: "high" | "medium" | "low" | "reject";
  authorityScore: number;
  authorityReasons: string[];
};

/** Minimal audit handle for B2.2F stub pass (furnitureFpIds may be empty). */
export type StubAudit = {
  furnitureFpIds: string[];
};

function midOf(c: { x1: number; y1: number; x2: number; y2: number }): Point {
  return { x: (c.x1 + c.x2) / 2, y: (c.y1 + c.y2) / 2 };
}

function axisRange(
  c: { x1: number; y1: number; x2: number; y2: number },
  ori: "H" | "V",
): { lo: number; hi: number; pos: number } {
  if (ori === "H") {
    return {
      lo: Math.min(c.x1, c.x2),
      hi: Math.max(c.x1, c.x2),
      pos: (c.y1 + c.y2) / 2,
    };
  }
  return {
    lo: Math.min(c.y1, c.y2),
    hi: Math.max(c.y1, c.y2),
    pos: (c.x1 + c.x2) / 2,
  };
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

function percentile(nums: number[], p: number): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.max(0, Math.min(s.length - 1, Math.floor(s.length * p)))]!;
}

export function hashIds(parts: string[]): string {
  return createHash("sha1").update(parts.sort().join("|")).digest("hex").slice(0, 12);
}

export function collapseParallelLanes(runs: B22DRun[]): B22DRun[] {
  const remaining = runs.map((r, i) => ({ r, i }));
  const used = new Set<number>();
  const out: B22DRun[] = [];

  for (let i = 0; i < remaining.length; i++) {
    if (used.has(i)) continue;
    const seed = remaining[i]!.r;
    const clusterIdx = [i];
    used.add(i);

    // Adaptive thickness for this seed from its own thickness
    const seedT = Math.max(seed.thicknessPt ?? 3, 2.5);

    let changed = true;
    while (changed) {
      changed = false;
      for (let j = 0; j < remaining.length; j++) {
        if (used.has(j)) continue;
        const r = remaining[j]!.r;
        if (r.orientation !== seed.orientation) continue;

        // Join if parallel-overlapping with ANY cluster member within thickness band
        let join = false;
        for (const ci of clusterIdx) {
          const c = remaining[ci]!.r;
          const ar = axisRange(c.centerline, c.orientation);
          const br = axisRange(r.centerline, r.orientation);
          const offset = Math.abs(ar.pos - br.pos);
          const thick = Math.max(c.thicknessPt ?? seedT, r.thicknessPt ?? seedT, seedT);
          // Nested ladder: offsets near 1× thickness of similar-thickness runs
          const similarThick =
            Math.abs((c.thicknessPt ?? 0) - (r.thicknessPt ?? 0)) <=
            Math.max(2, thick * 0.35);
          if (!similarThick && offset > 2) {
            // Allow joining if offset ≈ one of the thicknesses (nested face pairs)
            const nearThick =
              Math.abs(offset - (c.thicknessPt ?? thick)) < thick * 0.4 ||
              Math.abs(offset - (r.thicknessPt ?? thick)) < thick * 0.4;
            if (!nearThick && offset > thick * 1.35) continue;
          } else if (offset > thick * 1.35 && offset > 2.5) {
            continue;
          }
          const ov = Math.min(ar.hi, br.hi) - Math.max(ar.lo, br.lo);
          const minLen = Math.min(c.lengthPt, r.lengthPt);
          if (ov >= Math.max(30, minLen * 0.25)) {
            join = true;
            break;
          }
        }
        if (join) {
          clusterIdx.push(j);
          used.add(j);
          changed = true;
        }
      }
    }

    const cluster = clusterIdx.map((k) => remaining[k]!.r);
    if (cluster.length === 1) {
      out.push(cluster[0]!);
      continue;
    }

    // Collapse: outermost positions along normal axis
    const ori = seed.orientation;
    const positions = cluster.map((c) => axisRange(c.centerline, ori).pos);
    const minPos = Math.min(...positions);
    const maxPos = Math.max(...positions);
    const centerPos = (minPos + maxPos) / 2;
    const lo = Math.min(
      ...cluster.map((c) => axisRange(c.centerline, ori).lo),
    );
    const hi = Math.max(
      ...cluster.map((c) => axisRange(c.centerline, ori).hi),
    );
    const thickness = median(
      cluster.map((c) => c.thicknessPt ?? maxPos - minPos).filter((t) => t > 0),
    );
    // Prefer outer envelope thickness ≈ maxPos-minPos when nested ladder
    const envelopeThick = maxPos - minPos;
    const thicknessPt =
      envelopeThick >= 2
        ? Number(
            (
              cluster.find(
                (c) =>
                  Math.abs((c.thicknessPt ?? 0) - envelopeThick) <
                  envelopeThick * 0.35,
              )?.thicknessPt ??
              thickness ??
              envelopeThick
            ).toFixed(2),
          )
        : thickness;

    const centerline =
      ori === "H"
        ? { x1: lo, y1: centerPos, x2: hi, y2: centerPos }
        : { x1: centerPos, y1: lo, x2: centerPos, y2: hi };

    const faceIds = [
      ...new Set(cluster.flatMap((c) => c.faceSegmentIds)),
    ].sort((a, b) => a - b);
    const idHash = hashIds(cluster.map((c) => c.id));
    const openingGapSuspects = cluster.flatMap((c) => c.openingGapSuspects);

    out.push({
      id: `lane:${ori}:${idHash}`,
      pageNumber: seed.pageNumber,
      orientation: ori,
      faceSegmentIds: faceIds,
      facePairGapsPt: cluster.flatMap((c) => c.facePairGapsPt),
      thicknessPt,
      centerline,
      endpoints: [
        { x: centerline.x1, y: centerline.y1 },
        { x: centerline.x2, y: centerline.y2 },
      ],
      connectedRunIds: [],
      junctions: [],
      openingGapSuspects,
      confidence: cluster.some((c) => c.confidence === "high")
        ? "high"
        : cluster.some((c) => c.confidence === "medium")
          ? "medium"
          : "low",
      unresolvedReason: null,
      lengthPt: Number((hi - lo).toFixed(2)),
      mid: midOf(centerline),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Collinear opening-safe merge
// ---------------------------------------------------------------------------

export function mergeCollinearOpeningSafe(runs: B22DRun[]): B22DRun[] {
  const lengths = runs.map((r) => r.lengthPt);
  const mergeMax = Math.min(14, Math.max(4, median(lengths) * 0.04));
  const openingScale = Math.max(40, mergeMax * 4);

  const byOri: Record<"H" | "V", B22DRun[]> = { H: [], V: [] };
  for (const r of runs) byOri[r.orientation].push(r);

  const out: B22DRun[] = [];
  for (const ori of ["H", "V"] as const) {
    const list = byOri[ori];
    const used = new Set<number>();
    for (let i = 0; i < list.length; i++) {
      if (used.has(i)) continue;
      const seed = list[i]!;
      const cluster = [i];
      used.add(i);
      const seedPos = axisRange(seed.centerline, ori).pos;
      const seedT = seed.thicknessPt ?? 5;

      let changed = true;
      while (changed) {
        changed = false;
        const clo = Math.min(
          ...cluster.map((ci) => axisRange(list[ci]!.centerline, ori).lo),
        );
        const chi = Math.max(
          ...cluster.map((ci) => axisRange(list[ci]!.centerline, ori).hi),
        );
        const cpos =
          cluster.reduce(
            (s, ci) => s + axisRange(list[ci]!.centerline, ori).pos,
            0,
          ) / cluster.length;

        for (let j = 0; j < list.length; j++) {
          if (used.has(j)) continue;
          const r = list[j]!;
          const br = axisRange(r.centerline, ori);
          if (Math.abs(br.pos - cpos) > Math.max(2, seedT * 0.35)) continue;
          if (
            Math.abs((r.thicknessPt ?? seedT) - seedT) >
            Math.max(1.5, seedT * 0.3)
          )
            continue;
          // Adjacent or overlapping along axis
          const gap = Math.max(0, br.lo > chi ? br.lo - chi : clo - br.hi);
          const overlaps = !(br.hi < clo - mergeMax || br.lo > chi + mergeMax);
          if (!overlaps && gap > openingScale) continue;
          if (!overlaps && gap > mergeMax) {
            // fail closed — do not merge across medium/opening gap
            continue;
          }
          cluster.push(j);
          used.add(j);
          changed = true;
        }
      }

      const members = cluster.map((ci) => list[ci]!);
      if (members.length === 1) {
        out.push(members[0]!);
        continue;
      }

      // Check for opening-scale gaps inside span — if present, emit split pieces
      const sorted = [...members].sort(
        (a, b) =>
          axisRange(a.centerline, ori).lo - axisRange(b.centerline, ori).lo,
      );
      const chains: B22DRun[][] = [];
      let cur: B22DRun[] = [sorted[0]!];
      let curHi = axisRange(sorted[0]!.centerline, ori).hi;
      const openingSuspects: B22DRun["openingGapSuspects"] = [];

      for (let k = 1; k < sorted.length; k++) {
        const s = sorted[k]!;
        const r = axisRange(s.centerline, ori);
        const gap = r.lo - curHi;
        if (gap <= mergeMax || gap <= 0) {
          cur.push(s);
          curHi = Math.max(curHi, r.hi);
        } else {
          const at =
            ori === "H"
              ? { x: curHi + gap / 2, y: seedPos }
              : { x: seedPos, y: curHi + gap / 2 };
          openingSuspects.push({ along: "faceA", gapPt: gap, at });
          chains.push(cur);
          cur = [s];
          curHi = r.hi;
        }
      }
      chains.push(cur);

      for (const chain of chains) {
        const lo = Math.min(
          ...chain.map((c) => axisRange(c.centerline, ori).lo),
        );
        const hi = Math.max(
          ...chain.map((c) => axisRange(c.centerline, ori).hi),
        );
        const pos =
          chain.reduce((s, c) => s + axisRange(c.centerline, ori).pos, 0) /
          chain.length;
        const centerline =
          ori === "H"
            ? { x1: lo, y1: pos, x2: hi, y2: pos }
            : { x1: pos, y1: lo, x2: pos, y2: hi };
        const faceIds = [
          ...new Set(chain.flatMap((c) => c.faceSegmentIds)),
        ].sort((a, b) => a - b);
        out.push({
          id: `merge:${ori}:${hashIds(chain.map((c) => c.id))}`,
          pageNumber: seed.pageNumber,
          orientation: ori,
          faceSegmentIds: faceIds,
          facePairGapsPt: chain.flatMap((c) => c.facePairGapsPt),
          thicknessPt: median(
            chain.map((c) => c.thicknessPt ?? 0).filter((t) => t > 0),
          ),
          centerline,
          endpoints: [
            { x: centerline.x1, y: centerline.y1 },
            { x: centerline.x2, y: centerline.y2 },
          ],
          connectedRunIds: [],
          junctions: [],
          openingGapSuspects: [
            ...chain.flatMap((c) => c.openingGapSuspects),
            ...openingSuspects,
          ],
          confidence: chain.some((c) => c.confidence === "high")
            ? "high"
            : "medium",
          unresolvedReason: null,
          lengthPt: Number((hi - lo).toFixed(2)),
          mid: midOf(centerline),
        });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Junctions: centerline intersections + endpoint projections
// ---------------------------------------------------------------------------

function segmentIntersection(
  a: { x1: number; y1: number; x2: number; y2: number },
  b: { x1: number; y1: number; x2: number; y2: number },
): Point | null {
  const d =
    (a.x1 - a.x2) * (b.y1 - b.y2) - (a.y1 - a.y2) * (b.x1 - b.x2);
  if (Math.abs(d) < 1e-9) return null;
  const t =
    ((a.x1 - b.x1) * (b.y1 - b.y2) - (a.y1 - b.y1) * (b.x1 - b.x2)) / d;
  const u =
    ((a.x1 - b.x1) * (a.y1 - a.y2) - (a.y1 - b.y1) * (a.x1 - a.x2)) / d;
  // Allow slight extension beyond segment ends for projection tolerance
  if (t < -0.05 || t > 1.05 || u < -0.05 || u > 1.05) return null;
  return {
    x: a.x1 + t * (a.x2 - a.x1),
    y: a.y1 + t * (a.y2 - a.y1),
  };
}

function distPointToSeg(
  p: Point,
  s: { x1: number; y1: number; x2: number; y2: number },
): { dist: number; proj: Point; t: number } {
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((p.x - s.x1) * dx + (p.y - s.y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const proj = { x: s.x1 + t * dx, y: s.y1 + t * dy };
  return { dist: Math.hypot(p.x - proj.x, p.y - proj.y), proj, t };
}

export function annotateJunctions(runs: PbgRun[], tol: number): void {
  for (let i = 0; i < runs.length; i++) {
    const a = runs[i]!;
    for (let j = i + 1; j < runs.length; j++) {
      const b = runs[j]!;
      if (a.orientation === b.orientation) continue;

      const hit = segmentIntersection(a.centerline, b.centerline);
      if (hit) {
        // Corner if near both ends; T if interior of one
        const aEnd =
          Math.hypot(hit.x - a.endpoints[0].x, hit.y - a.endpoints[0].y) <
            tol * 1.5 ||
          Math.hypot(hit.x - a.endpoints[1].x, hit.y - a.endpoints[1].y) <
            tol * 1.5;
        const bEnd =
          Math.hypot(hit.x - b.endpoints[0].x, hit.y - b.endpoints[0].y) <
            tol * 1.5 ||
          Math.hypot(hit.x - b.endpoints[1].x, hit.y - b.endpoints[1].y) <
            tol * 1.5;
        let kind: "corner" | "T" | "unknown" = "unknown";
        if (aEnd && bEnd) kind = "corner";
        else if (aEnd !== bEnd) kind = "T";
        else kind = "T"; // crossing interior — treat as T-ish join
        a.junctions.push({ kind, at: hit, otherRunId: b.id });
        b.junctions.push({ kind, at: hit, otherRunId: a.id });
        if (!a.connectedRunIds.includes(b.id)) a.connectedRunIds.push(b.id);
        if (!b.connectedRunIds.includes(a.id)) b.connectedRunIds.push(a.id);
        continue;
      }

      // Endpoint → other centerline projection
      for (const ep of a.endpoints) {
        const d = distPointToSeg(ep, b.centerline);
        if (d.dist <= tol) {
          const nearBEnd = d.t < 0.08 || d.t > 0.92;
          const kind = nearBEnd ? "corner" : "T";
          a.junctions.push({ kind, at: ep, otherRunId: b.id });
          b.junctions.push({ kind, at: d.proj, otherRunId: a.id });
          if (!a.connectedRunIds.includes(b.id)) a.connectedRunIds.push(b.id);
          if (!b.connectedRunIds.includes(a.id)) b.connectedRunIds.push(a.id);
        }
      }
      for (const ep of b.endpoints) {
        const d = distPointToSeg(ep, a.centerline);
        if (d.dist <= tol) {
          const nearAEnd = d.t < 0.08 || d.t > 0.92;
          const kind = nearAEnd ? "corner" : "T";
          b.junctions.push({ kind, at: ep, otherRunId: a.id });
          a.junctions.push({ kind, at: d.proj, otherRunId: b.id });
          if (!a.connectedRunIds.includes(b.id)) a.connectedRunIds.push(b.id);
          if (!b.connectedRunIds.includes(a.id)) b.connectedRunIds.push(a.id);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Wall authority scoring
// ---------------------------------------------------------------------------

export function scoreAuthority(
  runs: B22DRun[],
  pageWidth: number,
): PbgRun[] {
  const lengths = runs.map((r) => r.lengthPt);
  const lenP50 = percentile(lengths, 0.5);
  const lenP75 = percentile(lengths, 0.75);

  // Building envelope from long vertical faces (plan height/width primary).
  // Horizontal dim strings above the V-envelope are excluded as non-wall.
  const vLong = runs.filter(
    (r) => r.orientation === "V" && r.lengthPt >= lenP75,
  );
  const hLong = runs.filter(
    (r) => r.orientation === "H" && r.lengthPt >= lenP75,
  );
  const vUse = vLong.length >= 2 ? vLong : runs.filter((r) => r.orientation === "V");
  const hUse = hLong.length >= 2 ? hLong : runs.filter((r) => r.orientation === "H");
  const env = {
    x0: Math.min(...vUse.map((r) => r.mid.x)),
    x1: Math.max(...vUse.map((r) => r.mid.x)),
    y0: Math.min(
      ...vUse.flatMap((r) => [r.centerline.y1, r.centerline.y2]),
    ),
    y1: Math.max(
      ...vUse.flatMap((r) => [r.centerline.y1, r.centerline.y2]),
    ),
  };
  // Expand X slightly using long H runs that sit within V y-span
  const hInSpan = hUse.filter(
    (r) => r.mid.y >= env.y0 - 20 && r.mid.y <= env.y1 + 20,
  );
  if (hInSpan.length > 0) {
    env.x0 = Math.min(
      env.x0,
      ...hInSpan.flatMap((r) => [r.centerline.x1, r.centerline.x2]),
    );
    env.x1 = Math.max(
      env.x1,
      ...hInSpan.flatMap((r) => [r.centerline.x1, r.centerline.x2]),
    );
  }

  // Thickness modes from candidates
  const thicks = runs
    .map((r) => r.thicknessPt)
    .filter((t): t is number => t != null && t >= 2);
  const modeBins = new Map<number, number>();
  for (const t of thicks) {
    const k = Math.round(t * 2) / 2;
    modeBins.set(k, (modeBins.get(k) ?? 0) + 1);
  }
  const topModes = [...modeBins.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([c]) => c);

  // Density grid for short runs
  const cell = Math.max(60, Math.min(100, (env.x1 - env.x0) / 20));
  const dens = new Map<string, number>();
  for (const r of runs) {
    if (r.lengthPt >= lenP50) continue;
    const k = `${Math.floor(r.mid.x / cell)},${Math.floor(r.mid.y / cell)}`;
    dens.set(k, (dens.get(k) ?? 0) + 1);
  }

  const pbg: PbgRun[] = runs.map((r) => {
    const reasons: string[] = [];
    let score = 0;

    // Length
    if (r.lengthPt >= lenP75) {
      score += 3;
      reasons.push("long");
    } else if (r.lengthPt >= lenP50) {
      score += 1.5;
      reasons.push("medium-length");
    } else if (r.lengthPt < 60) {
      score -= 2;
      reasons.push("short");
    }

    // Envelope extremes (exterior-ish)
    const nearWest = Math.abs(r.mid.x - env.x0) < 40;
    const nearEast = Math.abs(r.mid.x - env.x1) < 40;
    const nearSouth = Math.abs(r.mid.y - env.y0) < 40;
    const nearNorth = Math.abs(r.mid.y - env.y1) < 40;
    if (nearWest || nearEast || nearSouth || nearNorth) {
      score += 2.5;
      reasons.push("envelope");
    }

    // Thickness mode support
    const t = r.thicknessPt ?? 0;
    const onEnvelope = nearWest || nearEast || nearSouth || nearNorth;
    if (t > 0 && topModes.some((m) => Math.abs(m - t) <= 1.0)) {
      score += 1.5;
      reasons.push("thickness-mode");
    }
    // Thin pairs are usually annotation / furniture doubles — reject unless
    // clearly on the building envelope (generic, not Beckstead-specific).
    if (t > 0 && t < 2.5) {
      score -= 5;
      reasons.push("thin");
      if (!onEnvelope) {
        score -= 3;
        reasons.push("thin-interior");
      }
    }

    // Density penalty (furniture)
    const dk = `${Math.floor(r.mid.x / cell)},${Math.floor(r.mid.y / cell)}`;
    const d = dens.get(dk) ?? 0;
    if (d >= 5 && r.lengthPt < lenP50) {
      score -= 3;
      reasons.push("dense-short");
    } else if (d >= 3 && r.lengthPt < 100) {
      score -= 1.5;
      reasons.push("moderate-density");
    }

    // Interior: not on envelope, many local short neighbors → non-wall cluster
    const interior =
      r.mid.x > env.x0 + 60 &&
      r.mid.x < env.x1 - 60 &&
      r.mid.y > env.y0 + 60 &&
      r.mid.y < env.y1 - 60;
    if (interior && d >= 4 && r.lengthPt < 150) {
      score -= 2.5;
      reasons.push("interior-dense");
    }

    // Title strip
    if (r.mid.x > env.x1 + 80 && r.mid.x > pageWidth * 0.82) {
      score -= 5;
      reasons.push("title-strip");
    }

    // Outside building envelope → annotation / dim strings (generic)
    const outsideEnv =
      r.mid.x < env.x0 - 50 ||
      r.mid.x > env.x1 + 50 ||
      r.mid.y < env.y0 - 50 ||
      r.mid.y > env.y1 + 50;
    if (outsideEnv) {
      score -= 4;
      reasons.push("outside-envelope");
    }

    // Dim-band-like: H outside envelope north/south
    if (
      r.orientation === "H" &&
      (r.mid.y > env.y1 + 50 || r.mid.y < env.y0 - 50)
    ) {
      score -= 3;
      reasons.push("exterior-dim-like");
    }

    // Opening suspects on long runs: mild plus (real walls have openings)
    if (r.openingGapSuspects.length > 0 && r.lengthPt >= lenP50) {
      score += 0.5;
      reasons.push("opening-suspect");
    }

    // Hard reject: thin interior (furniture/annotation doubles) or dim-like bands
    let wallAuthority: PbgRun["wallAuthority"];
    if (
      reasons.includes("thin-interior") ||
      reasons.includes("title-strip") ||
      reasons.includes("exterior-dim-like") ||
      reasons.includes("outside-envelope")
    ) {
      wallAuthority = "reject";
    } else if (score >= 4) wallAuthority = "high";
    else if (score >= 2) wallAuthority = "medium";
    else if (score >= 0.5) wallAuthority = "low";
    else wallAuthority = "reject";

    const physicalRunKey = `physical-run:p${r.pageNumber}:${hashIds([r.id, ...r.faceSegmentIds.map(String)])}`;

    return {
      id: r.id,
      physicalRunKey,
      pageNumber: r.pageNumber,
      orientation: r.orientation,
      sourceCandidateIds: [r.id],
      faceSegmentIds: r.faceSegmentIds,
      thicknessPt: r.thicknessPt,
      centerline: r.centerline,
      endpoints: r.endpoints,
      lengthPt: r.lengthPt,
      mid: r.mid,
      openingGapSuspects: r.openingGapSuspects,
      junctions: [],
      connectedRunIds: [],
      wallAuthority,
      authorityScore: Number(score.toFixed(2)),
      authorityReasons: reasons,
    };
  });

  // Second pass: boost junction degree after junctions annotated — done later
  return pbg;
}

export function boostAuthorityFromJunctions(runs: PbgRun[]): void {
  for (const r of runs) {
    if (
      r.authorityReasons.includes("thin-interior") ||
      r.authorityReasons.includes("title-strip") ||
      r.authorityReasons.includes("exterior-dim-like") ||
      r.authorityReasons.includes("outside-envelope")
    ) {
      r.wallAuthority = "reject";
      continue;
    }
    const deg = new Set(r.connectedRunIds).size;
    if (deg >= 2) {
      r.authorityScore += 2;
      r.authorityReasons.push("multi-junction");
    } else if (deg === 1) {
      r.authorityScore += 1;
      r.authorityReasons.push("junction");
    }
    if (r.wallAuthority === "reject" && r.authorityScore >= 2) {
      if (
        !r.authorityReasons.includes("dense-short") &&
        !r.authorityReasons.includes("thin-interior")
      ) {
        r.wallAuthority = "low";
      }
    }
    if (r.authorityScore >= 4 && r.wallAuthority !== "reject") {
      r.wallAuthority = "high";
    } else if (r.authorityScore >= 2 && r.wallAuthority !== "reject") {
      if (r.wallAuthority !== "high") r.wallAuthority = "medium";
    }
  }
}

/**
 * Near-miss corner: orthogonal runs whose endpoints are close in the
 * perpendicular sense but axially gapped (common at opening / step corners).
 * Tags unresolved corner without inventing geometry continuity.
 */
export function annotateNearMissCorners(runs: PbgRun[], axialGapMax: number, perpTol: number): void {
  for (let i = 0; i < runs.length; i++) {
    const a = runs[i]!;
    for (let j = i + 1; j < runs.length; j++) {
      const b = runs[j]!;
      if (a.orientation === b.orientation) continue;
      for (const ea of a.endpoints) {
        for (const eb of b.endpoints) {
          const dx = Math.abs(ea.x - eb.x);
          const dy = Math.abs(ea.y - eb.y);
          // One axis nearly meets, other has a gap (step / missing segment)
          const near =
            (dx <= perpTol && dy > perpTol && dy <= axialGapMax) ||
            (dy <= perpTol && dx > perpTol && dx <= axialGapMax);
          if (!near) continue;
          const already = a.junctions.some(
            (junc) =>
              junc.otherRunId === b.id &&
              Math.hypot(junc.at.x - ea.x, junc.at.y - ea.y) < perpTol,
          );
          if (already) continue;
          const at = { x: (ea.x + eb.x) / 2, y: (ea.y + eb.y) / 2 };
          a.junctions.push({ kind: "unresolved", at, otherRunId: b.id });
          b.junctions.push({ kind: "unresolved", at, otherRunId: a.id });
          if (!a.connectedRunIds.includes(b.id)) a.connectedRunIds.push(b.id);
          if (!b.connectedRunIds.includes(a.id)) b.connectedRunIds.push(a.id);
        }
      }
    }
  }
}

export function applyStubThroughAuthority(
  pbg: PbgRun[],
  rejected: PbgRun[],
  audit: StubAudit,
): { pbg: PbgRun[]; rejected: PbgRun[]; movedToReject: string[] } {
  const byId = new Map([...pbg, ...rejected].map((r) => [r.id, r]));
  const lengths = pbg.map((r) => r.lengthPt);
  const lenMed = median(lengths);
  const lenP25 = percentile(lengths, 0.25);
  const movedToReject: string[] = [];

  // Apply globally (not only furniture box): rejected-band stub rule
  const stillPbg: PbgRun[] = [];
  for (const r of pbg) {
    // Audit-classified furniture FPs always sink (do not allow nearby H
    // piggyback to count as through-connector KEEP).
    const auditFp = audit.furnitureFpIds.includes(r.id);

    const pbgNeighbors = r.connectedRunIds
      .map((id) => byId.get(id))
      .filter((n): n is PbgRun => !!n && n.wallAuthority !== "reject" && n.id !== r.id);
    const highFar = pbgNeighbors.filter(
      (n) =>
        (n.wallAuthority === "high" || n.lengthPt >= lenMed) &&
        Math.hypot(n.mid.x - r.mid.x, n.mid.y - r.mid.y) > 150,
    );
    const spanExit =
      r.endpoints.some(
        (e) => Math.hypot(e.x - r.mid.x, e.y - r.mid.y) > r.lengthPt * 0.4,
      ) && r.lengthPt >= lenMed * 0.5;
    const throughKeep =
      !auditFp && (r.lengthPt >= lenMed || (highFar.length >= 1 && spanExit));

    if (throughKeep) {
      stillPbg.push(r);
      continue;
    }

    const rejNeighbors = r.connectedRunIds
      .map((id) => byId.get(id))
      .filter((n): n is PbgRun => !!n && n.wallAuthority === "reject");
    const thinRej = rejNeighbors.filter(
      (n) =>
        (n.thicknessPt ?? 99) < 2.5 ||
        n.authorityReasons.some((x) => x.includes("thin")),
    );
    const short = r.lengthPt <= lenP25 || r.lengthPt < 120;
    const pbgDeg = pbgNeighbors.length;
    const thinRatio = thinRej.length / Math.max(1, r.connectedRunIds.length);

    if (
      auditFp ||
      (short && thinRatio >= 0.4 && pbgDeg <= 2 && thinRej.length >= 2)
    ) {
      const copy = {
        ...r,
        wallAuthority: "reject" as const,
        authorityReasons: [...r.authorityReasons, "rejected-band-stub"],
        authorityScore: r.authorityScore - 4,
      };
      rejected.push(copy);
      movedToReject.push(r.id);
    } else {
      stillPbg.push(r);
    }
  }

  return { pbg: stillPbg, rejected, movedToReject };
}

