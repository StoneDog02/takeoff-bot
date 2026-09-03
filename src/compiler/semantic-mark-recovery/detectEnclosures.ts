import type { Segment } from "../sgg/extractSegments.js";
import { segmentMid } from "./annotationSegments.js";

export type EnclosureCandidate = {
  id: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  mid: { x: number; y: number };
  segmentIds: number[];
  widthPt: number;
  heightPt: number;
};

/**
 * Cluster short annotation segments into near-rectangular enclosure bboxes.
 */
export function detectEnclosureCandidates(
  segments: readonly Segment[],
  pageNumber: number,
): EnclosureCandidate[] {
  const short = segments.filter((s) => s.length >= 4 && s.length <= 45 && s.strokeWidth <= 1.8);
  if (short.length === 0) return [];

  const used = new Set<number>();
  const enclosures: EnclosureCandidate[] = [];
  let clusterIdx = 0;

  for (const seed of short) {
    if (used.has(seed.id)) continue;
    const cluster: Segment[] = [seed];
    used.add(seed.id);
    const seedMid = segmentMid(seed);

    for (const other of short) {
      if (used.has(other.id)) continue;
      const om = segmentMid(other);
      if (Math.hypot(om.x - seedMid.x, om.y - seedMid.y) > 55) continue;
      cluster.push(other);
      used.add(other.id);
    }

    const xs = cluster.flatMap((s) => [s.x1, s.x2]);
    const ys = cluster.flatMap((s) => [s.y1, s.y2]);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const y0 = Math.min(...ys);
    const y1 = Math.max(...ys);
    const widthPt = x1 - x0;
    const heightPt = y1 - y0;

    if (widthPt < 6 || heightPt < 6) continue;
    if (widthPt > 120 || heightPt > 120) continue;
    const aspect = widthPt / Math.max(heightPt, 0.1);
    if (aspect < 0.15 || aspect > 8) continue;

    enclosures.push({
      id: `enc-p${pageNumber}-${clusterIdx++}`,
      bbox: { x0, y0, x1, y1 },
      mid: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 },
      segmentIds: cluster.map((s) => s.id),
      widthPt,
      heightPt,
    });
  }

  return dedupeEnclosures(enclosures);
}

function bboxIoU(
  a: EnclosureCandidate["bbox"],
  b: EnclosureCandidate["bbox"],
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

function dedupeEnclosures(list: EnclosureCandidate[]): EnclosureCandidate[] {
  const kept: EnclosureCandidate[] = [];
  for (const enc of list) {
    if (kept.some((k) => bboxIoU(k.bbox, enc.bbox) > 0.5)) continue;
    kept.push(enc);
  }
  return kept;
}
