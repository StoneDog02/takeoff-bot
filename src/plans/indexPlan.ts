import type { PlanIndex, PlanPage } from "./PlanIndex.js";

const MOCK_PAGE_TEMPLATES = [
  { sheetId: "A1.01", label: "Cover Sheet" },
  { sheetId: "A2.01", label: "Floor Plan - Level 1" },
  { sheetId: "A2.02", label: "Floor Plan - Level 2" },
  { sheetId: "S1.01", label: "Structural Plan - Level 1" },
  { sheetId: "A3.01", label: "Door & Window Schedule" },
  { sheetId: "A0.01", label: "General Notes" },
  { sheetId: "A4.01", label: "Wall Section Details" },
  { sheetId: "A4.02", label: "Header Details" },
];

function buildMockPageText(pageNumber: number, sheetId: string, label: string): string {
  const lines = [
    `Sheet: ${sheetId}`,
    `Title: ${label}`,
    `Page: ${pageNumber}`,
    "",
    "[MOCK PLAN TEXT — replace with real PDF extraction]",
    `Placeholder content for ${label}.`,
    "See structural sheet S1.01 for bearing walls.",
    "Refer to door schedule A3.01 for opening sizes.",
  ];

  if (sheetId === "A2.01") {
    lines.push(
      "",
      "[MOCK FIXTURE — EXPLICIT PROJECT VALUE]",
      "Wall W-001: new exterior non-bearing wood stud wall; length 20 ft; height 8 ft; studs 2x4 at 16 in O.C.; three plates; no openings.",
    );
  }

  return lines.join("\n");
}

/**
 * Mock PDF indexing — returns placeholder page text.
 * Designed so real PDF page content can replace textContent later.
 */
export async function indexPlan(pdfPath: string): Promise<PlanIndex> {
  const pages: PlanPage[] = MOCK_PAGE_TEMPLATES.map((template, index) => {
    const pageNumber = index + 1;
    return {
      pageNumber,
      sheetId: template.sheetId,
      label: template.label,
      textContent: buildMockPageText(pageNumber, template.sheetId, template.label),
    };
  });

  return {
    pdfPath,
    totalPages: pages.length,
    pages,
    indexedAt: new Date().toISOString(),
  };
}
