import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { userDecisionArtifactSchema } from "../../src/scopes/framing/schemas/framing-artifacts.schema.js";

const timestamp = "2026-07-10T12:00:00.000Z";

describe("user-decision artifact contract", () => {
  it("accepts one user decision per envelope", () => {
    const artifact = userDecisionArtifactSchema.parse({
      artifactId: "ART-019",
      artifactType: "user-decision",
      schemaVersion: "1.0.0",
      artifactVersion: 1,
      engineVersion: "0.1.0",
      pipelineRunId: "RUN-001",
      projectId: "demo-project",
      createdAt: timestamp,
      lastModifiedAt: timestamp,
      producer: { type: "user", identifier: "user-014" },
      inputArtifactIds: ["ART-009"],
      parentArtifactIds: ["ART-009"],
      payload: {
        id: "UD-001",
        reviewItemId: "RI-014",
        result: {
          type: "value-provided",
          value: "2x6",
          rationale: "Confirmed from the approved addendum.",
        },
      },
    });

    assert.equal(artifact.artifactType, "user-decision");
    assert.equal(artifact.payload.id, "UD-001");
    assert.equal(artifact.payload.reviewItemId, "RI-014");
    assert.equal("userDecisions" in artifact, false);
    assert.equal("reviewItem" in artifact.payload, false);
  });

  it("rejects a user-decision envelope with the wrong artifact type", () => {
    const result = userDecisionArtifactSchema.safeParse({
      artifactId: "ART-019",
      artifactType: "assumptions",
      schemaVersion: "1.0.0",
      artifactVersion: 1,
      engineVersion: "0.1.0",
      pipelineRunId: "RUN-001",
      projectId: "demo-project",
      createdAt: timestamp,
      lastModifiedAt: timestamp,
      producer: { type: "user", identifier: "user-014" },
      payload: {
        id: "UD-001",
        reviewItemId: "RI-014",
        result: { type: "confirmed" },
      },
    });

    assert.equal(result.success, false);
  });
});
