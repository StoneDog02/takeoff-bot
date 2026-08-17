import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatStageArtifactName } from "../src/core/utils/ids.js";
import { scopeRegistry } from "../src/core/scope/ScopeRegistry.js";
import { registerScopes } from "../src/scopes/registry.js";

describe("takeoff-bot skeleton", () => {
  it("formats stage artifact names with zero-padded order", () => {
    assert.equal(formatStageArtifactName(1, "pageMap"), "01-pageMap.json");
    assert.equal(formatStageArtifactName(10, "report"), "10-report.json");
  });

  it("registers framing scope", () => {
    registerScopes();
    const scope = scopeRegistry.get("framing");
    assert.equal(scope.name, "framing");
    assert.equal(scope.stages.length, 10);
  });
});
