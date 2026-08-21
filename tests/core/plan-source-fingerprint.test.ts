import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computePlanSourceFingerprint } from "../../src/plans/computePlanSourceFingerprint.js";
import type { PlanIndex } from "../../src/plans/PlanIndex.js";

function samplePlan(overrides: Partial<PlanIndex> = {}): PlanIndex {
  return {
    pdfPath: "/tmp/plan.pdf",
    totalPages: 2,
    indexedAt: "2026-01-01T00:00:00.000Z",
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
});
