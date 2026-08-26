import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { PackageProductStateRow } from "../../src/scopes/framing/observability/framingPackageProductState.schema.js";
import {
  deriveProductPackageDisplayState,
  deriveProductPackageViewRows,
} from "../../src/ui/projectProductState.js";

function row(
  overrides: Partial<PackageProductStateRow> & Pick<PackageProductStateRow, "package">,
): PackageProductStateRow {
  return {
    productionState: "WIRED",
    detected: 1,
    evidence: 1,
    materialized: 1,
    resolved: 1,
    assumed: 0,
    calcEligible: 1,
    confidence: 1,
    review: 0,
    stage16Lines: 0,
    firstBrokenHandoff: "CALCULATOR_STARVED",
    ...overrides,
  };
}

describe("projectProductState", () => {
  it("derives calculated display state when stage16 lines exist", () => {
    assert.equal(
      deriveProductPackageDisplayState(
        row({ package: "Walls", stage16Lines: 52, firstBrokenHandoff: null }),
      ),
      "calculated",
    );
  });

  it("derives calculator-starved from firstBrokenHandoff", () => {
    assert.equal(
      deriveProductPackageDisplayState(row({ package: "Floor" })),
      "calculator-starved",
    );
  });

  it("derives authority-limited from TRUE_SOURCE_AUTHORITY_GAP", () => {
    assert.equal(
      deriveProductPackageDisplayState(
        row({
          package: "Roof",
          firstBrokenHandoff: "TRUE_SOURCE_AUTHORITY_GAP",
        }),
      ),
      "authority-limited",
    );
  });

  it("derives unsupported for DOMAIN_PIPELINE_UNWIRED", () => {
    assert.equal(
      deriveProductPackageDisplayState(
        row({
          package: "Blocking",
          productionState: "DOMAIN_PIPELINE_UNWIRED",
          detected: "N/A",
          evidence: "N/A",
          materialized: "N/A",
          resolved: "N/A",
          assumed: "N/A",
          calcEligible: "N/A",
          confidence: "N/A",
          review: "N/A",
          stage16Lines: "N/A",
          firstBrokenHandoff: "DOMAIN_PIPELINE_UNWIRED",
        }),
      ),
      "unsupported",
    );
  });

  it("keeps reviewRequired independent from displayState", () => {
    const viewRows = deriveProductPackageViewRows({
      runLabel: "test",
      capturedAt: new Date().toISOString(),
      evidence: { totalCount: 0, bySubjectKind: {}, byProvenance: {} },
      extraction: { intentsExecuted: [], pagesByIntent: {}, brainPacksByIntent: {} },
      planReference: { discovered: 0, queued: 0, followed: 0, skipped: 0 },
      assumptions: { count: 0 },
      review: {
        rawReviewItemCount: 1,
        activeReviewItems: 1,
        primaryQueueCount: 1,
      },
      stage16: { materialLineCount: 52, quantitiesByPackage: { Walls: 52 } },
      packages: [
        row({
          package: "Walls",
          stage16Lines: 52,
          review: 200,
          firstBrokenHandoff: null,
        }),
        row({ package: "Floor", review: 54 }),
      ],
    });

    const walls = viewRows.find((entry) => entry.package === "Walls");
    const floor = viewRows.find((entry) => entry.package === "Floor");

    assert.ok(walls);
    assert.equal(walls.displayState, "calculated");
    assert.equal(walls.reviewRequired, true);

    assert.ok(floor);
    assert.equal(floor.displayState, "calculator-starved");
    assert.equal(floor.reviewRequired, true);
  });
});
