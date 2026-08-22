/**
 * Deterministic overlapping page-tile geometry and cropped visual artifacts.
 *
 * Tiles are geometry-based (grid + overlap), not semantic region labels.
 * They preserve pageNumber provenance for multimodal Stage 5 input.
 */

export interface PlanPageVisualTileGeometry {
  /** Pixel origin on the source page image (top-left). */
  x: number;
  y: number;
  width: number;
  height: number;
  normalizedX: number;
  normalizedY: number;
  normalizedWidth: number;
  normalizedHeight: number;
  /** 0-based grid row. */
  row: number;
  /** 0-based grid column. */
  col: number;
  /** Overlap fraction used when the grid was computed (0–1). */
  overlapFraction: number;
  gridColumns: number;
  gridRows: number;
}

export interface PlanPageVisualTile {
  pageNumber: number;
  /**
   * Stable tile id within a page, e.g. `t-r0-c1`.
   * Deterministic from grid coordinates — not a semantic label.
   */
  tileId: string;
  sourcePdfPath: string;
  /** Full-page render this tile was cropped from. */
  sourcePageImagePath: string;
  imagePath: string;
  mediaType: "image/png";
  widthPx: number;
  heightPx: number;
  geometry: PlanPageVisualTileGeometry;
  renderedAt: string;
}

export interface PlanPageTileSet {
  pageNumber: number;
  sourcePdfPath: string;
  sourcePageImagePath: string;
  sourceWidthPx: number;
  sourceHeightPx: number;
  tiles: PlanPageVisualTile[];
  renderedAt: string;
}

/** Default landscape-friendly overlapping grid for construction sheets. */
export const DEFAULT_PAGE_TILE_GRID = {
  columns: 4,
  rows: 3,
  overlapFraction: 0.2,
} as const;

/**
 * Higher-resolution page render used as the crop source so tiles stay under
 * Claude's typical long-edge downscale while preserving fine callout detail.
 */
export const DEFAULT_PAGE_TILE_SOURCE_SCALE = 2;
