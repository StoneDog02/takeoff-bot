import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";

import { indexPlan } from "../../src/plans/indexPlan.js";
import { resolvePageClassificationForPipeline } from "../../src/plans/resolvePageClassificationForPipeline.js";

const BECKSTEAD = path.join(
  "tests",
  "fixtures",
  "beckstead-residence-plans.pdf",
);

describe("resolvePageClassificationForPipeline", () => {
  it("skips visual classification when useMockAi is true", async () => {
    const planIndex = await indexPlan(BECKSTEAD);
    const result = await resolvePageClassificationForPipeline({
      planIndex,
      useMockAi: true,
    });
    assert.equal(result.visualClassificationRan, false);
    assert.ok(result.visualPendingBefore > 0);
    assert.equal(result.visualPendingAfter, result.visualPendingBefore);
    assert.equal(result.framingRelevantCount, 0);
    assert.ok(
      result.pages.every(
        (p) => p.needsVisualClassification || p.relevantToFraming === false,
      ),
    );
  });
});
