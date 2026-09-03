import type { Segment } from "../sgg/extractSegments.js";
import type { PbgRun } from "../pbg/consolidatePhysicalRuns.js";
import { distToRunMid } from "./classifyPlanAnnotation.js";

export type LineStyleAuditEntry = {
  id: string;
  strokeWidth: number;
  length: number;
  orientation: string;
  nearRunKey: string | null;
  distancePt: number | null;
  isHeavyLine: boolean;
};

/**
 * Sheet-wide stroke-width audit for graphic shear-wall convention detection.
 */
export function auditPlanLineStyles(input: {
  segments: readonly Segment[];
  pbgRuns: readonly PbgRun[];
  pageNumber: number;
  heavyThreshold?: number;
}): {
  entries: LineStyleAuditEntry[];
  heavyLineNearRunCount: number;
  strokeWidthMedian: number;
  strokeWidthP90: number;
} {
  const eligible = input.pbgRuns.filter(
    (r) => r.wallAuthority === "high" || r.wallAuthority === "medium",
  );
  const longSegs = input.segments.filter(
    (s) => s.length >= 20 && s.orientation !== "D",
  );
  const widths = longSegs.map((s) => s.strokeWidth).sort((a, b) => a - b);
  const median = widths[Math.floor(widths.length / 2)] ?? 0.5;
  const p90 = widths[Math.floor(widths.length * 0.9)] ?? median;
  const heavyThreshold = input.heavyThreshold ?? Math.max(median * 1.8, p90);

  const entries: LineStyleAuditEntry[] = [];
  let heavyLineNearRunCount = 0;

  for (const seg of longSegs) {
    const mid = { x: (seg.x1 + seg.x2) / 2, y: (seg.y1 + seg.y2) / 2 };
    let nearRunKey: string | null = null;
    let distancePt: number | null = null;
    for (const run of eligible) {
      const d = distToRunMid(mid, run);
      if (distancePt == null || d < distancePt) {
        distancePt = d;
        nearRunKey = run.physicalRunKey;
      }
    }
    const isHeavyLine = seg.strokeWidth >= heavyThreshold;
    if (isHeavyLine && distancePt != null && distancePt < 25) {
      heavyLineNearRunCount++;
    }
    entries.push({
      id: `line-p${input.pageNumber}-${seg.id}`,
      strokeWidth: seg.strokeWidth,
      length: seg.length,
      orientation: seg.orientation,
      nearRunKey,
      distancePt,
      isHeavyLine,
    });
  }

  return {
    entries,
    heavyLineNearRunCount,
    strokeWidthMedian: median,
    strokeWidthP90: p90,
  };
}
