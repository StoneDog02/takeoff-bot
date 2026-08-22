import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { resolveWallFraming } from "../../src/scopes/framing/resolvers/resolveWallFraming.js";
import type { Evidence } from "../../src/core/schemas/evidence.schema.js";
import { aggregateExtractionEvidencePasses } from "../../src/plans/aggregateExtractionEvidencePasses.js";
import {
  buildSequentialExtractionPageBundles,
  deriveRoleAssignmentsFromPageClassification,
  listPrimaryCandidatesForIntent,
  planIntentExtractionRouting,
} from "../../src/plans/deriveRoleAssignmentsFromPageClassification.js";
import {
  classifiedPlanPageSchema,
  type ClassifiedPlanPage,
  type PageContentRole,
  type PageKind,
  type PageScopeHint,
} from "../../src/plans/pageClassification.js";
import type { PlanIndex } from "../../src/plans/PlanIndex.js";
import { MAX_VISUAL_IMAGES_PER_EXTRACTION_REQUEST } from "../../src/plans/visualImageBudget.js";

function classified(
  overrides: Partial<ClassifiedPlanPage> & {
    pageNumber: number;
    pageKind: PageKind;
  },
): ClassifiedPlanPage {
  const contentRoles: PageContentRole[] =
    overrides.contentRoles ??
    (overrides.pageKind === "plan" || overrides.pageKind === "framing-plan"
      ? ["plan-layout"]
      : overrides.pageKind === "notes"
        ? ["notes"]
        : overrides.pageKind === "schedule"
          ? ["schedule"]
          : overrides.pageKind === "detail"
            ? ["detail"]
            : overrides.pageKind === "elevation"
              ? ["elevation"]
              : []);
  return classifiedPlanPageSchema.parse({
    pageNumber: overrides.pageNumber,
    sheetId: overrides.sheetId ?? `S${overrides.pageNumber}`,
    label: overrides.label ?? `Sheet ${overrides.pageNumber}`,
    pageKind: overrides.pageKind,
    scopeHints: overrides.scopeHints ?? [],
    contentRoles,
    discipline: overrides.discipline ?? "other",
    pageType: overrides.pageType ?? "other",
    relevantToFraming: overrides.relevantToFraming ?? true,
    needsVisualClassification: overrides.needsVisualClassification ?? false,
    classificationMethod: overrides.classificationMethod ?? "text",
    titleOrLabel: overrides.titleOrLabel ?? null,
    evidenceText: overrides.evidenceText ?? "synthetic",
    classificationReason: overrides.classificationReason ?? "test",
    confidenceLabel: overrides.confidenceLabel ?? "high",
  });
}

