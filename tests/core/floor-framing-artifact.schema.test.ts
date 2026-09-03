import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { floorFramingArtifactSchema } from "../../src/scopes/framing/schemas/framing-artifacts.schema.js";

const timestamp = "2026-07-10T12:00:00.000Z";

describe("floor framing artifact contract", () => {
  it("accepts a floor-framing envelope containing resolved systems and areas", () => {
    const artifact = floorFramingArtifactSchema.parse({
      artifactId: "ART-011",
      artifactType: "floor-framing",
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
            id: "FFS-001",
            objectType: "floor-framing-system",
            name: "Level 2 floor framing",
            level: "Level 2",
            constructionPhase: "new",
            assembly: {
              joistType: "i-joist",
              joistSize: "11-7/8",
              joistSpacingInches: 16,
              rimBoard: "1-1/8 rim board",
            },
            areaIds: ["FFA-001"],
          },
        ],
        areas: [
          {
            id: "FFA-001",
            objectType: "floor-framing-area",
            parentSystemId: "FFS-001",
            spanDirection: "north-south",
            boundingWallIds: ["W-001"],
            openingIds: ["O-014"],
            structuralMemberIds: ["SM-008"],
          },
        ],
      },
    });

    assert.equal(artifact.artifactType, "floor-framing");
    assert.equal(artifact.payload.systems[0]?.id, "FFS-001");
    assert.deepEqual(artifact.payload.systems[0]?.areaIds, ["FFA-001"]);
    assert.equal(artifact.payload.areas[0]?.parentSystemId, "FFS-001");
    assert.equal("floorFramingSystems" in artifact.payload, false);
  });

  it("rejects a floor-framing envelope with the wrong artifact type", () => {
    const result = floorFramingArtifactSchema.safeParse({
      artifactId: "ART-011",
      artifactType: "wall-framing",
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
        areas: [],
      },
    });

    assert.equal(result.success, false);
  });
});
