import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { buildExtractionPageBundles } from "../../src/plans/buildExtractionPageBundles.js";
import { buildPlanReadingOrderFromClassification } from "../../src/plans/buildPlanReadingOrder.js";
import { classifyPlanPagesDeterministically } from "../../src/plans/classifyPlanPages.js";
import {
  deriveRoleAssignmentsFromPageClassification,
  listPrimaryCandidatesForIntent,
} from "../../src/plans/deriveRoleAssignmentsFromPageClassification.js";
import type { PlanIndex } from "../../src/plans/PlanIndex.js";
import {
  classifiedPlanPageSchema,
  type ClassifiedPlanPage,
} from "../../src/plans/pageClassification.js";
import {
  buildVisualClassificationQueue,
  mergeVisualPageClassifications,
  visualPageClassificationPayloadSchema,
} from "../../src/plans/visualPageClassification.js";
import { indexPlan } from "../../src/plans/indexPlan.js";

const fixturesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures",
);

function classified(overrides: Partial<ClassifiedPlanPage> & { pageNumber: number }): ClassifiedPlanPage {
  return classifiedPlanPageSchema.parse({
    pageNumber: overrides.pageNumber,
    sheetId: overrides.sheetId ?? `S${overrides.pageNumber}`,
    label: overrides.label ?? `Sheet ${overrides.pageNumber}`,
    pageKind: overrides.pageKind ?? "unknown",
    scopeHints: overrides.scopeHints ?? [],
    contentRoles: overrides.contentRoles ?? [],
    discipline: overrides.discipline ?? "other",
    pageType: overrides.pageType ?? "other",
    relevantToFraming: overrides.relevantToFraming ?? false,
    needsVisualClassification: overrides.needsVisualClassification ?? false,
    classificationMethod: overrides.classificationMethod ?? "text",
    titleOrLabel: overrides.titleOrLabel ?? null,
    evidenceText: overrides.evidenceText ?? "synthetic",
    classificationReason: overrides.classificationReason ?? "test",
    confidenceLabel: overrides.confidenceLabel ?? "medium",
  });
}

describe("page classification contract", () => {
  it("validates classified pages and preserves unknown without coercion", () => {
    const page = classified({
      pageNumber: 1,
      pageKind: "unknown",
      needsVisualClassification: true,
      classificationMethod: "visual-pending",
      relevantToFraming: false,
      confidenceLabel: null,
    });
    assert.equal(page.pageKind, "unknown");
    assert.equal(page.needsVisualClassification, true);
    const payload = { pages: [page] };
    assert.equal(payload.pages[0]?.pageKind, "unknown");
    assert.doesNotThrow(() => classifiedPlanPageSchema.parse(page));
  });
});

describe("deterministic text classification", () => {
  it("classifies text-rich framing pages without needing visual classification", () => {
    const planIndex: PlanIndex = {
      pdfPath: "/tmp/synthetic-text.pdf",
      totalPages: 5,
      indexedAt: "2026-01-01T00:00:00.000Z",
      sourceContentHash: null,
      pages: [
        {
          pageNumber: 1,
          sheetId: "A0.01",
          label: "Cover",
          textContent: "COVER SHEET Project Data Sheet Index",
        },
        {
          pageNumber: 2,
          sheetId: "A2.01",
          label: "Floor Framing",
          textContent: "SHEET A2.01 FLOOR FRAMING PLAN LEVEL 2 WALL SCHEDULE NOTES",
        },
        {
          pageNumber: 3,
          sheetId: "S1.01",
          label: "Notes",
          textContent: "SHEET S1.01 FRAMING NOTES / MEMBER SCHEDULES GENERAL NOTES",
        },
        {
          pageNumber: 4,
          sheetId: "A2.02",
          label: "Roof",
          textContent: "SHEET A2.02 ROOF FRAMING PLAN ROOF SYS A",
        },
        {
          pageNumber: 5,
          sheetId: "A9.01",
          label: "Details",
          textContent: "TYPICAL WALL DETAILS Detail 1 Detail 2",
        },
      ],
    };

    const pages = classifyPlanPagesDeterministically(planIndex);
    assert.equal(pages[0]?.pageKind, "cover");
    assert.equal(pages[0]?.needsVisualClassification, false);
    assert.equal(pages[1]?.pageKind, "framing-plan");
    assert.ok(pages[1]?.scopeHints.includes("floor"));
    assert.equal(pages[1]?.classificationMethod, "text");
    assert.equal(pages[3]?.pageKind, "framing-plan");
    assert.ok(pages[3]?.scopeHints.includes("roof"));
    assert.ok(pages.every((page) => page.classificationMethod !== "visual"));
  });

  it("marks visual-only opaque-outline pages as visual-pending", async () => {
    const planIndex = await indexPlan(
      path.join(fixturesDir, "beckstead-residence-plans.pdf"),
    );
    const pages = classifyPlanPagesDeterministically(planIndex);
    assert.equal(pages.length, 11);
    assert.ok(pages.every((page) => page.needsVisualClassification));
    assert.ok(pages.every((page) => page.pageKind === "unknown"));
    assert.ok(pages.every((page) => page.classificationMethod === "visual-pending"));
    assert.equal(pages[0]?.sheetId, "11");
    assert.equal(pages[3]?.sheetId, "23");
    // No semantic roles invented from outline codes.
    assert.ok(pages.every((page) => page.relevantToFraming === false));
  });
});