function planIndexFromPages(pages: ClassifiedPlanPage[]): PlanIndex {
  return {
    pdfPath: "/tmp/synthetic.pdf",
    totalPages: pages.length,
    indexedAt: "2026-01-01T00:00:00.000Z",
    sourceContentHash: "a".repeat(64),
    pages: pages.map((page) => ({
      pageNumber: page.pageNumber,
      sheetId: page.sheetId,
      label: page.label,
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
      tileId: null,
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

describe("B1.5A multi-primary + mixed-page routing", () => {
  it("one primary → one bundle", () => {
    const pages = [
      classified({
        pageNumber: 2,
        pageKind: "framing-plan",
        scopeHints: ["floor", "framing"],
        pageType: "plan",
      }),
      classified({
        pageNumber: 1,
        pageKind: "notes",
        scopeHints: ["general", "structural"],
        pageType: "notes",
      }),
    ];
    const plan = planIntentExtractionRouting({
      pages,
      intent: "floor-framing",
    });
    assert.equal(plan.routingSafe, true);
    assert.deepEqual(plan.primaryPageNumbers, [2]);
    const bundles = buildSequentialExtractionPageBundles({
      planIndex: planIndexFromPages(pages),
      scopeName: "framing",
      routingPlan: plan,
    });
    assert.equal(bundles.length, 1);
    assert.equal(bundles[0]!.members.filter((m) => m.role === "primary").length, 1);
    assert.ok(
      bundles[0]!.imageBudget.estimatedImages <=
        MAX_VISUAL_IMAGES_PER_EXTRACTION_REQUEST,
    );
  });

  it("two valid primaries → two sequential bundles sharing global support", () => {
    const pages = [
      classified({
        pageNumber: 1,
        pageKind: "mixed",
        scopeHints: ["structural", "general"],
        contentRoles: ["notes", "schedule", "index"],
        pageType: "other",
      }),
      classified({
        pageNumber: 3,
        pageKind: "framing-plan",
        scopeHints: ["floor", "framing", "structural"],
        pageType: "plan",
      }),
      classified({
        pageNumber: 4,
        pageKind: "plan",
        scopeHints: ["floor", "architectural", "structural"],
        pageType: "plan",
      }),
      classified({
        pageNumber: 9,
        pageKind: "detail",
        scopeHints: ["framing", "floor"],
        pageType: "detail",
      }),
    ];
    const plan = planIntentExtractionRouting({
      pages,
      intent: "wall-framing",
    });
    assert.deepEqual(plan.primaryPageNumbers, [3, 4]);
    assert.ok(
      plan.sharedSupportAssignments.some(
        (assignment) =>
          assignment.pageNumber === 1 && assignment.role === "global",
      ),
    );
    assert.ok(!plan.primaryPageNumbers.includes(1));
    assert.ok(plan.excludedPageNumbers.includes(9));

    const bundles = buildSequentialExtractionPageBundles({
      planIndex: planIndexFromPages(pages),
      scopeName: "framing",
      routingPlan: plan,
    });
    assert.equal(bundles.length, 2);
    assert.deepEqual(
      bundles.map((bundle) =>
        bundle.members.find((member) => member.role === "primary")?.pageNumber,
      ),
      [3, 4],
    );
    assert.ok(
      bundles.every((bundle) =>
        bundle.members.some(
          (member) => member.pageNumber === 1 && member.role === "global",
        ),
      ),
    );
    assert.ok(
      bundles.every(
        (bundle) =>
          bundle.imageBudget.estimatedImages <=
          MAX_VISUAL_IMAGES_PER_EXTRACTION_REQUEST,
      ),
    );
    assert.ok(!bundles[0]!.members.some((member) => member.pageNumber === 9));
  });

  it("mixed plan-layout page can be primary; mixed notes/schedule cannot", () => {
    const pages = [
      classified({
        pageNumber: 1,
        pageKind: "mixed",
        scopeHints: ["structural", "general", "wall"],
        contentRoles: ["notes", "schedule"],
        pageType: "other",
      }),
      classified({
        pageNumber: 5,
        pageKind: "mixed",
        scopeHints: ["roof", "structural"],
        contentRoles: ["plan-layout"],
        pageType: "other",
      }),
      classified({
        pageNumber: 8,
        pageKind: "mixed",
        scopeHints: ["architectural"],
        contentRoles: ["index"],
        relevantToFraming: false,
        pageType: "other",
      }),
    ];
    const roof = planIntentExtractionRouting({
      pages,
      intent: "roof-framing",
    });
    assert.deepEqual(roof.primaryPageNumbers, [5]);
    assert.ok(
      roof.sharedSupportAssignments.some(
        (assignment) => assignment.pageNumber === 1,
      ),
    );
    assert.ok(roof.excludedPageNumbers.includes(8));
    assert.equal(
      listPrimaryCandidatesForIntent({ pages, intent: "wall-framing" }).length,
      0,
    );
  });

  it("detail pages are not auto-included from scopeHints alone", () => {
    const pages = [
      classified({
        pageNumber: 2,
        pageKind: "framing-plan",
        scopeHints: ["floor", "framing"],
        pageType: "plan",
      }),
      classified({
        pageNumber: 8,
        pageKind: "detail",
        scopeHints: ["framing", "floor", "structural"],
        pageType: "detail",
      }),
    ];
    const plan = planIntentExtractionRouting({
      pages,
      intent: "floor-framing",
    });
    assert.deepEqual(plan.primaryPageNumbers, [2]);
    assert.ok(plan.excludedPageNumbers.includes(8));
    assert.equal(plan.sharedSupportAssignments.length, 0);
  });

  it("aggregates Evidence from sequential primary passes before resolution", () => {
    const aggregated = aggregateExtractionEvidencePasses({
      passes: [
        {
          stamp: {
            extractionPassId: "pass-primary-3",
            bundleId: "bundle:framing:wall-framing:p3-1",
          },
          evidence: [
            wallEvidence({
              id: "E-W1-TYPE",
              subjectKey: "W1",
              propertyPath: "wallType",
              candidateValue: "wood stud wall",
              pageNumber: 3,
            }),
          ],
        },
        {
          stamp: {
            extractionPassId: "pass-primary-4",
            bundleId: "bundle:framing:wall-framing:p4-1",
          },
          evidence: [
            wallEvidence({
              id: "E-W1-SPACING",
              subjectKey: "W1",
              propertyPath: "assembly.studSpacingInches",
              candidateValue: 16,
              pageNumber: 4,
            }),
          ],
        },
      ],
    });
    const resolved = resolveWallFraming(aggregated);
    assert.equal(resolved.walls.length, 1);
    assert.equal(resolved.walls[0]?.assembly.studSpacingInches, 16);
  });

  it("preserves cross-pass conflicts for review", () => {
    const aggregated = aggregateExtractionEvidencePasses({
      passes: [
        {
          stamp: { extractionPassId: "a", bundleId: "ba" },
          evidence: [
            wallEvidence({
              id: "E-A",
              subjectKey: "W1",
              propertyPath: "assembly.studSpacingInches",
              candidateValue: 16,
              pageNumber: 3,
            }),
          ],
        },
        {
          stamp: { extractionPassId: "b", bundleId: "bb" },
          evidence: [
            wallEvidence({
              id: "E-B",
              subjectKey: "W1",
              propertyPath: "assembly.studSpacingInches",
              candidateValue: 24,
              pageNumber: 4,
            }),
          ],
        },
      ],
    });
    const resolved = resolveWallFraming(aggregated);
    assert.equal(resolved.walls[0]?.assembly.studSpacingInches, null);
  });

  it("does not contain Beckstead-specific routing literals in production module", () => {
    const modulePath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../src/plans/deriveRoleAssignmentsFromPageClassification.ts",
    );
    const source = readFileSync(modulePath, "utf8");
    for (const banned of [
      "Beckstead",
      "Crawl Space",
      "Main Floor Plan",
      "Roof Layout",
      "pageNumber === 3",
      "pageNumber === 4",
      "pageNumber === 5",
      '"22"',
      '"23"',
      '"31"',
    ]) {
      assert.equal(source.includes(banned), false, `found banned: ${banned}`);
    }
  });
});

describe("Beckstead B1.4-LIVE classification replay routing probe", () => {
  it("routes multi-primary wall/floor and mixed roof without Claude", () => {
    const fixturePath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../fixtures/beckstead-b1.4-live-classification.json",
    );
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as {
      pages: ClassifiedPlanPage[];
    };
    const pages = fixture.pages.map((page) =>
      classifiedPlanPageSchema.parse(page),
    );
    const planIndex = planIndexFromPages(pages);

    const wall = planIntentExtractionRouting({
      pages,
      intent: "wall-framing",
    });
    assert.deepEqual(wall.primaryPageNumbers, [3, 4]);
    assert.ok(
      wall.sharedSupportAssignments.some(
        (assignment) => assignment.pageNumber === 1,
      ),
    );
    const wallBundles = buildSequentialExtractionPageBundles({
      planIndex,
      scopeName: "framing",
      routingPlan: wall,
    });
    assert.equal(wallBundles.length, 2);
    assert.ok(
      wallBundles.every(
        (bundle) =>
          bundle.imageBudget.estimatedImages <=
          MAX_VISUAL_IMAGES_PER_EXTRACTION_REQUEST,
      ),
    );

    const roof = planIntentExtractionRouting({
      pages,
      intent: "roof-framing",
    });
    assert.deepEqual(roof.primaryPageNumbers, [5]);
    assert.ok(
      roof.sharedSupportAssignments.some(
        (assignment) => assignment.pageNumber === 1,
      ),
    );
    // Detail sheets remain excluded.
    for (const detailPage of [6, 7, 8, 9, 10, 11]) {
      assert.ok(wall.excludedPageNumbers.includes(detailPage));
      assert.ok(roof.excludedPageNumbers.includes(detailPage));
    }

    // derive still returns multi-primary assignments (not null).
    const derived = deriveRoleAssignmentsFromPageClassification({
      pages,
      intent: "floor-framing",
    });
    assert.ok(derived);
    assert.equal(
      derived.filter((assignment) => assignment.role === "primary").length,
      2,
    );
  });
});
