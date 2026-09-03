import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { roofFramingArtifactSchema } from "../../src/scopes/framing/schemas/framing-artifacts.schema.js";

const timestamp = "2026-07-10T12:00:00.000Z";

describe("roof framing artifact contract", () => {
  it("accepts a roof-framing envelope containing resolved systems and planes", () => {
    const artifact = roofFramingArtifactSchema.parse({
      artifactId: "ART-012",
      artifactType: "roof-framing",
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
        systems: [
          {
            id: "RFS-001",
            objectType: "roof-framing-system",
            name: "Main roof framing",
            level: "Roof",
            constructionPhase: "new",
            assembly: {
              framingType: "rafter",
              memberSize: "2x8",
              memberSpacingInches: 24,
            },
            planeIds: ["RP-001"],
          },
        ],
        planes: [
          {
            id: "RP-001",
            objectType: "roof-plane",
            parentSystemId: "RFS-001",
            pitch: "6:12",
            spanDirection: "east-west",
            boundingWallIds: ["W-001"],
            openingIds: ["O-021"],
            structuralMemberIds: ["SM-014"],
          },
        ],
      },
    });

    assert.equal(artifact.artifactType, "roof-framing");
    assert.equal(artifact.payload.systems[0]?.id, "RFS-001");
    assert.deepEqual(artifact.payload.systems[0]?.planeIds, ["RP-001"]);
    assert.equal(artifact.payload.planes[0]?.parentSystemId, "RFS-001");
    assert.equal(artifact.payload.planes[0]?.rafterLayoutLengthFeet, null);
    assert.equal("roofFramingSystems" in artifact.payload, false);
  });

  it("rejects a roof-framing envelope with the wrong artifact type", () => {
    const result = roofFramingArtifactSchema.safeParse({
      artifactId: "ART-012",
      artifactType: "floor-framing",
      schemaVersion: "1.0.0",
      artifactVersion: 1,
      engineVersion: "0.1.0",
      pipelineRunId: "RUN-001",
      projectId: "demo-project",
      createdAt: timestamp,
      lastModifiedAt: timestamp,
      producer: { type: "system", identifier: "framing-pipeline" },
      payload: {
        systems: [],
        planes: [],
      },
    });

    assert.equal(result.success, false);
  });
});
