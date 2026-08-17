import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { selectPagesForExtraction } from "../../src/scopes/framing/prompts/extractFramingEvidence.js";
import type { PlanIndex } from "../../src/plans/PlanIndex.js";

describe("extractFramingEvidence prompts", () => {
  it("selects framing-relevant pages in reading order", () => {
    const planIndex: PlanIndex = {
      pdfPath: "./plans/sample.pdf",
      totalPages: 3,
      indexedAt: new Date().toISOString(),
      pages: [
        {
          pageNumber: 1,
          sheetId: "A1.01",
          label: "Cover Sheet",
          textContent: "cover",
        },
        {
          pageNumber: 2,
          sheetId: "A2.01",
          label: "Floor Plan",
          textContent: "plan",
        },
        {
          pageNumber: 3,
          sheetId: "S1.01",
          label: "Structural Plan",
          textContent: "structural",
        },
      ],
    };

    const selected = selectPagesForExtraction(
      planIndex,
      {
        pages: [
          {
            pageNumber: 1,
            sheetId: "A1.01",
            discipline: "architectural",
            pageType: "cover",
            relevantToFraming: false,
          },
          {
            pageNumber: 2,
            sheetId: "A2.01",
            discipline: "architectural",
            pageType: "plan",
            relevantToFraming: true,
          },
          {
            pageNumber: 3,
            sheetId: "S1.01",
            discipline: "structural",
            pageType: "plan",
            relevantToFraming: true,
          },
        ],
      },
      {
        orderedPageNumbers: [3, 2, 1],
        rationale: ["structural before architectural"],
      },
    );

    assert.deepEqual(
      selected.map((page) => page.pageNumber),
      [3, 2],
    );
  });
});
