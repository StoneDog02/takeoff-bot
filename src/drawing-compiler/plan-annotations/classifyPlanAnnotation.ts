import type { EnclosureCandidate } from "../semantic-mark-recovery/detectEnclosures.js";
import type { PbgRun } from "../pbg/consolidatePhysicalRuns.js";

export type PlanConventionClass =
  | "textual-sw-mark"
  | "wall-type-tag"
  | "detail-callout"
  | "section-callout"
  | "door-window-tag"
  | "room-label"
  | "dimension-witness"
  | "grid-bubble"
  | "keyed-note"
  | "holdown-symbol"
  | "line-style-shear"
  | "legend"
  | "schedule-table-cell"
  | "title-block"
  | "unknown";

export type PlanAnnotationSample = {
  id: string;
  pageNumber: number;
  source: "enclosure" | "leader" | "line-style" | "keyed-note";
  bbox: { x0: number; y0: number; x1: number; y1: number };
  widthPt: number;
  heightPt: number;
  aspectRatio: number;
  nearRunKey: string | null;
  nearestRunDistPt: number | null;
  conventionClass: PlanConventionClass;
  framingSemanticRelevance: "high" | "medium" | "low" | "none";
  classificationRationale: string;
  ocrText?: string | null;
  normalizedKey?: string | null;
};

function distToRun(mid: { x: number; y: number }, run: PbgRun): number {
  const cl = run.centerline;
  const dx = cl.x2 - cl.x1;
  const dy = cl.y2 - cl.y1;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-6) return Math.hypot(mid.x - cl.x1, mid.y - cl.y1);
  const t = Math.max(
    0,
    Math.min(1, ((mid.x - cl.x1) * dx + (mid.y - cl.y1) * dy) / len2),
  );
  const px = cl.x1 + t * dx;
  const py = cl.y1 + t * dy;
  return Math.hypot(mid.x - px, mid.y - py);
}

/**
 * Research-informed plan annotation taxonomy (B2.2L.2-R / B2.2L.3 sheet-first).
 * Classifies graphical objects before leader pairing or OCR.
 */
export function classifyEnclosureAnnotation(input: {
  enc: EnclosureCandidate;
  pageNumber: number;
  pbgRuns: readonly PbgRun[];
  pageWidth: number;
  pageHeight: number;
  isSchedulePage: boolean;
}): PlanAnnotationSample {
  const { enc, pageNumber, pbgRuns, pageWidth, pageHeight, isSchedulePage } =
    input;
  const aspect = enc.widthPt / Math.max(enc.heightPt, 0.1);
  const eligible = pbgRuns.filter(
    (r) => r.wallAuthority === "high" || r.wallAuthority === "medium",
  );
  let nearRunKey: string | null = null;
  let nearestRunDistPt: number | null = null;
  for (const run of eligible) {
    const d = distToRun(enc.mid, run);
    if (nearestRunDistPt == null || d < nearestRunDistPt) {
      nearestRunDistPt = d;
      nearRunKey = run.physicalRunKey;
    }
  }

  let conventionClass: PlanConventionClass = "unknown";
  let framingSemanticRelevance: PlanAnnotationSample["framingSemanticRelevance"] =
    "none";
  let rationale = "";

  const inTitleBlock =
    enc.mid.x > pageWidth * 0.75 && enc.mid.y > pageHeight * 0.85;
  const inLegendZone =
    enc.mid.y > pageHeight * 0.88 || enc.mid.x > pageWidth * 0.88;
  const inScheduleZone =
    isSchedulePage &&
    enc.mid.y > pageHeight * 0.35 &&
    enc.mid.y < pageHeight * 0.92;

  if (inTitleBlock) {
    conventionClass = "title-block";
    rationale = "Located in title-block corner region.";
  } else if (inLegendZone && enc.widthPt > 30) {
    conventionClass = "legend";
    framingSemanticRelevance = "medium";
    rationale = "Plan margin / legend zone geometry.";
  } else if (inScheduleZone && enc.widthPt > 40 && enc.heightPt > 8 && enc.heightPt < 40) {
    conventionClass = "schedule-table-cell";
    framingSemanticRelevance = "high";
    rationale = "Schedule-page table band geometry (row-like cell).";
  } else if (
    enc.widthPt >= 14 &&
    enc.widthPt <= 55 &&
    enc.heightPt >= 14 &&
    enc.heightPt <= 55 &&
    aspect >= 0.6 &&
    aspect <= 1.6 &&
    nearestRunDistPt != null &&
    nearestRunDistPt < 50
  ) {
    conventionClass = "wall-type-tag";
    framingSemanticRelevance = "high";
    rationale =
      "Square-ish bubble near wall run — matches common SW/tag convention (R1).";
  } else if (
    enc.widthPt >= 20 &&
    enc.widthPt <= 90 &&
    enc.heightPt >= 20 &&
    enc.heightPt <= 90 &&
    aspect >= 0.7 &&
    aspect <= 1.4
  ) {
    conventionClass = "detail-callout";
    framingSemanticRelevance = "medium";
    rationale = "Medium circular/rect callout size typical of detail references.";
  } else if (enc.widthPt < 12 || enc.heightPt < 12) {
    conventionClass = "dimension-witness";
    rationale = "Very small stroke cluster — likely dimension tick or grid artifact.";
  } else if (enc.widthPt > 80 || enc.heightPt > 80) {
    conventionClass = "room-label";
    rationale = "Large enclosure — likely room name or note block, not wall tag.";
  } else if (nearestRunDistPt != null && nearestRunDistPt > 120) {
    conventionClass = "grid-bubble";
    rationale = "Far from any PBG run — likely grid or non-wall annotation.";
  } else {
    conventionClass = "unknown";
    rationale = "No research-backed rule matched.";
  }

  return {
    id: enc.id,
    pageNumber,
    source: "enclosure",
    bbox: enc.bbox,
    widthPt: enc.widthPt,
    heightPt: enc.heightPt,
    aspectRatio: aspect,
    nearRunKey,
    nearestRunDistPt,
    conventionClass,
    framingSemanticRelevance,
    classificationRationale: rationale,
  };
}

export function isWallTypeTagClass(sample: PlanAnnotationSample): boolean {
  return (
    sample.conventionClass === "wall-type-tag" ||
    sample.conventionClass === "textual-sw-mark"
  );
}

export function distToRunMid(
  mid: { x: number; y: number },
  run: PbgRun,
): number {
  return distToRun(mid, run);
}
