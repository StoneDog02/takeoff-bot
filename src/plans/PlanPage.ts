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
}
