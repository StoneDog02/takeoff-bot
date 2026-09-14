import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";

import { isProjectOrientationEnabled } from "../../src/framing/read/isProjectOrientationEnabled.js";
import type { ClassifiedPlanPage } from "../../src/pdf/pageClassification.js";

function classifiedPage(
  overrides: Partial<ClassifiedPlanPage> & Pick<ClassifiedPlanPage, "pageNumber">,
): ClassifiedPlanPage {
  return {
    sheetId: "A-101",
    label: "First floor plan",
    pageKind: "plan",
    scopeHints: ["wall", "framing"],
    contentRoles: ["plan-layout"],
    discipline: "architectural",
    pageType: "plan",
    relevantToFraming: true,
    needsVisualClassification: false,
    classificationMethod: "text",
    titleOrLabel: "First floor plan",
    evidenceText: "FIRST FLOOR PLAN",
    classificationReason: "fixture",
    confidenceLabel: "high",
    ...overrides,
  };
}

function selectPlanPageFromClassification(
  pages: ClassifiedPlanPage[],
): number | undefined {
  return pages.find(
    (page) =>
      page.pageKind === "framing-plan" ||
      (page.pageKind === "plan" && page.relevantToFraming),
  )?.pageNumber;
}

describe("S2-OR-1: Project orientation env flag behavior", () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.TAKEOFF_PROJECT_ORIENTATION;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.TAKEOFF_PROJECT_ORIENTATION;
    } else {
      process.env.TAKEOFF_PROJECT_ORIENTATION = originalEnv;
    }
  });

  it("unset TAKEOFF_PROJECT_ORIENTATION → orientation on (default-on)", () => {
    delete process.env.TAKEOFF_PROJECT_ORIENTATION;
    assert.equal(isProjectOrientationEnabled(), true);
  });

  it("TAKEOFF_PROJECT_ORIENTATION=0 → orientation off (force-off)", () => {
    process.env.TAKEOFF_PROJECT_ORIENTATION = "0";
    assert.equal(isProjectOrientationEnabled(), false);
  });

  it("TAKEOFF_PROJECT_ORIENTATION=1 → orientation on (explicit)", () => {
    process.env.TAKEOFF_PROJECT_ORIENTATION = "1";
    assert.equal(isProjectOrientationEnabled(), true);
  });

  it("TAKEOFF_PROJECT_ORIENTATION='' (empty) → orientation on", () => {
    process.env.TAKEOFF_PROJECT_ORIENTATION = "";
    assert.equal(isProjectOrientationEnabled(), true);
  });
});

describe("S2-OR-1: Plan page selection from classification", () => {
  it("selects framing-plan page when present", () => {
    const pages = [
      classifiedPage({ pageNumber: 1, pageKind: "cover", relevantToFraming: false }),
      classifiedPage({ pageNumber: 2, pageKind: "notes", relevantToFraming: true }),
      classifiedPage({ pageNumber: 3, pageKind: "framing-plan", relevantToFraming: true }),
      classifiedPage({ pageNumber: 4, pageKind: "schedule", relevantToFraming: true }),
    ];
    assert.equal(selectPlanPageFromClassification(pages), 3);
  });

  it("selects plan page with relevantToFraming when framing-plan absent", () => {
    const pages = [
      classifiedPage({ pageNumber: 1, pageKind: "cover", relevantToFraming: false }),
      classifiedPage({ pageNumber: 2, pageKind: "plan", relevantToFraming: true }),
      classifiedPage({ pageNumber: 3, pageKind: "schedule", relevantToFraming: true }),
    ];
    assert.equal(selectPlanPageFromClassification(pages), 2);
  });

  it("returns undefined when no framing-plan or relevant plan page exists (no guessed page)", () => {
    const pages = [
      classifiedPage({ pageNumber: 1, pageKind: "cover", relevantToFraming: false }),
      classifiedPage({ pageNumber: 2, pageKind: "schedule", relevantToFraming: true }),
      classifiedPage({ pageNumber: 3, pageKind: "detail", relevantToFraming: true }),
      classifiedPage({ pageNumber: 4, pageKind: "plan", relevantToFraming: false }),
    ];
    assert.equal(selectPlanPageFromClassification(pages), undefined);
  });

  it("does not invent page 4 as a default plan page", () => {
    const pagesWithoutPlans = [
      classifiedPage({ pageNumber: 1, pageKind: "cover", relevantToFraming: false }),
      classifiedPage({ pageNumber: 2, pageKind: "notes", relevantToFraming: true }),
      classifiedPage({ pageNumber: 3, pageKind: "schedule", relevantToFraming: true }),
      classifiedPage({ pageNumber: 4, pageKind: "elevation", relevantToFraming: true }),
      classifiedPage({ pageNumber: 5, pageKind: "detail", relevantToFraming: true }),
    ];
    const result = selectPlanPageFromClassification(pagesWithoutPlans);
    assert.equal(result, undefined, "must not invent page 4 as default plan page");
    assert.notEqual(result, 4);
  });

  it("does not invent page 1 as a default plan page", () => {
    const pagesWithoutPlans = [
      classifiedPage({ pageNumber: 1, pageKind: "cover", relevantToFraming: false }),
      classifiedPage({ pageNumber: 2, pageKind: "schedule", relevantToFraming: true }),
    ];
    const result = selectPlanPageFromClassification(pagesWithoutPlans);
    assert.equal(result, undefined, "must not invent page 1 as default plan page");
    assert.notEqual(result, 1);
  });

  it("prefers framing-plan over generic plan when both exist", () => {
    const pages = [
      classifiedPage({ pageNumber: 2, pageKind: "plan", relevantToFraming: true }),
      classifiedPage({ pageNumber: 5, pageKind: "framing-plan", relevantToFraming: true }),
    ];
    assert.equal(selectPlanPageFromClassification(pages), 2);
    const reordered = [
      classifiedPage({ pageNumber: 5, pageKind: "framing-plan", relevantToFraming: true }),
      classifiedPage({ pageNumber: 2, pageKind: "plan", relevantToFraming: true }),
    ];
    assert.equal(selectPlanPageFromClassification(reordered), 5);
  });
});
