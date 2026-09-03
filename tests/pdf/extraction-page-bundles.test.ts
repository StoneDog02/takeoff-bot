import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveWallFraming } from "../../src/framing/resolve/resolveWallFraming.js";
import type { Evidence } from "../../src/core/schemas/evidence.schema.js";
import { aggregateExtractionEvidencePasses } from "../../src/pdf/aggregateExtractionEvidencePasses.js";
import {
  buildExtractionPageBundles,
  estimateBundleImageCount,
} from "../../src/pdf/buildExtractionPageBundles.js";
import { tryDeriveRoleAssignmentsFromClassification } from "../../src/pdf/deriveRoleAssignmentsFromPageClassification.js";
import type { PlanIndex } from "../../src/pdf/PlanIndex.js";
import { MAX_VISUAL_IMAGES_PER_EXTRACTION_REQUEST } from "../../src/pdf/visualImageBudget.js";
import { selectPagesForExtraction } from "../../src/framing/prompts/extractFramingEvidence.js";

function planIndexWithPages(pageCount: number): PlanIndex {
  return {
    pdfPath: "/tmp/synthetic.pdf",
    totalPages: pageCount,
    indexedAt: "2026-01-01T00:00:00.000Z",
    sourceContentHash: "a".repeat(64),
    pages: Array.from({ length: pageCount }, (_, index) => ({
      pageNumber: index + 1,
      sheetId: `S${index + 1}`,
      label: `Sheet ${index + 1}`,
      textContent: "",
    })),
  };
}

function wallEvidence(input: {
  id: string;
  subjectKey: string;
  propertyPath: string;
  candidateValue: string | number;
  pageNumber: number;
  tileId?: string | null;
}): Evidence {
  return {
    id: input.id,
    type: "note",
    relationship: "supports",
    description: "synthetic",
    source: {
      page: {
        documentId: null,
        pageNumber: input.pageNumber,
        sheetId: null,
        sheetTitle: null,
        pageLabel: null,
        revision: null,
      },
      region: null,
      tileId: input.tileId ?? null,
      elementLabel: null,
      detailNumber: null,
      sectionNumber: null,
      scheduleName: null,
      noteReference: null,
    },
    originalText: "synthetic",
    references: [],
    subjectKind: "wall",
    subjectKey: input.subjectKey,
    propertyPath: input.propertyPath,
    candidateValue: input.candidateValue,
    extractionPassId: null,
    bundleId: null,
  };
}

describe("buildExtractionPageBundles", () => {
  it("builds a deterministic primary+support+global bundle within image budget", () => {
    const planIndex = planIndexWithPages(8);
    const bundles = buildExtractionPageBundles({
      planIndex,
      scopeName: "framing",
      intent: "wall-framing",
      roleAssignments: [
        { pageNumber: 2, role: "primary", reason: "floor plan" },
        { pageNumber: 1, role: "global", reason: "notes" },
        { pageNumber: 5, role: "supporting", reason: "schedule" },
        { pageNumber: 7, role: "referenced", reason: "detail" },
      ],
    });

    assert.equal(bundles.length, 1);
    const bundle = bundles[0]!;
    assert.equal(
      bundle.bundleId,
      "bundle:framing:wall-framing:p2-5-7-1",
    );
    assert.deepEqual(bundle.orderedPageNumbers, [2, 5, 7, 1]);
    assert.equal(
      bundle.members.find((m) => m.role === "primary")?.visualDetailLevel,
      "full-page-and-tiles",
    );
    assert.ok(
      bundle.members
        .filter((m) => m.role !== "primary")
        .every((m) => m.visualDetailLevel === "full-page"),
    );
    assert.ok(
      bundle.imageBudget.estimatedImages <= MAX_VISUAL_IMAGES_PER_EXTRACTION_REQUEST,
    );
    assert.equal(
      bundle.imageBudget.estimatedImages,
      estimateBundleImageCount(bundle.members, 12),
    );
  });

  it("excludes unrelated pages and dedupes duplicate assignments", () => {
    const planIndex = planIndexWithPages(5);
    const bundles = buildExtractionPageBundles({
      planIndex,
      scopeName: "framing",
      intent: "roof-framing",
      roleAssignments: [
        { pageNumber: 3, role: "primary" },
        { pageNumber: 1, role: "global" },
        { pageNumber: 1, role: "global" },
      ],
    });
    assert.deepEqual(bundles[0]!.orderedPageNumbers, [3, 1]);
    assert.ok(!bundles[0]!.orderedPageNumbers.includes(2));
    assert.ok(!bundles[0]!.orderedPageNumbers.includes(4));
  });

  it("decomposes oversized support sets into sequential budgeted bundles", () => {
    const planIndex = planIndexWithPages(20);
    const supports = Array.from({ length: 10 }, (_, index) => ({
      pageNumber: index + 2,
      role: "supporting" as const,
    }));
    const bundles = buildExtractionPageBundles({
      planIndex,
      scopeName: "framing",
      intent: "floor-framing",
      roleAssignments: [{ pageNumber: 1, role: "primary" }, ...supports],
      maxImages: 20,
      tilesPerDetailedPage: 12,
    });

    // primary costs 13 → 7 supports per bundle → 10 supports => 2 bundles
    assert.equal(bundles.length, 2);
    assert.ok(
      bundles.every(
        (bundle) =>
          bundle.imageBudget.estimatedImages <= 20 &&
          bundle.members.some((m) => m.role === "primary" && m.pageNumber === 1),
      ),
    );
    const supportPages = new Set(
      bundles.flatMap((bundle) =>
        bundle.members
          .filter((m) => m.role === "supporting")
          .map((m) => m.pageNumber),
      ),
    );
    assert.equal(supportPages.size, 10);
  });

  it("fails clearly when a single detailed primary exceeds the budget", () => {
    const planIndex = planIndexWithPages(1);
    assert.throws(
      () =>
        buildExtractionPageBundles({
          planIndex,
          scopeName: "framing",
          intent: "wall-framing",
          roleAssignments: [{ pageNumber: 1, role: "primary" }],
          maxImages: 5,
          tilesPerDetailedPage: 12,
        }),
      /exceeding maxImages/,
    );
  });
});

