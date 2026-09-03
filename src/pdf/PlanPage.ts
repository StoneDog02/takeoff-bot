export interface PlanPage {
  pageNumber: number;
  sheetId: string | null;
  label: string | null;
  /** Text-layer content extracted from the PDF page */
  textContent: string;
}

export interface PlanIndex {
  pdfPath: string;
  totalPages: number;
  pages: PlanPage[];
  indexedAt: string;
  /**
   * SHA-256 of source PDF bytes. Distinguishes visual-only plan sets that
   * share empty text layers. Null only for synthetic indexes that never
   * touched PDF bytes.
   */
  sourceContentHash: string | null;
}
