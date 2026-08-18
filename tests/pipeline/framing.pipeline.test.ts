import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { ArtifactStore } from "../../src/core/artifacts/ArtifactStore.js";
import { PipelineRunner } from "../../src/core/pipeline/PipelineRunner.js";
import { finalFramingTakeoffArtifactSchema } from "../../src/scopes/framing/schemas/framing-artifacts.schema.js";
import { WALL_FRAMING_RULE_IDS } from "../../src/scopes/framing/validators/rule-ids.js";
import { createFramingStages } from "../../src/scopes/framing/stages/createFramingStages.js";
import { indexPlan } from "../../src/plans/indexPlan.js";

describe("framing pipeline", () => {
  it("produces twelve immutable artifacts and a final takeoff report", async () => {
    const artifactRoot = await mkdtemp(path.join(tmpdir(), "takeoff-bot-test-"));

    try {
      const planIndex = await indexPlan("./plans/sample.pdf");
      const runner = new PipelineRunner(new ArtifactStore(artifactRoot));
      const result = await runner.run({
        projectId: "test-project",
        pdfPath: "./plans/sample.pdf",
        scopeName: "framing",
        planIndex,
        useMockAi: true,
        stages: createFramingStages(),
      });

      assert.equal(result.success, true);
      assert.equal(result.stageResults.length, 12);

      const openingsStage = result.stageResults.find(
        (stage) => stage.name === "openings",
      );
      assert.ok(openingsStage);
      assert.equal(openingsStage.artifactType, "openings");

      const structuralMembersStage = result.stageResults.find(
        (stage) => stage.name === "structuralMembers",
      );
      assert.ok(structuralMembersStage);
      assert.equal(structuralMembersStage.artifactType, "structural-members");

      const validationStage = result.stageResults.find(
        (stage) => stage.name === "validation",
      );
      assert.ok(validationStage);
      assert.equal(validationStage.artifactType, "validation");

      const validationArtifact = JSON.parse(
        await readFile(validationStage.artifactPath, "utf8"),
      );
      assert.ok(
        validationArtifact.payload.validationResults.some(
          (result: { ruleId: string; outcome: string }) =>
            result.ruleId === WALL_FRAMING_RULE_IDS.typeResolved &&
            result.outcome === "passed",
        ),
      );
      assert.equal(validationArtifact.payload.validationIssues.length, 0);

      const confidenceStage = result.stageResults.find(
        (stage) => stage.name === "confidence",
      );
      assert.ok(confidenceStage);
      assert.equal(confidenceStage.artifactType, "confidence");
      assert.ok(result.reportPath);

      const report = finalFramingTakeoffArtifactSchema.parse(
        JSON.parse(await readFile(result.reportPath, "utf8")),
      );
      assert.equal(report.payload.summary.wallCount, 1);
      assert.equal(report.payload.summary.materialLineItemCount, 2);
      assert.deepEqual(
        report.payload.materials.map((item) => item.quantity),
        [16, 60],
      );
    } finally {
      await rm(artifactRoot, { recursive: true, force: true });
    }
  });
});
