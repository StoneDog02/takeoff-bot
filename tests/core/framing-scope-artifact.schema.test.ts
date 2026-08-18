import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { framingScopeArtifactSchema } from "../../src/scopes/framing/schemas/framing-artifacts.schema.js";

const timestamp = "2026-07-10T12:00:00.000Z";

describe("framing-scope artifact contract", () => {
  it("accepts a framing-scope envelope containing coordinator ID references", () => {
    const artifact = framingScopeArtifactSchema.parse({
      artifactId: "ART-022",
      artifactType: "framing-scope",
      schemaVersion: "1.0.0",
      artifactVersion: 1,
      engineVersion: "0.1.0",
      pipelineRunId: "RUN-001",
      projectId: "demo-project",
      createdAt: timestamp,
      lastModifiedAt: timestamp,
      producer: { type: "system", identifier: "framing-pipeline" },
      inputArtifactIds: ["ART-006", "ART-020", "ART-021"],
      parentArtifactIds: ["ART-021"],
      payload: {
        scopeName: "framing",
        subsystemArtifactIds: {
          wallFraming: "ART-006",
          validation: "ART-020",
          confidence: "ART-021",
        },
        reviewItemIds: ["RI-001"],
        validationIssueIds: ["VI-001"],
        validationResultIds: ["VR-001"],
        confidenceEvaluationIds: ["CE-001"],
      },
    });

    assert.equal(artifact.artifactType, "framing-scope");
    assert.equal(artifact.payload.scopeName, "framing");
    assert.equal(artifact.payload.subsystemArtifactIds.wallFraming, "ART-006");
    assert.equal("validationIssues" in artifact.payload, false);
    assert.equal("confidenceEvaluations" in artifact.payload, false);
    assert.equal("walls" in artifact.payload, false);
    assert.equal("materials" in artifact.payload, false);
  });

  it("rejects a framing-scope envelope with the wrong artifact type", () => {
    const result = framingScopeArtifactSchema.safeParse({
      artifactId: "ART-022",
      artifactType: "final-framing-takeoff",
      schemaVersion: "1.0.0",
      artifactVersion: 1,
      engineVersion: "0.1.0",
      pipelineRunId: "RUN-001",
      projectId: "demo-project",
      createdAt: timestamp,
      lastModifiedAt: timestamp,
      producer: { type: "system", identifier: "framing-pipeline" },
      payload: {
        scopeName: "framing",
      },
    });

    assert.equal(result.success, false);
  });
});