describe("routing from classification", () => {
  it("routes floor vs roof intents with shared notes and excludes unrelated pages", () => {
    const pages = [
      classified({
        pageNumber: 1,
        pageKind: "framing-plan",
        pageType: "plan",
        scopeHints: ["floor", "framing"],
        relevantToFraming: true,
        classificationReason: "floor framing plan",
      }),
      classified({
        pageNumber: 2,
        pageKind: "notes",
        pageType: "notes",
        scopeHints: ["structural", "general"],
        relevantToFraming: true,
        classificationReason: "structural notes",
      }),
      classified({
        pageNumber: 3,
        pageKind: "framing-plan",
        pageType: "plan",
        scopeHints: ["roof", "framing"],
        relevantToFraming: true,
        classificationReason: "roof framing plan",
      }),
      classified({
        pageNumber: 4,
        pageKind: "detail",
        pageType: "detail",
        scopeHints: ["framing"],
        relevantToFraming: true,
        classificationReason: "detail",
      }),
      classified({
        pageNumber: 5,
        pageKind: "plan",
        pageType: "plan",
        scopeHints: ["architectural"],
        relevantToFraming: false,
        classificationReason: "unrelated arch",
      }),
    ];

    const floor = deriveRoleAssignmentsFromPageClassification({
      pages,
      intent: "floor-framing",
    });
    assert.ok(floor);
    assert.deepEqual(
      floor.map((a) => [a.pageNumber, a.role]),
      [
        [1, "primary"],
        [2, "global"],
      ],
    );
    assert.ok(!floor.some((a) => a.pageNumber === 3));
    assert.ok(!floor.some((a) => a.pageNumber === 4));
    assert.ok(!floor.some((a) => a.pageNumber === 5));

    const roof = deriveRoleAssignmentsFromPageClassification({
      pages,
      intent: "roof-framing",
    });
    assert.ok(roof);
    assert.deepEqual(
      roof.map((a) => [a.pageNumber, a.role]),
      [
        [3, "primary"],
        [2, "global"],
      ],
    );

    const planIndex: PlanIndex = {
      pdfPath: "/tmp/x.pdf",
      totalPages: 5,
      indexedAt: "2026-01-01T00:00:00.000Z",
      sourceContentHash: null,
      pages: pages.map((page) => ({
        pageNumber: page.pageNumber,
        sheetId: page.sheetId,
        label: page.label,
        textContent: "x",
      })),
    };
    const bundles = buildExtractionPageBundles({
      planIndex,
      scopeName: "framing",
      intent: "floor-framing",
      roleAssignments: floor,
    });
    assert.equal(bundles.length, 1);
    assert.ok(bundles[0]!.imageBudget.estimatedImages <= 20);
  });

  it("does not make unknown pages primary", () => {
    const assignments = deriveRoleAssignmentsFromPageClassification({
      pages: [
        classified({
          pageNumber: 1,
          pageKind: "unknown",
          needsVisualClassification: true,
          classificationMethod: "visual-pending",
          relevantToFraming: false,
        }),
        classified({
          pageNumber: 2,
          pageKind: "notes",
          pageType: "notes",
          scopeHints: ["general"],
          relevantToFraming: true,
        }),
      ],
      intent: "wall-framing",
    });
    assert.equal(assignments, null);
  });

  it("lists multiple primary candidates and includes them in assignments", () => {
    const pages = [
      classified({
        pageNumber: 3,
        pageKind: "framing-plan",
        pageType: "plan",
        scopeHints: ["floor", "framing"],
        contentRoles: ["plan-layout"],
        relevantToFraming: true,
        confidenceLabel: "high",
      }),
      classified({
        pageNumber: 4,
        pageKind: "plan",
        pageType: "plan",
        scopeHints: ["floor", "architectural"],
        contentRoles: ["plan-layout"],
        relevantToFraming: true,
        confidenceLabel: "high",
      }),
    ];
    const primaries = listPrimaryCandidatesForIntent({
      pages,
      intent: "wall-framing",
    });
    assert.deepEqual(
      primaries.map((page) => page.pageNumber),
      [3, 4],
    );
    const assignments = deriveRoleAssignmentsFromPageClassification({
      pages,
      intent: "wall-framing",
    });
    assert.ok(assignments);
    assert.equal(
      assignments.filter((assignment) => assignment.role === "primary").length,
      2,
    );
  });
});

