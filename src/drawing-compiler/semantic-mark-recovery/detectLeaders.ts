import type { PbgRun } from "../pbg/consolidatePhysicalRuns.js";
import type { Segment } from "../sgg/extractSegments.js";
import { distPointToSeg } from "../type-marks/spatialScoring.js";
import type { EnclosureCandidate } from "./detectEnclosures.js";
import { segmentMid } from "./annotationSegments.js";

export type LeaderCandidate = {
  id: string;
  segmentId: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  lengthPt: number;
  enclosureId: string | null;
  nearRunKey: string | null;
};

/**
 * Diagonal short segments connecting an enclosure (tail) to a PBG run endpoint (head).
 */
export function detectLeaderCandidates(input: {
  segments: readonly Segment[];
  enclosures: readonly EnclosureCandidate[];
  pbgRuns: readonly PbgRun[];
  pageNumber: number;
}): LeaderCandidate[] {
  const leaders: LeaderCandidate[] = [];
  let idx = 0;

  const eligibleRuns = input.pbgRuns.filter(
    (r) => r.wallAuthority === "high" || r.wallAuthority === "medium",
  );

  for (const seg of input.segments) {
    if (seg.orientation !== "D") continue;
    if (seg.length < 12 || seg.length > 180) continue;
    if (seg.strokeWidth > 1.2) continue;

    const a = { x: seg.x1, y: seg.y1 };
    const b = { x: seg.x2, y: seg.y2 };

    for (const enc of input.enclosures) {
      const distA = Math.hypot(a.x - enc.mid.x, a.y - enc.mid.y);
      const distB = Math.hypot(b.x - enc.mid.x, b.y - enc.mid.y);
      const tail = distA <= distB ? a : b;
      const head = distA <= distB ? b : a;
      if (Math.min(distA, distB) > 35) continue;

      let nearRunKey: string | null = null;
      let bestProx = Infinity;
      for (const run of eligibleRuns) {
        const prox = distPointToSeg(head, run.centerline);
        if (prox < bestProx && prox < 45) {
          bestProx = prox;
          nearRunKey = run.physicalRunKey;
        }
      }
      if (!nearRunKey) continue;

      leaders.push({
        id: `ldr-p${input.pageNumber}-${idx++}`,
        segmentId: seg.id,
        from: tail,
        to: head,
        lengthPt: seg.length,
        enclosureId: enc.id,
        nearRunKey,
      });
    }
  }

  return leaders;
}

export function leaderHeadMid(leader: LeaderCandidate): { x: number; y: number } {
  return leader.to;
}

export function leaderTailMid(leader: LeaderCandidate): { x: number; y: number } {
  return leader.from;
}
