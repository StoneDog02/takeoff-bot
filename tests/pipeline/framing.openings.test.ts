import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { ArtifactStore } from "../../src/core/artifacts/ArtifactStore.js";
import { PipelineRunner } from "../../src/core/pipeline/PipelineRunner.js";
import type { PipelineStage } from "../../src/core/pipeline/types.js";
import { indexPlan } from "../../src/plans/indexPlan.js";
import {
  extractedFramingEvidenceArtifactSchema,
  finalFramingTakeoffArtifactSchema,
} from "../../src/scopes/framing/schemas/framing-artifacts.schema.js";
import {
  createFramingStageArtifact,
  createFramingStages,
} from "../../src/scopes/framing/stages/createFramingStages.js";
import { buildCompleteOpeningEvidence } from "../fixtures/openingEvidence.js";
import { buildMixedDomainWallEvidence } from "../fixtures/mixedDomainEvidence.js";
import { OPENINGS_RULE_IDS } from "../../src/scopes/framing/validators/rule-ids.js";
import {
  kingStudMaterialForOpening,
  roughSillMaterialForOpening,
  plateMaterialForSegment,
  readCanonicalWallFramingFromDisk,
  studMaterialForSegment,
  WALL_FRAMING_OPENING_LINKS_COMPANION_SUFFIX,
} from "../integration/liveFramingProofHelpers.js";
import { wallFramingArtifactSchema } from "../../src/scopes/framing/schemas/framing-artifacts.schema.js";

const WALL_FIXTURE_PDF = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/wall-w001-text-layer.pdf",
);

function replaceStage(
  stages: PipelineStage[],
  name: string,
  run: PipelineStage["run"],
): PipelineStage[] {
  return stages.map((stage) => (stage.name === name ? { ...stage, run } : stage));
}

function withInjectedWallAndOpeningEvidence(
  stages: PipelineStage[],
  options: { includeWallRelationship?: boolean } = {},
): PipelineStage[] {
  const original = stages.find((stage) => stage.name === "extractedEvidence");
  assert.ok(original, "Expected extractedEvidence stage");

  return replaceStage(stages, "extractedEvidence", async (context) => {
    await original.run(context);
    return createFramingStageArtifact(
      context,
      5,
      extractedFramingEvidenceArtifactSchema,
      "extracted-framing-evidence",
      {
        evidence: [
          ...buildMixedDomainWallEvidence(),
          ...buildCompleteOpeningEvidence("O-001", "E-O001", options),
        ],
      },
      { type: "system", identifier: "framing-pipeline" },
    );
  });
}

async function runFramingPipeline(stages: PipelineStage[]) {
  const artifactRoot = await mkdtemp(path.join(tmpdir(), "takeoff-bot-openings-"));
  const planIndex = await indexPlan(WALL_FIXTURE_PDF);
  const runner = new PipelineRunner(new ArtifactStore(artifactRoot));
  const result = await runner.run({
    projectId: "test-project",
    pdfPath: WALL_FIXTURE_PDF,
    scopeName: "framing",
    planIndex,
    useMockAi: true,
    stages,
  });

  return { artifactRoot, result };
}

function stageByName(
  result: Awaited<ReturnType<typeof runFramingPipeline>>["result"],
  name: string,
) {
  const stage = result.stageResults.find((entry) => entry.name === name);
  assert.ok(stage, `Expected stage ${name}`);
  return stage;
}

async function readArtifact(stagePath: string) {
  return JSON.parse(await readFile(stagePath, "utf8"));
}

