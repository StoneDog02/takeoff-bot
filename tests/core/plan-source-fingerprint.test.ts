import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computePlanSourceFingerprint } from "../../src/pdf/computePlanSourceFingerprint.js";
import type { PlanIndex } from "../../src/pdf/PlanIndex.js";

function samplePlan(overrides: Partial<PlanIndex> = {}): PlanIndex {
  return {
    pdfPath: "/tmp/plan.pdf",
    totalPages: 2,
    indexedAt: "2026-01-01T00:00:00.000Z",
    sourceContentHash: null,
    pages: [
      {
        pageNumber: 1,
        sheetId: "A1",
        label: "Plan",
        textContent: "WALL W1 2x6",
      },
      {
        pageNumber: 2,
        sheetId: "A2",
        label: "Notes",
        textContent: "OSB WALL SHEATHING",
      },
    ],
    ...overrides,
  };
}

describe("computePlanSourceFingerprint", () => {
  it("is stable across path and indexedAt changes", () => {
    const base = computePlanSourceFingerprint(samplePlan());
    const relocated = computePlanSourceFingerprint(
      samplePlan({
        pdfPath: "/elsewhere/plan.pdf",
        indexedAt: "2026-08-21T00:00:00.000Z",
      }),
    );
    assert.equal(base, relocated);
  });

  it("changes when page text changes", () => {
    const base = computePlanSourceFingerprint(samplePlan());
    const changed = computePlanSourceFingerprint(
      samplePlan({
        pages: [
          {
            pageNumber: 1,
            sheetId: "A1",
            label: "Plan",
            textContent: "WALL W1 2x4",
          },
          {
            pageNumber: 2,
            sheetId: "A2",
            label: "Notes",
            textContent: "OSB WALL SHEATHING",
          },
        ],
      }),
    );
    assert.notEqual(base, changed);
  });

  it("changes when sourceContentHash changes with identical text", () => {
    const base = computePlanSourceFingerprint(
      samplePlan({ sourceContentHash: "a".repeat(64) }),
    );
    const changed = computePlanSourceFingerprint(
      samplePlan({ sourceContentHash: "b".repeat(64) }),
    );
    assert.notEqual(base, changed);
  });
});
