import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import type { ClassifiedPlanPage } from "../../src/pdf/pageClassification.js";
import {
  selectPagesForDrawingCompiler,
  shouldCompilePage,
} from "../../src/framing/read/selectPagesForDrawingCompiler.js";

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

describe("selectPagesForDrawingCompiler", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.TAKEOFF_COMPILER_MAX_PAGES;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("selects plan-layout framing pages in reading order", () => {
    const pages = [
      classifiedPage({ pageNumber: 3 }),
      classifiedPage({ pageNumber: 1 }),
      classifiedPage({ pageNumber: 2, pageKind: "elevation", contentRoles: ["elevation"] }),
    ];

    assert.deepEqual(
      selectPagesForDrawingCompiler({
        classifiedPages: pages,
        orderedPageNumbers: [1, 2, 3],
      }),
      [1, 3],
    );
  });

  it("includes unknown OCR-only pages when TAKEOFF_COMPILER_OCR=1", () => {
    process.env.TAKEOFF_COMPILER_OCR = "1";
    const page = classifiedPage({
      pageNumber: 4,
      pageKind: "unknown",
      contentRoles: [],
      relevantToFraming: false,
      needsVisualClassification: true,
    });

    assert.equal(
      shouldCompilePage(page, { emptyTextPageNumbers: [4] }),
      true,
    );
    assert.deepEqual(
      selectPagesForDrawingCompiler({
        classifiedPages: [page],
        emptyTextPageNumbers: [4],
      }),
      [4],
    );
  });

  it("skips elevation pages without plan-layout role", () => {
    const page = classifiedPage({
      pageNumber: 5,
      pageKind: "elevation",
      contentRoles: ["elevation"],
      scopeHints: ["wall", "framing"],
    });

    assert.equal(shouldCompilePage(page), false);
  });

  it("includes unknown framing-relevant pages even when confidence is low (Burt p2 path)", () => {
    const page = classifiedPage({
      pageNumber: 2,
      pageKind: "unknown",
      contentRoles: [],
      scopeHints: ["wall", "framing", "structural"],
      confidenceLabel: "low",
    });

    assert.equal(shouldCompilePage(page), true);
    assert.deepEqual(
      selectPagesForDrawingCompiler({ classifiedPages: [page] }),
      [2],
    );
  });

  it("respects TAKEOFF_COMPILER_MAX_PAGES", () => {
    process.env.TAKEOFF_COMPILER_MAX_PAGES = "1";
    const pages = [
      classifiedPage({ pageNumber: 1 }),
      classifiedPage({ pageNumber: 2 }),
    ];

    assert.deepEqual(
      selectPagesForDrawingCompiler({
        classifiedPages: pages,
        orderedPageNumbers: [1, 2],
      }),
      [1],
    );
  });
});
