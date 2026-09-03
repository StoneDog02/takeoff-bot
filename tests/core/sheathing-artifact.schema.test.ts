import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { sheathingArtifactSchema } from "../../src/framing/schemas/framing-artifacts.schema.js";

const timestamp = "2026-07-10T12:00:00.000Z";

describe("sheathing artifact contract", () => {
  it("accepts a sheathing envelope containing resolved systems and areas", () => {
    const artifact = sheathingArtifactSchema.parse({
      artifactId: "ART-015",
      artifactType: "sheathing",
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
            id: "SHS-001",
            objectType: "sheathing-system",
            name: "Level 1 exterior wall sheathing",
            level: "Level 1",
            application: "wall",
            constructionPhase: "new",
            panelSpecification: {
              panelType: "OSB",
              thickness: "7/16\"",
              specificationReference: "S1.0 wall sheathing note",
            },
            areaIds: ["SHA-001"],
          },
        ],
        areas: [
          {
            id: "SHA-001",
            objectType: "sheathing-area",
            parentSystemId: "SHS-001",
            coveredObjectIds: ["W-001"],
            openingIds: ["O-014"],
          },
        ],
      },
    });

    assert.equal(artifact.artifactType, "sheathing");
    assert.equal(artifact.payload.systems[0]?.id, "SHS-001");
    assert.deepEqual(artifact.payload.systems[0]?.areaIds, ["SHA-001"]);
    assert.deepEqual(artifact.payload.areas[0]?.coveredObjectIds, ["W-001"]);
    assert.equal("walls" in artifact.payload, false);
    assert.equal("openings" in artifact.payload, false);
  });

  it("rejects a sheathing envelope with the wrong artifact type", () => {
    const result = sheathingArtifactSchema.safeParse({
      artifactId: "ART-015",
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
        areas: [],
      },
    });

    assert.equal(result.success, false);
  });
});
