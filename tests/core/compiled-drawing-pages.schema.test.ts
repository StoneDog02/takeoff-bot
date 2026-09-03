import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  compiledDrawingPagesArtifactSchema,
  compilerAutomationAuditArtifactSchema,
} from "../../src/framing/schemas/framing-artifacts.schema.js";

const timestamp = "2026-08-21T12:00:00.000Z";

describe("compiled drawing pages artifact contract", () => {
  it("accepts compiled-drawing-pages and compiler-automation-audit envelopes", () => {
    const compiled = compiledDrawingPagesArtifactSchema.parse({
      artifactId: "ART-005",
      artifactType: "compiled-drawing-pages",
      schemaVersion: "1.0.0",
      artifactVersion: 1,
      engineVersion: "0.1.0",
      pipelineRunId: "RUN-001",
      projectId: "demo-project",
      createdAt: timestamp,
      lastModifiedAt: timestamp,
      producer: { type: "system", identifier: "drawing-compiler" },
      inputArtifactIds: ["ART-004"],
      parentArtifactIds: ["ART-004"],
      payload: { pages: [] },
    });

    const audit = compilerAutomationAuditArtifactSchema.parse({
      artifactId: "ART-005A",
      artifactType: "compiler-automation-audit",
      schemaVersion: "1.0.0",
      artifactVersion: 1,
      engineVersion: "0.1.0",
      pipelineRunId: "RUN-001",
      projectId: "demo-project",
      createdAt: timestamp,
      lastModifiedAt: timestamp,
      producer: { type: "system", identifier: "drawing-compiler" },
      inputArtifactIds: ["ART-005"],
      parentArtifactIds: ["ART-005"],
      payload: {
        compiledPageNumbers: [],
        physicalRuns: {
          detected: 0,
          highAuthority: 0,
          governedEmit: 0,
          lengthResolved: 0,
        },
        byReason: {
          automated: 0,
          "compiler-unresolved": 0,
          "source-authority-missing": 0,
          "page-role-blocked": 0,
          "scale-unresolved": 0,
          "scale-rejected": 0,
          "virtual-text-blocked": 0,
          "conflicting-authority": 0,
        },
        conflicts: [],
        timingMs: { total: 0, perPage: {} },
      },
    });

    assert.equal(compiled.artifactType, "compiled-drawing-pages");
    assert.equal(audit.payload.byReason.automated, 0);
  });
});
