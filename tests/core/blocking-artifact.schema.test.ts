import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { blockingArtifactSchema } from "../../src/scopes/framing/schemas/framing-artifacts.schema.js";

const complete = {
  status: "complete",
  percentage: 100,
  completedItems: 1,
  totalItems: 1,
} as const;

const timestamp = "2026-07-10T12:00:00.000Z";

describe("blocking artifact contract", () => {
  it("accepts a blocking envelope containing resolved blocking objects", () => {
    const artifact = blockingArtifactSchema.parse({
      artifactId: "ART-016",
      artifactType: "blocking",
      schemaVersion: "1.0.0",
      artifactVersion: 1,
      engineVersion: "0.1.0",
      pipelineRunId: "RUN-001",
      projectId: "demo-project",
      createdAt: timestamp,
      lastModifiedAt: timestamp,
      producer: { type: "system", identifier: "framing-pipeline" },
      inputArtifactIds: ["ART-015"],
      parentArtifactIds: ["ART-015"],
      payload: {
        blocking: [
          {
            id: "BLK-001",
            objectType: "blocking",
            completion: complete,
            reviewStatus: "no-review-required",
            blockingStatus: "not-blocked",
            blockingType: "solid blocking",
            purpose: "sheathing edge support",
            structuralRole: "structural",
            material: "dimensional-lumber",
            size: "2x10",
            spacingInches: 48,
            location: "Level 2 floor bay between W-001 and W-002",
            detailReference: "S3.1/3",
            associatedObjectIds: ["FFA-001", "SHA-001"],
          },
        ],
      },
    });

    assert.equal(artifact.artifactType, "blocking");
    assert.equal(artifact.payload.blocking[0]?.id, "BLK-001");
    assert.deepEqual(artifact.payload.blocking[0]?.associatedObjectIds, [
      "FFA-001",
      "SHA-001",
    ]);
    assert.equal("structuralMembers" in artifact.payload, false);
    assert.equal("systems" in artifact.payload, false);
  });

  it("rejects a blocking envelope with the wrong artifact type", () => {
    const result = blockingArtifactSchema.safeParse({
      artifactId: "ART-016",
      artifactType: "sheathing",
      schemaVersion: "1.0.0",
      artifactVersion: 1,
      engineVersion: "0.1.0",
      pipelineRunId: "RUN-001",
      projectId: "demo-project",
      createdAt: timestamp,
      lastModifiedAt: timestamp,
      producer: { type: "system", identifier: "framing-pipeline" },
      payload: {
        blocking: [],
      },
    });

    assert.equal(result.success, false);
  });
});
