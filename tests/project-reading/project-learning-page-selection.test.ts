import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isProjectLearningDefinitionPage,
  selectProjectLearningPages,
} from "../../src/project-reading/projectLearning/selectProjectLearningPages.js";
import type { PlanIndex } from "../../src/pdf/PlanIndex.js";
import type { ClassifiedPlanPage } from "../../src/pdf/pageClassification.js";

describe("selectProjectLearningPages", () => {
  it("scopes harvest to schedule pages and prefers Hybrid when textless", () => {
    const classifiedPages = [
      {
        pageNumber: 1,
        pageKind: "schedule",
        contentRoles: ["schedule"],
      },
      {
        pageNumber: 4,
        pageKind: "plan",
        contentRoles: ["plan-layout"],
      },
    ] as unknown as ClassifiedPlanPage[];
    const planIndex = {
      pdfPath: "/tmp/x.pdf",
      pages: [
        { pageNumber: 1, textContent: "" },
        { pageNumber: 4, textContent: "lots of native text on plan" },
      ],
    } as unknown as PlanIndex;

    const selection = selectProjectLearningPages({ classifiedPages, planIndex });
    assert.deepEqual(selection.pageNumbers, [1]);
    assert.equal(selection.preferHybrid, true);
  });

  it("prefers local ODL when learning pages have selectable text", () => {
    const classifiedPages = [
      {
        pageNumber: 1,
        pageKind: "schedule",
        contentRoles: ["schedule"],
      },
    ] as unknown as ClassifiedPlanPage[];
    const rich = "x".repeat(250);
    const planIndex = {
      pdfPath: "/tmp/x.pdf",
      pages: [{ pageNumber: 1, textContent: rich }],
    } as unknown as PlanIndex;

    const selection = selectProjectLearningPages({ classifiedPages, planIndex });
    assert.deepEqual(selection.pageNumbers, [1]);
    assert.equal(selection.preferHybrid, false);
  });

  it("keeps mixed schedule/index pages (Beckstead S1.1-like) and drops incidental plan notes", () => {
    const pages = [
      {
        pageNumber: 1,
        pageKind: "mixed",
        contentRoles: ["notes", "schedule", "index", "plan-layout"],
      },
      {
        pageNumber: 3,
        pageKind: "framing-plan",
        contentRoles: ["notes", "plan-layout"],
      },
      {
        pageNumber: 4,
        pageKind: "framing-plan",
        contentRoles: ["notes", "plan-layout"],
      },
      {
        pageNumber: 5,
        pageKind: "mixed",
        contentRoles: ["detail", "notes", "plan-layout"],
      },
      {
        pageNumber: 6,
        pageKind: "detail",
        contentRoles: ["detail", "schedule"],
      },
    ] as unknown as ClassifiedPlanPage[];

    assert.equal(isProjectLearningDefinitionPage(pages[0]!), true);
    assert.equal(isProjectLearningDefinitionPage(pages[1]!), false);
    assert.equal(isProjectLearningDefinitionPage(pages[2]!), false);
    assert.equal(isProjectLearningDefinitionPage(pages[3]!), false);
    assert.equal(isProjectLearningDefinitionPage(pages[4]!), true);

    const planIndex = {
      pdfPath: "/tmp/x.pdf",
      pages: pages.map((p) => ({ pageNumber: p.pageNumber, textContent: "" })),
    } as unknown as PlanIndex;

    const selection = selectProjectLearningPages({
      classifiedPages: pages,
      planIndex,
    });
    assert.deepEqual(selection.pageNumbers, [1, 6]);
    assert.ok(selection.pageNumbers.includes(1));
    assert.ok(!selection.pageNumbers.includes(3));
    assert.ok(!selection.pageNumbers.includes(4));
  });
});
