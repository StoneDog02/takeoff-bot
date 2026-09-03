import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { structuralMembersArtifactSchema } from "../../src/scopes/framing/schemas/framing-artifacts.schema.js";

const timestamp = "2026-07-10T12:00:00.000Z";

describe("structural members artifact contract", () => {
  it("accepts a structural-members envelope containing resolved members", () => {
    const artifact = structuralMembersArtifactSchema.parse({
      artifactId: "ART-014",
      artifactType: "structural-members",
      schemaVersion: "1.0.0",
      artifactVersion: 1,
      engineVersion: "0.1.0",
      pipelineRunId: "RUN-001",
      projectId: "demo-project",
      createdAt: timestamp,
      lastModifiedAt: timestamp,
      producer: { type: "system", identifier: "framing-pipeline" },
      inputArtifactIds: ["ART-013"],
      parentArtifactIds: ["ART-013"],
      payload: {
        structuralMembers: [
          {
            id: "SM-008",
            objectType: "structural-member",
            category: "header",
            materialType: "lvl",
            size: "1.75x11.875",
            plyCount: 2,
            lengthFeet: 6,
            quantity: 1,
            location: "W-001 window header",
            associatedObjectIds: ["O-014", "W-001"],
            connectorIds: ["CN-001"],
          },
        ],
      },
    });

    assert.equal(artifact.artifactType, "structural-members");
    assert.equal(artifact.payload.structuralMembers[0]?.id, "SM-008");
    assert.deepEqual(artifact.payload.structuralMembers[0]?.connectorIds, [
      "CN-001",
    ]);
    assert.equal("openings" in artifact.payload, false);
    assert.equal("connectors" in artifact.payload, false);
  });

  it("accepts nullable quantity and location for partially resolved members", () => {
    const artifact = structuralMembersArtifactSchema.parse({
      artifactId: "ART-014",
      artifactType: "structural-members",
      schemaVersion: "1.0.0",
      artifactVersion: 1,
      engineVersion: "0.1.0",
      pipelineRunId: "RUN-001",
      projectId: "demo-project",
      createdAt: timestamp,
      lastModifiedAt: timestamp,
      producer: { type: "system", identifier: "framing-pipeline" },
      inputArtifactIds: ["ART-013"],
      parentArtifactIds: ["ART-013"],
      payload: {
        structuralMembers: [
          {
            id: "SM-008",
            objectType: "structural-member",
            category: "header",
            materialType: "lvl",
            size: "1.75x11.875",
            plyCount: null,
            lengthFeet: 6,
            quantity: null,
            location: null,
            associatedObjectIds: [],
            connectorIds: [],
          },
        ],
      },
    });

    assert.equal(artifact.payload.structuralMembers[0]?.quantity, null);
    assert.equal(artifact.payload.structuralMembers[0]?.location, null);
  });

  it("rejects a structural-members envelope with the wrong artifact type", () => {
    const result = structuralMembersArtifactSchema.safeParse({
      artifactId: "ART-014",
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
        structuralMembers: [],
      },
    });

    assert.equal(result.success, false);
  });
});
