import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { ArtifactStore } from "../../src/core/artifacts/ArtifactStore.js";
import { PipelineRunner } from "../../src/core/pipeline/PipelineRunner.js";
import type { PipelineStage } from "../../src/core/pipeline/types.js";
import { indexPlan } from "../../src/plans/indexPlan.js";
import { buildGeometryEvidenceFromCompiledPages } from "../../src/scopes/framing/geometry/buildGeometryEvidenceFromCompiledPages.js";
import { mergeExtractedAndGeometryEvidence } from "../../src/scopes/framing/geometry/mergeExtractedAndGeometryEvidence.js";
import {
  compiledDrawingPagesArtifactSchema,
  extractedFramingEvidenceArtifactSchema,
  type CompiledDrawingPagesPayload,
} from "../../src/scopes/framing/schemas/framing-artifacts.schema.js";
import {
  createFramingStageArtifact,
  createFramingStages,
} from "../../src/scopes/framing/stages/createFramingStages.js";

const BURT_PDF = path.join("tests", "fixtures", "burt-build-plans.pdf");
const WALL_FIXTURE_PDF = path.join("tests", "fixtures", "wall-w001-text-layer.pdf");

function replaceStage(
  stages: PipelineStage[],
  name: string,
  run: PipelineStage["run"],
): PipelineStage[] {
  return stages.map((stage) => (stage.name === name ? { ...stage, run } : stage));
}

function getPayload<T>(context: Parameters<PipelineStage["run"]>[0], stageName: string): T {
  const artifact = context.completedArtifacts.get(stageName);
  if (!artifact) {
    throw new Error(`Required artifact from stage '${stageName}' is missing.`);
  }
  return artifact.payload as T;
}

function withCompilerOnlyEvidence(stages: PipelineStage[]): PipelineStage[] {
  return replaceStage(stages, "extractedEvidence", async (context) => {
    const compiledPages = getPayload<CompiledDrawingPagesPayload>(
      context,
      "compiledDrawingPages",
    );
    const geometryEvidence = buildGeometryEvidenceFromCompiledPages(
      compiledPages.pages,
    );
    const merged = mergeExtractedAndGeometryEvidence({
      claudeEvidence: [],
      geometryEvidence,
    });

    return createFramingStageArtifact(
      context,
      6,
      extractedFramingEvidenceArtifactSchema,
      "extracted-framing-evidence",
      { evidence: merged.evidence },
      { type: "system", identifier: "framing-pipeline" },
    );
  });
}

describe("pipeline compiler integration", () => {
  const originalCompiler = process.env.TAKEOFF_COMPILER;

  beforeEach(() => {
    process.env.TAKEOFF_COMPILER = "1";
  });

  afterEach(() => {
    if (originalCompiler == null) {
      delete process.env.TAKEOFF_COMPILER;
    } else {
      process.env.TAKEOFF_COMPILER = originalCompiler;
    }
  });

  it(
    "runs Stage 5 compile and Stage 6 geometry Evidence merge on Burt p2",
    { timeout: 180_000 },
    async () => {
      const artifactRoot = await mkdtemp(path.join(tmpdir(), "takeoff-bot-k-test-"));
      const planIndex = await indexPlan(BURT_PDF);
      const runner = new PipelineRunner(new ArtifactStore(artifactRoot));

      try {
        const result = await runner.run({
          projectId: "test-project",
          pdfPath: BURT_PDF,
          scopeName: "framing",
          planIndex,
          useMockAi: true,
          stages: withCompilerOnlyEvidence(createFramingStages()),
        });

        assert.equal(result.success, true);
        assert.equal(result.stageResults.length, 16);

        const compiledStage = result.stageResults.find(
          (stage) => stage.name === "compiledDrawingPages",
        );
        assert.ok(compiledStage);
        assert.equal(compiledStage.order, 5);

        const compiledArtifact = compiledDrawingPagesArtifactSchema.parse(
          JSON.parse(await readFile(compiledStage.artifactPath, "utf8")),
        );
        assert.ok(compiledArtifact.payload.pages.some((page) => page.pageNumber === 2));

        const extractedStage = result.stageResults.find(
          (stage) => stage.name === "extractedEvidence",
        );
        assert.ok(extractedStage);
        assert.equal(extractedStage.order, 6);

        const extractedArtifact = extractedFramingEvidenceArtifactSchema.parse(
          JSON.parse(await readFile(extractedStage.artifactPath, "utf8")),
        );
        const geometryEvidence = extractedArtifact.payload.evidence.filter(
          (record) => record.extractionPassId === "geometry-observation",
        );
        assert.ok(geometryEvidence.length >= 1);
        assert.ok(
          geometryEvidence.some((record) =>
            record.subjectKey.startsWith("physical-run:"),
          ),
        );
      } finally {
        await rm(artifactRoot, { recursive: true, force: true });
      }
    },
  );

  it("keeps a 16-stage chain when compiler is disabled", async () => {
    delete process.env.TAKEOFF_COMPILER;
    const artifactRoot = await mkdtemp(path.join(tmpdir(), "takeoff-bot-k-test-"));
    const planIndex = await indexPlan(WALL_FIXTURE_PDF);
    const runner = new PipelineRunner(new ArtifactStore(artifactRoot));

    try {
      const result = await runner.run({
        projectId: "test-project",
        pdfPath: WALL_FIXTURE_PDF,
        scopeName: "framing",
        planIndex,
        useMockAi: true,
        stages: createFramingStages(),
      });

      assert.equal(result.success, true);
      assert.equal(result.stageResults.length, 16);

      const compiledStage = result.stageResults.find(
        (stage) => stage.name === "compiledDrawingPages",
      );
      assert.ok(compiledStage);
      const compiledArtifact = compiledDrawingPagesArtifactSchema.parse(
        JSON.parse(await readFile(compiledStage!.artifactPath, "utf8")),
      );
      assert.equal(compiledArtifact.payload.pages.length, 0);
    } finally {
      await rm(artifactRoot, { recursive: true, force: true });
    }
  });
});
