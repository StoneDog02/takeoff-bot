import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";

import { indexPlan } from "../../src/plans/indexPlan.js";
import { classifyPlanPagesDeterministically } from "../../src/plans/classifyPlanPages.js";
import {
  applyVisualClassificationFixture,
  loadBecksteadB14VisualClassificationFixture,
} from "../../src/plans/loadBecksteadB14VisualClassificationFixture.js";
import { resolvePageClassificationForPipeline } from "../../src/plans/resolvePageClassificationForPipeline.js";

const BECKSTEAD = path.join(
  "tests",
  "fixtures",
  "beckstead-residence-plans.pdf",
);
const B14_FIXTURE = path.join(
  "artifacts",
  "beckstead-b1.4-live",
  "live-classification-report.json",
);

describe("Beckstead B1.4 visual classification fixture", () => {
  it("unlocks framing-relevant pages from visual-pending deterministic state", async () => {
    const planIndex = await indexPlan(BECKSTEAD);
    const deterministic = classifyPlanPagesDeterministically(planIndex);
    assert.ok(deterministic.every((p) => p.needsVisualClassification));
    assert.equal(deterministic.filter((p) => p.relevantToFraming).length, 0);

    const fixture = await loadBecksteadB14VisualClassificationFixture(B14_FIXTURE);
    const merged = applyVisualClassificationFixture(deterministic, fixture);

    const relevant = merged.filter((p) => p.relevantToFraming);
    assert.ok(relevant.length >= 4, `expected multiple framing-relevant pages, got ${relevant.length}`);
    assert.ok(
      merged.some((p) => p.pageNumber === 3 && p.pageKind === "framing-plan"),
    );
    assert.ok(
      merged.some((p) => p.pageNumber === 4 && p.relevantToFraming),
    );
    assert.equal(
      merged.filter((p) => p.needsVisualClassification).length,
      0,
    );
  });

  it("resolvePageClassificationForPipeline uses fixture path when set", async () => {
    const planIndex = await indexPlan(BECKSTEAD);
    process.env.TAKEOFF_VISUAL_CLASSIFICATION_FIXTURE_PATH = B14_FIXTURE;
    try {
      const result = await resolvePageClassificationForPipeline({
        planIndex,
        useMockAi: false,
      });
      assert.equal(result.visualClassificationRan, true);
      assert.ok(result.framingRelevantCount >= 4);
      assert.equal(result.visualPendingAfter, 0);
    } finally {
      delete process.env.TAKEOFF_VISUAL_CLASSIFICATION_FIXTURE_PATH;
    }
  });
});
