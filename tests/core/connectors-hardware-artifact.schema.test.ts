import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { connectorsHardwareArtifactSchema } from "../../src/scopes/framing/schemas/framing-artifacts.schema.js";

const complete = {
  status: "complete",
  percentage: 100,
  completedItems: 1,
  totalItems: 1,
} as const;

const timestamp = "2026-07-10T12:00:00.000Z";

describe("connectors-hardware artifact contract", () => {
  it("accepts a connectors-hardware envelope containing resolved objects", () => {
    const artifact = connectorsHardwareArtifactSchema.parse({
      artifactId: "ART-017",
      artifactType: "connectors-hardware",
      schemaVersion: "1.0.0",
      artifactVersion: 1,
      engineVersion: "0.1.0",
      pipelineRunId: "RUN-001",
      projectId: "demo-project",
      createdAt: timestamp,
      lastModifiedAt: timestamp,
      producer: { type: "system", identifier: "framing-pipeline" },
      inputArtifactIds: ["ART-014"],
      parentArtifactIds: ["ART-014"],
      payload: {
        connectors: [
          {
            id: "CN-001",
            objectType: "connector",
            completion: complete,
            reviewStatus: "no-review-required",
            blockingStatus: "not-blocked",
            connectorType: "joist hanger",
            model: "HUS26",
            associatedObjectIds: ["SM-008"],
            hardwareIds: ["HW-001"],
            fastenerIds: ["FS-001"],
          },
        ],
        hardware: [
          {
            id: "HW-001",
            objectType: "hardware",
            completion: complete,
            reviewStatus: "no-review-required",
            blockingStatus: "not-blocked",
            hardwareType: "bearing plate",
            associatedObjectIds: ["SM-008", "CN-001"],
          },
        ],
        fasteners: [
          {
            id: "FS-001",
            objectType: "fastener",
            completion: complete,
            reviewStatus: "no-review-required",
            blockingStatus: "not-blocked",
            fastenerType: "nail",
            diameter: "0.148\"",
            length: "3-1/2\"",
            coating: "hot-dip galvanized",
            quantity: 40,
            associatedObjectIds: ["CN-001"],
          },
        ],
      },
    });

    assert.equal(artifact.artifactType, "connectors-hardware");
    assert.equal(artifact.payload.connectors[0]?.id, "CN-001");
    assert.deepEqual(artifact.payload.connectors[0]?.hardwareIds, ["HW-001"]);
    assert.deepEqual(artifact.payload.connectors[0]?.fastenerIds, ["FS-001"]);
    assert.equal(artifact.payload.hardware[0]?.id, "HW-001");
    assert.equal(artifact.payload.fasteners[0]?.id, "FS-001");
    assert.equal("structuralMembers" in artifact.payload, false);
  });

  it("rejects a connectors-hardware envelope with the wrong artifact type", () => {
    const result = connectorsHardwareArtifactSchema.safeParse({
      artifactId: "ART-017",
      artifactType: "structural-members",
      schemaVersion: "1.0.0",
      artifactVersion: 1,
      engineVersion: "0.1.0",
      pipelineRunId: "RUN-001",
      projectId: "demo-project",
      createdAt: timestamp,
      lastModifiedAt: timestamp,
      producer: { type: "system", identifier: "framing-pipeline" },
      payload: {
        connectors: [],
        hardware: [],
        fasteners: [],
      },
    });

    assert.equal(result.success, false);
  });
});
