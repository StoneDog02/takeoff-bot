import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { framingScopeSchema } from "../../src/scopes/framing/schemas/framing-scope.schema.js";

describe("framing scope domain contracts", () => {
  it("accepts a coordinator snapshot that references artifacts and records by ID only", () => {
    const scope = framingScopeSchema.parse({
      scopeName: "framing",
      subsystemArtifactIds: {
        wallFraming: "ART-006",
        openings: "ART-013",
        validation: "ART-020",
        confidence: "ART-021",
      },
      reviewItemIds: ["RI-001"],
      validationIssueIds: ["VI-001"],
      validationResultIds: ["VR-001"],
      confidenceEvaluationIds: ["CE-001"],
    });

    assert.equal(scope.scopeName, "framing");
    assert.equal(scope.subsystemArtifactIds.wallFraming, "ART-006");
    assert.equal(scope.subsystemArtifactIds.floorFraming, null);
    assert.equal("walls" in scope, false);
    assert.equal("reviewItems" in scope, false);
    assert.equal("materials" in scope, false);
  });

  it("rejects duplicate subsystem artifact IDs and aggregated record IDs", () => {
    const result = framingScopeSchema.safeParse({
      scopeName: "framing",
      subsystemArtifactIds: {
        wallFraming: "ART-006",
        validation: "ART-006",
      },
      reviewItemIds: ["RI-001", "RI-001"],
    });

    assert.equal(result.success, false);
  });
});
