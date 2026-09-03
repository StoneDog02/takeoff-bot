import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveFloorAreaParentSystemLink } from "../../src/framing/resolve/resolveFloorAreaParentSystem.js";
import { buildBecksteadM5CrawlSpaceFloorEvidence } from "../fixtures/becksteadM5FloorLayoutEvidence.js";

describe("resolveFloorAreaParentSystemLink", () => {
  it("links crawl area to crawl system via explicit parentSystemTag evidence", () => {
    const evidence = buildBecksteadM5CrawlSpaceFloorEvidence();
    const areaRecords = evidence.filter(
      (record) => record.subjectKey === "FLOOR-AREA-CRAWL-SPACE",
    );
    const systemCandidates = [
      {
        subjectKey: "FLOOR-SYS-CRAWL-SPACE",
        records: evidence.filter(
          (record) => record.subjectKey === "FLOOR-SYS-CRAWL-SPACE",
        ),
      },
      {
        subjectKey: "FLOOR-SYS-CRAWL",
        records: evidence.filter(
          (record) => record.subjectKey === "FLOOR-SYS-CRAWL",
        ),
      },
    ];

    const link = resolveFloorAreaParentSystemLink({
      areaSubjectKey: "FLOOR-AREA-CRAWL-SPACE",
      areaRecords,
      explicitParentSystemTag: "FLOOR-SYS-CRAWL-SPACE",
      systemCandidates,
    });

    assert.ok(link);
    assert.equal(link.systemSubjectKey, "FLOOR-SYS-CRAWL-SPACE");
    assert.equal(link.method, "explicit-parent-system-tag");
    assert.equal(link.requiresReview, false);
    assert.ok(link.evidenceIds.includes("E-FFA-CRAWL-PARENT"));
  });

  it("fail-closes when only shared assembly callout corroborates without parentSystemTag", () => {
    const sharedText =
      '11.7/8" TJI 210 FLOOR JOISTS AT 16" O.C. OVER (MAX. SPAN = 17\'-0")';
    const source = {
      page: {
        documentId: null,
        pageNumber: 3,
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
        id: "E-AREA-SPAN",
        propertyPath: "joistMemberLengthFeet",
        originalText: sharedText,
        source,
      },
    ] as never;

    const systemCandidates = [
      {
        subjectKey: "FFS-CRAWL-SPACE-FLOOR-FRAMING",
        records: [{ id: "E-SYS-CALLOUT", originalText: sharedText, source }] as never,
      },
    ];

    const link = resolveFloorAreaParentSystemLink({
      areaSubjectKey: "FFA-BAY-CRAWLSPACE-MID",
      areaRecords,
      explicitParentSystemTag: null,
      systemCandidates,
    });

    assert.equal(link, null);
  });

  it("fail-closes when same-page shared elementLabel lacks parentSystemTag", () => {
    const source = {
      page: {
        documentId: null,
        pageNumber: 4,
        sheetId: null,
        sheetTitle: null,
        pageLabel: null,
        revision: null,
      },
      region: null,
      elementLabel: "MAIN FLOOR SYSTEM",
      detailNumber: null,
      sectionNumber: null,
      scheduleName: null,
      noteReference: null,
    };

    const areaRecords = [
      {
        id: "E-AREA-SF",
        propertyPath: "areaSquareFeet",
        originalText: "1621 SF",
        source,
      },
    ] as never;

    const systemCandidates = [
      {
        subjectKey: "FFS-MAIN-FLOOR-SYSTEM",
        records: [
          {
            id: "E-SYS-NOTE",
            propertyPath: "assembly.joistType",
            originalText: "floor joists",
            source,
          },
        ] as never,
      },
    ];

    const link = resolveFloorAreaParentSystemLink({
      areaSubjectKey: "FFA-MAIN-FLOOR-AREA",
      areaRecords,
      explicitParentSystemTag: null,
      systemCandidates,
    });

    assert.equal(link, null);
  });

  it("fail-closes when shared callout ties and semantic identity is ambiguous", () => {
    const sharedText =
      '11.7/8" TJI 210 FLOOR JOISTS AT 16" O.C. OVER (MAX. SPAN = 17\'-0")';
    const source = {
      page: {
        documentId: null,
        pageNumber: 3,
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
        id: "E-AREA-LAYOUT",
        propertyPath: "joistLayoutLengthFeet",
        originalText: sharedText,
        source,
      },
    ] as never;

    const systemCandidates = [
      {
        subjectKey: "FFS-BAY-A",
        records: [{ id: "E-A", originalText: sharedText, source }] as never,
      },
      {
        subjectKey: "FFS-BAY-B",
        records: [{ id: "E-B", originalText: sharedText, source }] as never,
      },
    ];

    const link = resolveFloorAreaParentSystemLink({
      areaSubjectKey: "FFA-UNRELATED-ZONE",
      areaRecords,
      explicitParentSystemTag: null,
      systemCandidates,
    });

    assert.equal(link, null);
  });
});
