import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { loadPipelineRunResultFromArtifactDir } from "../../src/ui/loadPipelineRunResultFromArtifactDir.js";

const BECKSTEAD_ARTIFACT_DIR = path.resolve(
  "artifacts/b2.2m.2/runs/beckstead-audit-a/framing",
);

describe("loadPipelineRunResultFromArtifactDir", () => {
  it("rejects a missing artifact directory", async () => {
    await assert.rejects(
      () =>
        loadPipelineRunResultFromArtifactDir(
          path.join(tmpdir(), "takeoff-ui-missing-artifacts"),
        ),
      /TAKEOFF_UI_ARTIFACT_DIR does not exist or is not readable/,
    );
  });

  it("rejects a directory without required stage artifacts", async () => {
    const artifactDir = await mkdtemp(path.join(tmpdir(), "takeoff-ui-empty-artifacts-"));

    try {
      await writeFile(
        path.join(artifactDir, "16-report.json"),
        JSON.stringify({
          artifactId: "artifact-16-test",
          artifactType: "final-framing-takeoff",
          projectId: "test",
          pipelineRunId: "run-test",
          payload: { summary: {}, materials: [] },
        }),
      );

      await assert.rejects(
        () => loadPipelineRunResultFromArtifactDir(artifactDir),
        /missing required framing stage artifacts/,
      );
    } finally {
      await rm(artifactDir, { recursive: true, force: true });
    }
  });

  if (existsSync(BECKSTEAD_ARTIFACT_DIR)) {
    it("reconstructs Beckstead Audit #3 PipelineRunResult", async () => {
      const loaded = await loadPipelineRunResultFromArtifactDir(
        BECKSTEAD_ARTIFACT_DIR,
      );

      assert.equal(loaded.projectId, "beckstead-audit-a");
      assert.equal(loaded.result.success, true);
      assert.equal(loaded.result.scopeName, "framing");
      assert.ok(loaded.result.reportPath?.endsWith("16-report.json"));
      assert.ok(
        loaded.result.stageResults.some((stage) => stage.name === "validation"),
      );
      assert.ok(
        loaded.result.stageResults.some((stage) => stage.name === "calculations"),
      );
      assert.match(loaded.pdfPath ?? "", /beckstead-residence-plans\.pdf$/);
    });
  }
});
