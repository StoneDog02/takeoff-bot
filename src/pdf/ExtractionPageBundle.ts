/**
 * Extraction-scoped page routing contracts.
 *
 * Visual tiles may split SOURCE VIEWS. Page bundles select SOURCE CONTEXT.
 * Neither splits the project-level construction model: Evidence from every
 * pass aggregates into one Evidence graph before resolution.
 */

export type ExtractionPageRole =
  | "primary"
  | "supporting"
  | "referenced"
  | "global";

/**
 * How much visual detail to attach for a routed page in one Stage 5 call.
 * - full-page-and-tiles: whole-sheet context + overlapping detail tiles
 * - full-page: whole-sheet context only (supports / globals)
 * - full-page-and-selected-tiles: whole-sheet + only selectedTileIds
 * - selected-tiles: only selectedTileIds (no full sheet)
 * - none: text-only / no visual channel
 */
export type PageVisualDetailLevel =
  | "full-page-and-tiles"
  | "full-page"
  | "full-page-and-selected-tiles"
  | "selected-tiles"
  | "none";

export interface ExtractionPageRoleAssignment {
  pageNumber: number;
  role: ExtractionPageRole;
  /** Optional human/system reason for auditability — not semantic construction content. */
  reason?: string;
}

export interface ExtractionPageBundleMember {
  pageNumber: number;
  role: ExtractionPageRole;
  visualDetailLevel: PageVisualDetailLevel;
  sheetId: string | null;
  label: string | null;
  reason: string;
  /**
   * When visualDetailLevel is selected-tiles or full-page-and-selected-tiles,
   * only these geometry tile ids are attached.
   */
  selectedTileIds?: string[] | null;
}

export interface ExtractionPageBundleImageBudget {
  maxImages: number;
  estimatedImages: number;
  tilesPerDetailedPage: number;
}

export interface ExtractionPageBundle {
  bundleId: string;
  scopeName: string;
  /** Scoped extraction intent key, e.g. "wall-framing" — not a construction object. */
  intent: string;
  members: ExtractionPageBundleMember[];
  /** Deterministic page order for Stage 5 content assembly. */
  orderedPageNumbers: number[];
  imageBudget: ExtractionPageBundleImageBudget;
  routingNotes: string[];
}

export interface ExtractionPassEvidenceStamp {
  extractionPassId: string;
  bundleId: string;
}
