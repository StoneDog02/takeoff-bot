import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveFloorAreaParentSystemLink } from "../../../src/scopes/framing/resolvers/resolveFloorAreaParentSystem.js";
import { buildBecksteadM5CrawlSpaceFloorEvidence } from "../../fixtures/becksteadM5FloorLayoutEvidence.js";

describe("resolveFloorAreaParentSystemLink", () => {
  it("links crawl area to crawl system by unique semantic bay slug", () => {
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
      explicitParentSystemTag: null,
      systemCandidates,
    });

    assert.ok(link);
    assert.equal(link.systemSubjectKey, "FLOOR-SYS-CRAWL-SPACE");
    assert.equal(link.method, "inferred-semantic-identity");
    assert.equal(link.requiresReview, true);
  });

  it("links space-separated M.4 crawl keys to the most specific matching system", () => {
    const evidence = buildBecksteadM5CrawlSpaceFloorEvidence().map((record) => ({
      ...record,
      subjectKey: record.subjectKey.replace(/-/g, " "),
    }));
    const areaRecords = evidence.filter(
      (record) => record.subjectKey === "FLOOR AREA CRAWL SPACE",
    );
    const systemCandidates = [
      {
        subjectKey: "FLOOR SYS CRAWL SPACE",
        records: evidence.filter(
          (record) => record.subjectKey === "FLOOR SYS CRAWL SPACE",
        ),
      },
      {
        subjectKey: "FLOOR SYS CRAWL",
        records: evidence.filter(
          (record) => record.subjectKey === "FLOOR SYS CRAWL",
        ),
      },
    ];

    const link = resolveFloorAreaParentSystemLink({
      areaSubjectKey: "FLOOR AREA CRAWL SPACE",
      areaRecords,
      explicitParentSystemTag: null,
      systemCandidates,
    });

    assert.ok(link);
    assert.equal(link.systemSubjectKey, "FLOOR SYS CRAWL SPACE");
    assert.equal(link.method, "inferred-semantic-identity");
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
