import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validationArtifactSchema } from "../../src/scopes/framing/schemas/framing-artifacts.schema.js";

const timestamp = "2026-07-10T12:00:00.000Z";

const objectTarget = {
  kind: "object",
  objectId: "W-017",
  objectType: "building-wall",
} as const;

const warningIssue = {
  id: "VI-001",
  severity: "warning",
  level: "object",
  ruleId: "wall.height.resolved",
  ruleViolated: "Wall height must be resolved or assumed.",
  explanation: "The wall height was filled by an approved default.",
  recommendedUserAction: "Confirm the assumed wall height.",
  target: objectTarget,
  evidenceIds: ["E-001"],
  quantityImpacts: [
    {
      quantityKey: "wall.studs",
      description: "Stud lengths may change.",
      canCalculate: true,
    },
  ],
  reviewItemIds: ["RI-001"],
} as const;

const failedResult = {
  id: "VR-001",
  ruleId: "wall.height.resolved",
  level: "object",
  target: objectTarget,
  outcome: "failed",
  explanation: "Wall height is unresolved without an approved assumption.",
  validationIssueIds: ["VI-001"],
  evidenceIds: ["E-001"],
} as const;

const reviewItem = {
  id: "RI-001",
  kind: "actionable",
  origin: "validation",
  reason: "missing-information",
  title: "Confirm assumed wall height",
  description: "Wall W-017 height was filled by an approved default.",
  action: {
    type: "confirm",
    instruction: "Confirm the assumed wall height before final takeoff.",
    targetProperty: "geometry.heightFeet",
  },
  reviewStatus: "review-required",
  blockingStatus: "not-blocked",
  affectedObjects: [
    { objectId: "W-017", objectType: "building-wall" },
  ],
  validationIssueIds: ["VI-001"],
} as const;

describe("validation artifact contract", () => {
  it("accepts a validation envelope containing issues, results, and review items", () => {
    const artifact = validationArtifactSchema.parse({
      artifactId: "ART-020",
      artifactType: "validation",
      schemaVersion: "1.0.0",
      artifactVersion: 1,
      engineVersion: "0.1.0",
      pipelineRunId: "RUN-001",
      projectId: "demo-project",
      createdAt: timestamp,
      lastModifiedAt: timestamp,
      producer: { type: "system", identifier: "framing-pipeline" },
      inputArtifactIds: ["ART-006"],
      parentArtifactIds: ["ART-006"],
      payload: {
        validationIssues: [warningIssue],
        validationResults: [failedResult],
        reviewItems: [reviewItem],
      },
    });

    assert.equal(artifact.artifactType, "validation");
    assert.equal(artifact.payload.validationIssues[0]?.id, "VI-001");
    assert.equal(artifact.payload.validationResults[0]?.id, "VR-001");
    assert.equal(artifact.payload.reviewItems[0]?.id, "RI-001");
    assert.equal(
      artifact.payload.validationIssues[0]?.reviewItemIds[0],
      "RI-001",
    );
    assert.equal("confidenceEvaluations" in artifact.payload, false);
    assert.equal("walls" in artifact.payload, false);
  });

  it("rejects a validation envelope with the wrong artifact type", () => {
    const result = validationArtifactSchema.safeParse({
      artifactId: "ART-020",
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
        validationIssues: [],
        validationResults: [],
        reviewItems: [],
      },
    });

    assert.equal(result.success, false);
  });
});
