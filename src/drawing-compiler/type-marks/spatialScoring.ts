import type { PbgRun, Point } from "../pbg/consolidatePhysicalRuns.js";

export function distPointToSeg(
  p: Point,
  seg: { x1: number; y1: number; x2: number; y2: number },
): number {
  const dx = seg.x2 - seg.x1;
  const dy = seg.y2 - seg.y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-6) {
    return Math.hypot(p.x - seg.x1, p.y - seg.y1);
  }
  const t = Math.max(
    0,
    Math.min(1, ((p.x - seg.x1) * dx + (p.y - seg.y1) * dy) / lenSq),
  );
  const px = seg.x1 + t * dx;
  const py = seg.y1 + t * dy;
  return Math.hypot(p.x - px, p.y - py);
}

export type MarkRunScore = {
  run: PbgRun;
  score: number;
  normalDist: number;
  axialOverlap: number;
};

/**
 * Score type-identifier text midpoint against PBG runs (mirrors dim ownership bands).
 */
export function scoreMarkAgainstRuns(
  mark: { mid: Point; orientation: "H" | "V" | "unknown" },
  runs: readonly PbgRun[],
): MarkRunScore[] {
  const candidates: MarkRunScore[] = [];

  for (const run of runs) {
    if (mark.orientation !== "unknown" && mark.orientation !== run.orientation) {
      continue;
    }

    const normalDist =
      run.orientation === "H"
        ? Math.abs(mark.mid.y - run.mid.y)
        : Math.abs(mark.mid.x - run.mid.x);
    if (normalDist < 5 || normalDist > 320) continue;

    const markLo =
      run.orientation === "H" ? mark.mid.x - 20 : mark.mid.y - 20;
    const markHi =
      run.orientation === "H" ? mark.mid.x + 20 : mark.mid.y + 20;
    const rLo =
      run.orientation === "H"
        ? Math.min(run.centerline.x1, run.centerline.x2)
        : Math.min(run.centerline.y1, run.centerline.y2);
    const rHi =
      run.orientation === "H"
        ? Math.max(run.centerline.x1, run.centerline.x2)
        : Math.max(run.centerline.y1, run.centerline.y2);
    const axialOverlap = Math.min(markHi, rHi) - Math.max(markLo, rLo);
    if (axialOverlap < 20) continue;

    const endProx = distPointToSeg(mark.mid, run.centerline);
    let extensionBonus = 0;
    if (endProx < 80) extensionBonus += 15;
    if (endProx < 30) extensionBonus += 15;

    const score =
      axialOverlap / (1 + normalDist * 0.04) +
      extensionBonus +
      (run.wallAuthority === "high" ? 10 : run.wallAuthority === "medium" ? 5 : 0);

    candidates.push({ run, score, normalDist, axialOverlap });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}
