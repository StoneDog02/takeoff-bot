import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { openingsArtifactSchema } from "../../src/scopes/framing/schemas/framing-artifacts.schema.js";

const complete = {
  status: "complete",
  percentage: 100,
  completedItems: 1,
  totalItems: 1,
} as const;

const timestamp = "2026-07-10T12:00:00.000Z";

describe("openings artifact contract", () => {
  it("accepts an openings envelope containing resolved openings", () => {
    const artifact = openingsArtifactSchema.parse({
      artifactId: "ART-013",
      artifactType: "openings",
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
        openings: [
          {
            id: "O-014",
            objectType: "opening",
            completion: complete,
            reviewStatus: "no-review-required",
            blockingStatus: "not-blocked",
            category: "window",
            parentObjectId: "WS-001",
            parentWallId: "W-001",
            dimensions: {
              nominalWidthFeet: 3,
              nominalHeightFeet: 4,
            },
            quantity: 1,
            scheduleReference: "Window Schedule",
            headerMemberId: "SM-008",
          },
        ],
      },
    });

    assert.equal(artifact.artifactType, "openings");
    assert.equal(artifact.payload.openings[0]?.id, "O-014");
    assert.equal(artifact.payload.openings[0]?.headerMemberId, "SM-008");
    assert.equal("structuralMembers" in artifact.payload, false);
  });

  it("rejects an openings envelope with the wrong artifact type", () => {
    const result = openingsArtifactSchema.safeParse({
      artifactId: "ART-013",
      artifactType: "framing-objects",
      schemaVersion: "1.0.0",
      artifactVersion: 1,
      engineVersion: "0.1.0",
      pipelineRunId: "RUN-001",
      projectId: "demo-project",
      createdAt: timestamp,
      lastModifiedAt: timestamp,
      producer: { type: "system", identifier: "framing-pipeline" },
      payload: {
        openings: [],
      },
    });

    assert.equal(result.success, false);
  });
});