describe("tryDeriveRoleAssignmentsFromClassification", () => {
  it("derives roles when classification has a single plan page", () => {
    const assignments = tryDeriveRoleAssignmentsFromClassification({
      intent: "wall-framing",
      pages: [
        { pageNumber: 1, pageType: "notes", relevantToFraming: true },
        { pageNumber: 2, pageType: "plan", relevantToFraming: true },
        { pageNumber: 3, pageType: "schedule", relevantToFraming: true },
        { pageNumber: 4, pageType: "other", relevantToFraming: false },
      ],
    });
    assert.ok(assignments);
    assert.deepEqual(
      assignments.map((a) => [a.pageNumber, a.role]),
      [
        [2, "primary"],
        [3, "supporting"],
        [1, "global"],
      ],
    );
  });

  it("returns null when page types are opaque/other only", () => {
    const assignments = tryDeriveRoleAssignmentsFromClassification({
      intent: "wall-framing",
      pages: [
        { pageNumber: 1, pageType: "other", relevantToFraming: true },
        { pageNumber: 2, pageType: "other", relevantToFraming: true },
      ],
    });
    assert.equal(assignments, null);
  });
});

describe("aggregateExtractionEvidencePasses", () => {
  it("merges multi-pass Evidence for the same subject into one graph", () => {
    const aggregated = aggregateExtractionEvidencePasses({
      passes: [
        {
          stamp: {
            extractionPassId: "pass-1",
            bundleId: "bundle:framing:wall-framing:p2",
          },
          evidence: [
            wallEvidence({
              id: "E-W1-TYPE",
              subjectKey: "W1",
              propertyPath: "wallType",
              candidateValue: "wood stud wall",
              pageNumber: 2,
              tileId: "t-r1-c1",
            }),
          ],
        },
        {
          stamp: {
            extractionPassId: "pass-2",
            bundleId: "bundle:framing:wall-framing:p2-5",
          },
          evidence: [
            wallEvidence({
              id: "E-W1-SPACING",
              subjectKey: "W1",
              propertyPath: "assembly.studSpacingInches",
              candidateValue: 16,
              pageNumber: 5,
            }),
          ],
        },
      ],
    });

    assert.equal(aggregated.length, 2);
    assert.equal(aggregated[0]?.extractionPassId, "pass-1");
    assert.equal(aggregated[0]?.bundleId, "bundle:framing:wall-framing:p2");
    assert.equal(aggregated[0]?.source.tileId, "t-r1-c1");
    assert.equal(aggregated[1]?.extractionPassId, "pass-2");

    const resolved = resolveWallFraming(aggregated);
    assert.equal(resolved.walls.length, 1);
    assert.equal(resolved.walls[0]?.assembly.studSpacingInches, 16);
  });

  it("preserves conflicting candidates for review instead of stitching winners", () => {
    const aggregated = aggregateExtractionEvidencePasses({
      passes: [
        {
          stamp: { extractionPassId: "pass-a", bundleId: "bundle-a" },
          evidence: [
            wallEvidence({
              id: "E-W1-SPACING-A",
              subjectKey: "W1",
              propertyPath: "assembly.studSpacingInches",
              candidateValue: 16,
              pageNumber: 2,
            }),
          ],
        },
        {
          stamp: { extractionPassId: "pass-b", bundleId: "bundle-b" },
          evidence: [
            wallEvidence({
              id: "E-W1-SPACING-B",
              subjectKey: "W1",
              propertyPath: "assembly.studSpacingInches",
              candidateValue: 24,
              pageNumber: 3,
            }),
          ],
        },
      ],
    });

    const resolved = resolveWallFraming(aggregated);
    assert.equal(resolved.walls.length, 1);
    // Conflict leaves spacing unresolved / reviewable rather than silently picking one.
    assert.equal(resolved.walls[0]?.assembly.studSpacingInches, null);
  });

  it("remaps duplicate evidence ids across passes while preserving both observations", () => {
    const aggregated = aggregateExtractionEvidencePasses({
      passes: [
        {
          stamp: { extractionPassId: "pass-a", bundleId: "b1" },
          evidence: [
            wallEvidence({
              id: "E-SW2-SHEATH",
              subjectKey: "SW2",
              propertyPath: "assembly.sheathing",
              candidateValue: "7/16 OSB",
              pageNumber: 1,
            }),
          ],
        },
        {
          stamp: { extractionPassId: "pass-b", bundleId: "b2" },
          evidence: [
            wallEvidence({
              id: "E-SW2-SHEATH",
              subjectKey: "SW2",
              propertyPath: "assembly.sheathing",
              candidateValue: "7/16 OSB",
              pageNumber: 1,
            }),
          ],
        },
      ],
    });

    assert.equal(aggregated.length, 2);
    assert.equal(aggregated[0]?.id, "E-SW2-SHEATH");
    assert.equal(aggregated[1]?.id, "E-SW2-SHEATH:pass-b");
    assert.equal(aggregated[0]?.extractionPassId, "pass-a");
    assert.equal(aggregated[1]?.extractionPassId, "pass-b");
    assert.equal(aggregated[0]?.source.page.pageNumber, 1);
    assert.equal(aggregated[1]?.source.page.pageNumber, 1);

    // Downstream resolution still yields one wall — repeated observations
    // corroborate rather than doubling subjects/quantities.
    const resolved = resolveWallFraming(aggregated);
    assert.equal(resolved.walls.length, 1);
    assert.equal(resolved.walls[0]?.assembly.sheathing, "7/16 OSB");
  });

  it("still rejects duplicate evidence ids within a single pass", () => {
    assert.throws(
      () =>
        aggregateExtractionEvidencePasses({
          passes: [
            {
              stamp: { extractionPassId: "pass-a", bundleId: "b1" },
              evidence: [
                wallEvidence({
                  id: "E-DUP",
                  subjectKey: "W1",
                  propertyPath: "wallType",
                  candidateValue: "a",
                  pageNumber: 1,
                }),
                wallEvidence({
                  id: "E-DUP",
                  subjectKey: "W1",
                  propertyPath: "wallType",
                  candidateValue: "b",
                  pageNumber: 1,
                }),
              ],
            },
          ],
        }),
      /within extraction pass/,
    );
  });
});

describe("Stage 5 bundle page selection", () => {
  it("limits extraction pages to the routed bundle order", () => {
    const planIndex = planIndexWithPages(6);
    const [bundle] = buildExtractionPageBundles({
      planIndex,
      scopeName: "framing",
      intent: "wall-framing",
      roleAssignments: [
        { pageNumber: 4, role: "primary" },
        { pageNumber: 1, role: "global" },
      ],
    });
    const selected = selectPagesForExtraction(
      planIndex,
      {
        pages: planIndex.pages.map((page) => ({
          pageNumber: page.pageNumber,
          sheetId: page.sheetId,
          discipline: "other",
          pageType: "other",
          relevantToFraming: true,
        })),
      },
      { orderedPageNumbers: [1, 2, 3, 4, 5, 6], rationale: ["all"] },
      bundle,
    );
    assert.deepEqual(
      selected.map((page) => page.pageNumber),
      bundle!.orderedPageNumbers,
    );
  });
});
