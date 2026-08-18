import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { confidenceArtifactSchema } from "../../src/scopes/framing/schemas/framing-artifacts.schema.js";

const timestamp = "2026-07-10T12:00:00.000Z";

const objectEvaluation = {
  id: "CE-001",
  target: {
    kind: "object",
    objectId: "W-017",
    objectType: "building-wall",
  },
  evidence: { label: "high", explanation: "Plan and schedule agree." },
  resolution: {
    label: "high",
    explanation: "Resolved from explicit project values.",
  },
  validation: { label: "high", explanation: "All rules passed." },
  overallLabel: "high",
  completion: { status: "complete", percentage: 100 },
  reviewStatus: "review-required",
  blockingStatus: "not-blocked",
  quantityImpactWeight: "high",
  explanation: "The wall is fully resolved; confirmation is still required.",
  evidenceIds: ["E-001"],
  validationResultIds: ["VR-002"],
  reviewItemIds: ["RI-001"],
} as const;

describe("confidence artifact contract", () => {
  it("accepts a confidence envelope containing confidence evaluations", () => {
    const artifact = confidenceArtifactSchema.parse({
      artifactId: "ART-021",
      artifactType: "confidence",
      schemaVersion: "1.0.0",
      artifactVersion: 1,
      engineVersion: "0.1.0",
      pipelineRunId: "RUN-001",
      projectId: "demo-project",
      createdAt: timestamp,
      lastModifiedAt: timestamp,
      producer: { type: "system", identifier: "framing-pipeline" },
      inputArtifactIds: ["ART-020"],
      parentArtifactIds: ["ART-020"],
      payload: {
        confidenceEvaluations: [objectEvaluation],
      },
    });

    assert.equal(artifact.artifactType, "confidence");
    assert.equal(artifact.payload.confidenceEvaluations[0]?.id, "CE-001");
    assert.equal(
      artifact.payload.confidenceEvaluations[0]?.overallLabel,
      "high",
    );
    assert.equal(
      artifact.payload.confidenceEvaluations[0]?.reviewStatus,
      "review-required",
    );
    assert.equal(
      artifact.payload.confidenceEvaluations[0]?.blockingStatus,
      "not-blocked",
    );
    assert.equal("validationIssues" in artifact.payload, false);
    assert.equal("reviewItems" in artifact.payload, false);
    assert.equal("walls" in artifact.payload, false);
  });

  it("rejects a confidence envelope with the wrong artifact type", () => {
    const result = confidenceArtifactSchema.safeParse({
      artifactId: "ART-021",
      artifactType: "validation-confidence",
      schemaVersion: "1.0.0",
      artifactVersion: 1,
      engineVersion: "0.1.0",
      pipelineRunId: "RUN-001",
      projectId: "demo-project",
      createdAt: timestamp,
      lastModifiedAt: timestamp,
      producer: { type: "system", identifier: "framing-pipeline" },
      payload: {
        confidenceEvaluations: [objectEvaluation],
      },
    });

    assert.equal(result.success, false);
  });
});
