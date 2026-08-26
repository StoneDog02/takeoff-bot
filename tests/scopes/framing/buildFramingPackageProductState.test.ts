import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildFramingPackageProductState,
  loadFramingRunArtifactsFromDirectory,
} from "../../../src/scopes/framing/observability/buildFramingPackageProductState.js";

const BASELINE_RUN = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../artifacts/b2.2m.4/runs/beckstead-audit-b/framing",
);

const WAVE1_AFTER_RUN = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../artifacts/b2.3-wave1/runs/beckstead-wave1-after/framing",
);

describe("buildFramingPackageProductState (D13)", () => {
  it("loads Beckstead baseline dump and produces package matrix", async () => {
    const artifacts = await loadFramingRunArtifactsFromDirectory(BASELINE_RUN);
    assert.ok(artifacts);
    assert.ok(artifacts.evidence.length > 0);

    const state = buildFramingPackageProductState({
      runLabel: "beckstead-baseline",
      artifacts,
    });

    assert.equal(state.runLabel, "beckstead-baseline");
    assert.ok(state.evidence.totalCount > 0);
    assert.equal(state.packages.length, 10);

    const walls = state.packages.find((pkg) => pkg.package === "Walls");
    assert.ok(walls);
    assert.equal(walls.productionState, "WIRED");
    assert.ok(typeof walls.detected === "number" && walls.detected > 0);

    const blocking = state.packages.find((pkg) => pkg.package === "Blocking");
    assert.equal(blocking?.productionState, "DOMAIN_PIPELINE_UNWIRED");
    assert.equal(blocking?.detected, "N/A");
  });

  it("attributes wave1-after stage16 lines by sourceObjectIds ownership", async () => {
    const artifacts = await loadFramingRunArtifactsFromDirectory(WAVE1_AFTER_RUN);
    assert.ok(artifacts);

    const state = buildFramingPackageProductState({
      runLabel: "beckstead-wave1-after",
      artifacts,
    });

    assert.equal(state.stage16.materialLineCount, 52);

    const walls = state.packages.find((pkg) => pkg.package === "Walls");
    const floor = state.packages.find((pkg) => pkg.package === "Floor");
    const sheathing = state.packages.find((pkg) => pkg.package === "Sheathing");
    const structural = state.packages.find((pkg) => pkg.package === "Structural");
    const roof = state.packages.find((pkg) => pkg.package === "Roof");

    assert.equal(walls?.stage16Lines, 52);
    assert.equal(floor?.stage16Lines, 0);
    assert.equal(sheathing?.stage16Lines, 0);
    assert.equal(structural?.stage16Lines, 0);
    assert.equal(roof?.stage16Lines, 0);

    const attributedSum = Object.values(state.stage16.quantitiesByPackage).reduce(
      (total, count) => total + count,
      0,
    );
    assert.equal(attributedSum, 52);

    assert.equal(floor?.firstBrokenHandoff, "CALCULATOR_STARVED");
    assert.equal(structural?.firstBrokenHandoff, "CALCULATOR_STARVED");
    assert.equal(roof?.firstBrokenHandoff, "CALCULATOR_STARVED");
  });
});