describe("plan reading order", () => {
  it("orders notes before plans and unknown last", () => {
    const order = buildPlanReadingOrderFromClassification([
      classified({ pageNumber: 3, pageKind: "framing-plan", pageType: "plan", relevantToFraming: true }),
      classified({ pageNumber: 1, pageKind: "notes", pageType: "notes", relevantToFraming: true }),
      classified({ pageNumber: 2, pageKind: "unknown", needsVisualClassification: true }),
      classified({
        pageNumber: 4,
        pageKind: "framing-plan",
        pageType: "plan",
        scopeHints: ["roof"],
        relevantToFraming: true,
      }),
    ]);
    assert.deepEqual(order.orderedPageNumbers, [1, 3, 4, 2]);
  });
});

describe("visual classification fallback contract", () => {
  it("queues visual-pending pages for full-sheet classification without Claude", () => {
    const classifiedPages = [
      classified({
        pageNumber: 1,
        pageKind: "unknown",
        needsVisualClassification: true,
        classificationMethod: "visual-pending",
      }),
      classified({
        pageNumber: 2,
        pageKind: "framing-plan",
        pageType: "plan",
        needsVisualClassification: false,
        classificationMethod: "text",
        relevantToFraming: true,
      }),
    ];
    const queue = buildVisualClassificationQueue({
      planIndex: {
        pdfPath: "/tmp/x.pdf",
        totalPages: 2,
        indexedAt: "2026-01-01T00:00:00.000Z",
        sourceContentHash: null,
        pages: [
          { pageNumber: 1, sheetId: "11", label: "11", textContent: "" },
          { pageNumber: 2, sheetId: "A2", label: "Plan", textContent: "FLOOR FRAMING PLAN" },
        ],
      },
      classifiedPages,
    });
    assert.deepEqual(
      queue.map((entry) => entry.pageNumber),
      [1],
    );
    assert.equal(queue[0]?.preferredVisualInput, "full-sheet");
    assert.equal(queue[0]?.renderAvailable, false);
  });

  it("merges validated visual results and rejects driving routing on invalid payloads", () => {
    assert.throws(() =>
      visualPageClassificationPayloadSchema.parse({
        pages: [{ pageNumber: 1, pageKind: "not-a-kind" }],
      }),
    );

    const existing = [
      classified({
        pageNumber: 1,
        pageKind: "unknown",
        needsVisualClassification: true,
        classificationMethod: "visual-pending",
        sheetId: "11",
      }),
    ];
    const merged = mergeVisualPageClassifications({
      existing,
      visualPayload: visualPageClassificationPayloadSchema.parse({
        pages: [
          {
            pageNumber: 1,
            pageKind: "framing-plan",
            scopeHints: ["floor", "framing"],
            titleOrLabel: "FLOOR FRAMING PLAN",
            evidenceText: "Title block reads FLOOR FRAMING PLAN",
            confidenceLabel: "high",
            classificationReason: "Visible sheet title",
          },
        ],
      }),
    });
    assert.equal(merged[0]?.pageKind, "framing-plan");
    assert.equal(merged[0]?.classificationMethod, "visual");
    assert.equal(merged[0]?.needsVisualClassification, false);
    assert.equal(merged[0]?.relevantToFraming, true);
  });
});
