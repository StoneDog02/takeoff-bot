import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assumptionsArtifactSchema } from "../../src/framing/schemas/framing-artifacts.schema.js";

const timestamp = "2026-07-10T12:00:00.000Z";

const activeAssumption = {
  id: "A-014",
  category: "industry-default",
  target: {
    objectId: "W-017",
    objectType: "building-wall",
    propertyPath: "assembly.studSize",
  },
  assumedValue: "2x4",
  source: {
    type: "construction-brain",
    reference: "knowledge/framing/10-assumptions.md",
    explanation: "Approved default for an unresolved wall stud size.",
  },
  reasonUsed:
    "Wall depth could not be resolved from plan linework or schedules.",
  materialImpact: {
    level: "high",
    explanation: "Changes stud and plate material selections.",
    affectedQuantityKeys: ["wall.studs", "wall.plates"],
  },
  riskLevel: "medium",
  reviewRequired: true,
} as const;

describe("assumptions artifact contract", () => {
  it("accepts an assumptions envelope containing assumption records", () => {
    const artifact = assumptionsArtifactSchema.parse({
      artifactId: "ART-018",
      artifactType: "assumptions",
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
        assumptions: [activeAssumption],
      },
    });

    assert.equal(artifact.artifactType, "assumptions");
    assert.equal(artifact.payload.assumptions[0]?.id, "A-014");
    assert.equal(artifact.payload.assumptions[0]?.target.objectId, "W-017");
    assert.equal("walls" in artifact.payload, false);
    assert.equal("replacementValue" in artifact.payload.assumptions[0]!, false);
  });

  it("rejects an assumptions envelope with the wrong artifact type", () => {
    const result = assumptionsArtifactSchema.safeParse({
      artifactId: "ART-018",
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
        assumptions: [],
      },
    });

    assert.equal(result.success, false);
  });
});
