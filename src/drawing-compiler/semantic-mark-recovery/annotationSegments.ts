import type { Segment } from "../sgg/extractSegments.js";

/** Short strokes discarded by face/run filters — mark enclosures, leaders, glyphs. */
export function extractAnnotationSegments(segments: readonly Segment[]): Segment[] {
  return segments.filter((s) => {
    if (s.length < 4 || s.length > 45) return false;
    if (s.strokeWidth > 1.8) return false;
    return true;
  });
}

export function segmentMid(s: Segment): { x: number; y: number } {
  return { x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 };
}