describe("framing openings pipeline", () => {
  it("resolves wall and opening domains independently through Stage 12", async () => {
    const { artifactRoot, result } = await runFramingPipeline(
      withInjectedWallAndOpeningEvidence(createFramingStages()),
    );

    try {
      assert.equal(result.success, true);
      assert.equal(result.errors.length, 0);

      const openingsStage = stageByName(result, "openings");
      const wallStage = stageByName(result, "wallFraming");
      const validationStage = stageByName(result, "validation");
      const calculationsStage = stageByName(result, "calculations");
      const reportStage = stageByName(result, "report");

      const openingsArtifact = await readArtifact(openingsStage.artifactPath);
      const wallArtifact = await readArtifact(wallStage.artifactPath);
      const validationArtifact = await readArtifact(validationStage.artifactPath);
      const calculationsArtifact = await readArtifact(
        calculationsStage.artifactPath,
      );
      const reportArtifact =
        finalFramingTakeoffArtifactSchema.parse(
          await readArtifact(reportStage.artifactPath),
        );

      assert.equal(openingsArtifact.payload.openings.length, 1);
      assert.equal(openingsArtifact.payload.openings[0]?.id, "O-001");
      assert.equal(openingsArtifact.payload.openings[0]?.parentObjectId, null);
      assert.equal(openingsArtifact.payload.openings[0]?.parentWallId, null);
      assert.equal(openingsArtifact.payload.openings[0]?.headerMemberId, null);
      assert.equal(openingsArtifact.payload.openings[0]?.category, "window");
      assert.equal(openingsArtifact.payload.openings[0]?.completion.status, "complete");

      assert.equal(wallArtifact.payload.walls.length, 1);
      assert.equal(wallArtifact.payload.segments[0]?.openingIds.length, 0);
      assert.equal(
        openingsStage.companionArtifacts?.some(
          (entry) => entry.fileSuffix === WALL_FRAMING_OPENING_LINKS_COMPANION_SUFFIX,
        ) ?? false,
        false,
      );

      assert.equal(
        validationArtifact.payload.validationIssues.some(
          (issue: { ruleId: string }) => issue.ruleId === "opening.parent.resolved",
        ),
        false,
      );

      const studs = studMaterialForSegment(calculationsArtifact.payload, "WS-001");
      const plates = plateMaterialForSegment(calculationsArtifact.payload, "WS-001");
      assert.ok(studs);
      assert.ok(plates);
      assert.equal(studs.quantity, 16);
      assert.equal(plates.quantity, 60);

      assert.equal(reportArtifact.payload.summary.openingCount, 1);
      assert.deepEqual(reportArtifact.payload.openingIds, ["O-001"]);
    } finally {
      await rm(artifactRoot, { recursive: true, force: true });
    }
  });

  it("resolves explicit O-001 → W-001 relationships through Stage 12", async () => {
    const { artifactRoot, result } = await runFramingPipeline(
      withInjectedWallAndOpeningEvidence(createFramingStages(), {
        includeWallRelationship: true,
      }),
    );

    try {
      assert.equal(result.success, true);

      const openingsStage = stageByName(result, "openings");
      const validationStage = stageByName(result, "validation");
      const calculationsStage = stageByName(result, "calculations");

      const openingsArtifact = await readArtifact(openingsStage.artifactPath);
      const validationArtifact = await readArtifact(validationStage.artifactPath);
      const calculationsArtifact = await readArtifact(
        calculationsStage.artifactPath,
      );

      assert.equal(openingsArtifact.payload.openings[0]?.parentWallId, "W-001");
      assert.equal(openingsArtifact.payload.openings[0]?.parentObjectId, "WS-001");

      const wallStage = stageByName(result, "wallFraming");
      const stage6WallArtifact = wallFramingArtifactSchema.parse(
        await readArtifact(wallStage.artifactPath),
      );
      assert.deepEqual(stage6WallArtifact.payload.segments[0]?.openingIds, []);

      const linkedWallCompanion = openingsStage.companionArtifacts?.find(
        (entry) => entry.fileSuffix === WALL_FRAMING_OPENING_LINKS_COMPANION_SUFFIX,
      );
      assert.ok(linkedWallCompanion);

      const linkedWallArtifact = wallFramingArtifactSchema.parse(
        await readArtifact(linkedWallCompanion.artifactPath),
      );
      assert.deepEqual(linkedWallArtifact.payload.segments[0]?.openingIds, ["O-001"]);
      assert.equal(linkedWallArtifact.artifactVersion, 2);
      assert.ok(
        linkedWallArtifact.inputArtifactIds.includes(stage6WallArtifact.artifactId),
      );
      assert.ok(
        linkedWallArtifact.inputArtifactIds.includes(openingsArtifact.artifactId),
      );
      assert.deepEqual(linkedWallArtifact.parentArtifactIds, [
        stage6WallArtifact.artifactId,
        openingsArtifact.artifactId,
      ]);

      const reloadedWallFraming = await readCanonicalWallFramingFromDisk(
        result.stageResults,
      );
      assert.deepEqual(reloadedWallFraming.segments[0]?.openingIds, ["O-001"]);

      assert.ok(
        validationArtifact.payload.validationResults.some(
          (entry: { ruleId: string; outcome: string; target?: { objectId?: string } }) =>
            entry.ruleId === OPENINGS_RULE_IDS.parentResolved &&
            entry.outcome === "passed" &&
            entry.target?.objectId === "O-001",
        ),
      );
      assert.ok(
        validationArtifact.payload.validationResults.some(
          (entry: { ruleId: string; outcome: string; target?: { objectId?: string } }) =>
            entry.ruleId === OPENINGS_RULE_IDS.parentWallResolved &&
            entry.outcome === "passed" &&
            entry.target?.objectId === "O-001",
        ),
      );

      const studs = studMaterialForSegment(calculationsArtifact.payload, "WS-001");
      const plates = plateMaterialForSegment(calculationsArtifact.payload, "WS-001");
      assert.equal(studs?.quantity, 16);
      assert.equal(plates?.quantity, 60);
      assert.equal(kingStudMaterialForOpening(calculationsArtifact.payload, "O-001")?.quantity, 2);
      assert.equal(roughSillMaterialForOpening(calculationsArtifact.payload, "O-001")?.quantity, 3.5);
    } finally {
      await rm(artifactRoot, { recursive: true, force: true });
    }
  });
});
