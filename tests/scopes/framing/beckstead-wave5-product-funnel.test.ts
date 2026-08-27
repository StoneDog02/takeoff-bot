import assert from "node:assert/strict";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildFramingPackageProductState,
  loadFramingRunArtifactsFromDirectory,
} from "../../../src/scopes/framing/observability/buildFramingPackageProductState.js";
import { buildFloorProductFunnel } from "../../../src/scopes/framing/observability/floorCalculatorReadiness.js";
import { resolveFloorFraming } from "../../../src/scopes/framing/resolvers/resolveFloorFraming.js";

const WAVE5_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../artifacts/b2.3-wave5/runs/beckstead-wave5-after/framing",
);

describe("beckstead wave5 product funnel", () => {
  it("reports honest Run 1 funnel after resolver fixes on wave5 evidence", async () => {
    const artifacts = await loadFramingRunArtifactsFromDirectory(WAVE5_DIR);
    assert.ok(artifacts?.floorFraming);

    const floorResolved = resolveFloorFraming(artifacts.evidence);
    const funnelRun1 = buildFloorProductFunnel({
      floorFraming: floorResolved,
      validation: artifacts.validation ?? undefined,
      materials: artifacts.calculations?.materials ?? [],
      stage16FloorLines: 0,
    });

    assert.equal(funnelRun1.areas, 11);
    assert.equal(funnelRun1.parentLinked, 2);
    assert.equal(funnelRun1.calculatorReady, 0);
    assert.equal(funnelRun1.stage16MaterialLines, 0);

    const state = buildFramingPackageProductState({
      runLabel: "wave5-after",
      artifacts,
    });
    const floorPkg = state.packages.find((row) => row.package === "Floor");
    assert.ok(floorPkg);
    assert.equal(floorPkg.calculatorReady, 0);
    assert.ok(floorPkg.productFunnel);
    assert.equal(floorPkg.productFunnel?.areas, 11);
  });
});
