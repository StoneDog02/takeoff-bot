import type { PlanPage } from "./PlanPage.js";

export type PageBundleType =
  | "floor_plan"
  | "structural"
  | "detail"
  | "schedule"
  | "general_notes"
  | "reference"
  | "assumptions";

export interface PageBundlePageRef {
  pageNumber: number;
  sheetId: string | null;
  role: "primary" | "support" | "reference" | "schedule" | "notes" | "detail" | "structural";
}

export interface PageBundle {
  id: string;
  name: string;
  bundleType: PageBundleType;
  primaryPages: PageBundlePageRef[];
  supportPages: PageBundlePageRef[];
  referencePages: PageBundlePageRef[];
  schedulePages: PageBundlePageRef[];
  generalNotesPages: PageBundlePageRef[];
  detailPages: PageBundlePageRef[];
  structuralPages: PageBundlePageRef[];
  /** Cross-page references preserved within the bundle */
  crossReferences: Array<{
    fromPage: number;
    toPage: number;
    description: string;
  }>;
  /** Resolved page content for AI extraction (mocked for now) */
  pages: PlanPage[];
  notes: string[];
}
