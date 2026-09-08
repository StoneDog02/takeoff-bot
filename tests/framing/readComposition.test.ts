import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import type { PlanIndex } from "../../src/pdf/PlanIndex.js";
import {
  planIndexIsEmptyText,
  shouldRunCompilerOcr,
  shouldRunDrawingCompiler,
  shouldRunProjectLearning,
} from "../../src/framing/read/readComposition.js";
import { selectWallAssemblyNotePages } from "../../src/framing/read/selectWallAssemblyNotePages.js";
import type { ClassifiedPlanPage } from "../../src/pdf/pageClassification.js";

function emptyTextIndex(pageCount: number): PlanIndex {
  return {
    pdfPath: "/tmp/empty.pdf",
    totalPages: pageCount,
    indexedAt: "2026-01-01T00:00:00.000Z",
    sourceContentHash: "e".repeat(64),
    pages: Array.from({ length: pageCount }, (_, index) => ({
      pageNumber: index + 1,
      sheetId: String(index + 1),
      label: String(index + 1),
      textContent: "",
    })),
  };
}

function textLayerIndex(): PlanIndex {
  return {
    pdfPath: "/tmp/text.pdf",
    totalPages: 1,
    indexedAt: "2026-01-01T00:00:00.000Z",
    sourceContentHash: "t".repeat(64),
    pages: [
      {
        pageNumber: 1,
        sheetId: "A-101",
        label: "A-101",
        textContent: "W-001 2x4 @ 16\" O.C.",
      },
    ],
  };
}

describe("read composition empty-text rule", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("treats majority-empty plan indexes as empty-text", () => {
    assert.equal(planIndexIsEmptyText(emptyTextIndex(4)), true);
    assert.equal(planIndexIsEmptyText(textLayerIndex()), false);
  });

  it("auto-enables compiler and learning on empty-text when flags are unset", () => {
    delete process.env.TAKEOFF_COMPILER;
    delete process.env.TAKEOFF_PROJECT_LEARNING;
    delete process.env.TAKEOFF_COMPILER_OCR;
    const index = emptyTextIndex(4);
    assert.equal(shouldRunDrawingCompiler(index), true);
    assert.equal(shouldRunProjectLearning(index), true);
    assert.equal(shouldRunCompilerOcr(index), true);
  });

  it("skips compiler on text-layer PDFs unless forced on", () => {
    delete process.env.TAKEOFF_COMPILER;
    assert.equal(shouldRunDrawingCompiler(textLayerIndex()), false);
    process.env.TAKEOFF_COMPILER = "1";
    assert.equal(shouldRunDrawingCompiler(textLayerIndex()), true);
  });

  it("honors force-off even for empty-text PDFs", () => {
    process.env.TAKEOFF_COMPILER = "0";
    process.env.TAKEOFF_PROJECT_LEARNING = "0";
    const index = emptyTextIndex(4);
    assert.equal(shouldRunDrawingCompiler(index), false);
    assert.equal(shouldRunProjectLearning(index), false);
  });

  it("selects notes/schedule/plan pages instead of hardcoded 1/3/4", () => {
    const pages: ClassifiedPlanPage[] = [
      {
        pageNumber: 1,
        sheetId: "S1.1",
        label: "S1.1",
        pageKind: "mixed",
        scopeHints: ["structural"],
        contentRoles: ["notes", "schedule"],
        discipline: "structural",
        pageType: "other",
        relevantToFraming: true,
        needsVisualClassification: false,
        classificationMethod: "visual",
        titleOrLabel: "Notes",
        evidenceText: "NOTES",
        classificationReason: "fixture",
        confidenceLabel: "high",
      },
      {
        pageNumber: 7,
        sheetId: "S2.3",
        label: "S2.3",
        pageKind: "plan",
        scopeHints: ["wall", "framing"],
        contentRoles: ["plan-layout"],
        discipline: "structural",
        pageType: "plan",
        relevantToFraming: true,
        needsVisualClassification: false,
        classificationMethod: "visual",
        titleOrLabel: "Main floor",
        evidenceText: "MAIN FLOOR",
        classificationReason: "fixture",
        confidenceLabel: "high",
      },
    ];
    assert.deepEqual(
      selectWallAssemblyNotePages({ classifiedPages: pages, totalPages: 11 }),
      [1],
    );
  });
});
