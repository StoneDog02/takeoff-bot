export interface PlanPage {
  pageNumber: number;
  sheetId: string | null;
  label: string | null;
  /** Placeholder text until real PDF parsing is implemented */
  textContent: string;
}

export interface PlanIndex {
  pdfPath: string;
  totalPages: number;
  pages: PlanPage[];
  indexedAt: string;
}
