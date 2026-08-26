import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveSheathingAreaParentSystemLink } from "../../../src/scopes/framing/resolvers/resolveSheathingAreaParentSystem.js";

describe("resolveSheathingAreaParentSystemLink", () => {
  it("links via explicit parentSystemTag evidence", () => {
    const areaRecords = [
      {
        id: "E-AREA-PARENT",
        propertyPath: "parentSystemTag",
        originalText: "FLOOR SHEATHING SYSTEM",
        source: {
          page: { pageNumber: 1 },
          region: null,
          elementLabel: null,
        },
      },
    ] as never;

    const link = resolveSheathingAreaParentSystemLink({
      areaSubjectKey: "MAIN-FLOOR-AREA",
      areaRecords,
      explicitParentSystemTag: "FLOOR SHEATHING SYSTEM",
      systemCandidates: [
        {
          subjectKey: "FLOOR SHEATHING SYSTEM",
          records: [{ id: "E-SYS-NAME", originalText: "FLOOR SHEATHING SYSTEM" }] as never,
        },
      ],
    });

    assert.ok(link);
    assert.equal(link.method, "explicit-parent-system-tag");
    assert.equal(link.systemSubjectKey, "FLOOR SHEATHING SYSTEM");
    assert.equal(link.requiresReview, false);
  });

  it("fail-closes when Beckstead main floor area and floor system only share page-level global notes", () => {
    const globalNote =
      'FLOOR: 3/4" THICK TONGUE AND GROOVE OSB PANELS, GLUE AND NAIL ALL PANELS';
    const areaLabel = "MAIN FLOOR AREA = 1621 SQ. FT.";
    const source = {
      page: {
        documentId: null,
        pageNumber: 1,
        sheetId: null,
        sheetTitle: null,
        pageLabel: null,
        revision: null,
      },
      region: null,
      elementLabel: null,
      detailNumber: null,
      sectionNumber: null,
      scheduleName: null,
      noteReference: null,
    };

    const areaRecords = [
      {
        id: "E-MAINFLOOR-AREA-P4",
        propertyPath: "areaSquareFeet",
        originalText: areaLabel,
        source: { ...source, page: { ...source.page, pageNumber: 4 } },
      },
    ] as never;

    const systemCandidates = [
      {
        subjectKey: "FLOOR SHEATHING SYSTEM",
        records: [
          { id: "E-GLOBAL-FLOORSHEATHING-SPEC", originalText: globalNote, source },
        ] as never,
      },
      {
        subjectKey: "FLOOR SHEATHING",
        records: [
          { id: "E-FLOORSHEATHING-PANEL", originalText: globalNote, source },
        ] as never,
      },
    ];

    const link = resolveSheathingAreaParentSystemLink({
      areaSubjectKey: "MAIN-FLOOR-AREA",
      areaRecords,
      explicitParentSystemTag: null,
      systemCandidates,
    });

    assert.equal(link, null);
  });
});
