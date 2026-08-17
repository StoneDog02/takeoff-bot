import type { PageBundle } from "./PageBundle.js";
import type { PlanIndex } from "./PlanIndex.js";

function getPage(planIndex: PlanIndex, pageNumber: number) {
  const page = planIndex.pages.find((p) => p.pageNumber === pageNumber);
  if (!page) {
    throw new Error(`Page ${pageNumber} not found in plan index`);
  }
  return page;
}

/**
 * Builds page bundles that preserve cross-page references.
 * Mock implementation — real bundles will come from pageBundles stage output.
 */
export function buildPageBundles(planIndex: PlanIndex): PageBundle[] {
  return [
    {
      id: "bundle-level-1-framing",
      name: "Level 1 Framing Bundle",
      bundleType: "floor_plan",
      primaryPages: [{ pageNumber: 2, sheetId: "A2.01", role: "primary" }],
      supportPages: [
        { pageNumber: 4, sheetId: "S1.01", role: "structural" },
        { pageNumber: 5, sheetId: "A3.01", role: "schedule" },
      ],
      referencePages: [{ pageNumber: 6, sheetId: "A0.01", role: "notes" }],
      schedulePages: [{ pageNumber: 5, sheetId: "A3.01", role: "schedule" }],
      generalNotesPages: [{ pageNumber: 6, sheetId: "A0.01", role: "notes" }],
      detailPages: [
        { pageNumber: 7, sheetId: "A4.01", role: "detail" },
        { pageNumber: 8, sheetId: "A4.02", role: "detail" },
      ],
      structuralPages: [{ pageNumber: 4, sheetId: "S1.01", role: "structural" }],
      crossReferences: [
        { fromPage: 2, toPage: 4, description: "Floor plan references structural bearing walls" },
        { fromPage: 2, toPage: 5, description: "Floor plan references door/window schedule" },
        { fromPage: 2, toPage: 7, description: "Floor plan references wall section details" },
      ],
      pages: [2, 4, 5, 6, 7, 8].map((n) => getPage(planIndex, n)),
      notes: ["Mock bundle — cross-page references preserved for extraction stages"],
    },
  ];
}
