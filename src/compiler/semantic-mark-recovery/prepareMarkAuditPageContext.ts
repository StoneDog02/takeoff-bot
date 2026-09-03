import {
  collapseParallelLanes,
  mergeCollinearOpeningSafe,
  annotateJunctions,
  annotateNearMissCorners,
  scoreAuthority,
  boostAuthorityFromJunctions,
  applyStubThroughAuthority,
  type B22DRun,
  type PbgRun,
} from "../pbg/consolidatePhysicalRuns.js";
import {
  extractSegments,
  filterFaceCandidates,
  discoverGapModes,
  pairWithinModes,
  buildRunsFromPairs,
  type PhysicalWallRunCandidate,
  type Segment,
} from "../sgg/extractSegments.js";
import { extractTextPrimitives } from "../text/extractTextPrimitives.js";
import type { TextPrimitive } from "../text/extractTextPrimitives.js";

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

export type MarkAuditPageContext = {
  pageWidth: number;
  pageHeight: number;
  segments: Segment[];
  pbgRuns: PbgRun[];
  primitives: TextPrimitive[];
  rawItemCount: number;
};

/**
 * Geometry + text context for Phase 0 visual mark audit (no transcription).
 */
export async function prepareMarkAuditPageContext(input: {
  pdfPath: string;
  pageNumber: number;
}): Promise<MarkAuditPageContext> {
  const textLayer = await extractTextPrimitives(input.pdfPath, input.pageNumber);
  const extracted = await extractSegments(input.pdfPath, input.pageNumber);
  const { pageWidth, pageHeight, segments } = extracted;
  const faces = filterFaceCandidates(segments, pageWidth, pageHeight);
  const byId = new Map(segments.map((s) => [s.id, s]));
  const hModes = discoverGapModes(faces, "H");
  const vModes = discoverGapModes(faces, "V");
  const pairs = [
    ...pairWithinModes(faces, hModes.modes, "H"),
    ...pairWithinModes(faces, vModes.modes, "V"),
  ];
  const physicalRuns = buildRunsFromPairs(pairs, byId, input.pageNumber);
  const asB22d: B22DRun[] = physicalRuns.map((r: PhysicalWallRunCandidate) => ({
    ...r,
    junctions: r.junctions,
  }));
  const lanes = collapseParallelLanes(asB22d);
  const merged = mergeCollinearOpeningSafe(lanes);
  let scored = scoreAuthority(merged, pageWidth);
  const juncTol = Math.max(
    18,
    median(merged.map((r) => r.thicknessPt ?? 5)) * 1.5,
  );
  annotateJunctions(scored, juncTol);
  annotateNearMissCorners(scored, 250, juncTol);
  boostAuthorityFromJunctions(scored);
  let rejected = scored.filter((r) => r.wallAuthority === "reject");
  let pbg = scored.filter((r) => r.wallAuthority !== "reject");
  const stub = applyStubThroughAuthority(pbg, rejected, { furnitureFpIds: [] });
  pbg = stub.pbg;

  return {
    pageWidth,
    pageHeight,
    segments,
    pbgRuns: pbg,
    primitives: textLayer.primitives,
    rawItemCount: textLayer.rawItemCount,
  };
}
