/**
 * Deterministic page-visual representation for multimodal Stage 5 input.
 *
 * Kept separate from PlanPage so text-layer indexing remains stable and
 * immutable, while visuals are an optional companion source channel.
 */
export interface PlanPageVisual {
  pageNumber: number;
  /** Absolute path of the source PDF that was rendered. */
  sourcePdfPath: string;
  /** Absolute path of the rendered page image on disk. */
  imagePath: string;
  mediaType: "image/png";
  widthPx: number;
  heightPx: number;
  /** pdf-to-img / pdf.js render scale (1 = 72 DPI CSS pixels). */
  scale: number;
  renderedAt: string;
}

export interface PlanVisualSet {
  sourcePdfPath: string;
  pages: PlanPageVisual[];
  renderedAt: string;
}
