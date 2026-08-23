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
  openingsArtifactSchema,
  structuralMembersArtifactSchema,
  wallFramingArtifactSchema,
} from "../../src/scopes/framing/schemas/framing-artifacts.schema.js";
import {
  createFramingStageArtifact,
  createFramingStages,
} from "../../src/scopes/framing/stages/createFramingStages.js";
import { OPENINGS_RULE_IDS } from "../../src/scopes/framing/validators/rule-ids.js";
import { buildMixedDomainHeaderEvidence } from "../fixtures/mixedDomainEvidence.js";
import { buildCompleteOpeningEvidence } from "../fixtures/openingEvidence.js";
import { buildMixedDomainWallEvidence } from "../fixtures/mixedDomainEvidence.js";
import {
  OPENINGS_HEADER_LINKS_COMPANION_SUFFIX,
  kingStudMaterialForOpening,
  roughSillMaterialForOpening,
  plateMaterialForSegment,
  readCanonicalOpeningsFromDisk,
  readCanonicalStructuralMembersFromDisk,
  readCanonicalWallFramingFromDisk,
  STRUCTURAL_MEMBERS_OPENING_LINKS_COMPANION_SUFFIX,
  studMaterialForSegment,
  WALL_FRAMING_OPENING_LINKS_COMPANION_SUFFIX,
  memberMaterialForObject,
} from "../integration/liveFramingProofHelpers.js";

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

function withInjectedWallOpeningHeaderEvidence(stages: PipelineStage[]): PipelineStage[] {
  const original = stages.find((stage) => stage.name === "extractedEvidence");
  assert.ok(original, "Expected extractedEvidence stage");

  return replaceStage(stages, "extractedEvidence", async (context) => {
    await original.run(context);
    return createFramingStageArtifact(
      context,
      6,
      extractedFramingEvidenceArtifactSchema,
      "extracted-framing-evidence",
      {
        evidence: [
          ...buildMixedDomainWallEvidence(),
          ...buildCompleteOpeningEvidence("O-001", "E-O001", {
            includeWallRelationship: true,
          }),
          ...buildMixedDomainHeaderEvidence({ includeOpeningRelationship: true }),
        ],
      },
      { type: "system", identifier: "framing-pipeline" },
    );
  });
}

async function runFramingPipeline(stages: PipelineStage[]) {
  const artifactRoot = await mkdtemp(
    path.join(tmpdir(), "takeoff-bot-openings-header-"),
  );
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

describe("framing opening header relationship pipeline", () => {
  it("persists and reloads explicit O-001 ↔ HDR-001 relationships through Stage 12", async () => {
    const { artifactRoot, result } = await runFramingPipeline(
      withInjectedWallOpeningHeaderEvidence(createFramingStages()),
    );

    try {
      assert.equal(result.success, true);

      const wallStage = stageByName(result, "wallFraming");
      const openingsStage = stageByName(result, "openings");
      const membersStage = stageByName(result, "structuralMembers");
      const validationStage = stageByName(result, "validation");
      const calculationsStage = stageByName(result, "calculations");
      const reportStage = stageByName(result, "report");

      const stage6WallArtifact = wallFramingArtifactSchema.parse(
        await readArtifact(wallStage.artifactPath),
      );
      const stage7OpeningsArtifact = openingsArtifactSchema.parse(
        await readArtifact(openingsStage.artifactPath),
      );
      const stage8MembersArtifact = structuralMembersArtifactSchema.parse(
        await readArtifact(membersStage.artifactPath),
      );

      assert.deepEqual(stage6WallArtifact.payload.segments[0]?.openingIds, []);
      assert.equal(stage7OpeningsArtifact.payload.openings[0]?.headerMemberId, null);
      assert.deepEqual(
        stage8MembersArtifact.payload.structuralMembers[0]?.supportedObjectIds,
        [],
      );

      const linkedOpeningsCompanion = membersStage.companionArtifacts?.find(
        (entry) => entry.fileSuffix === OPENINGS_HEADER_LINKS_COMPANION_SUFFIX,
      );
      const linkedMembersCompanion = membersStage.companionArtifacts?.find(
        (entry) =>
          entry.fileSuffix === STRUCTURAL_MEMBERS_OPENING_LINKS_COMPANION_SUFFIX,
      );
      const linkedWallCompanion = openingsStage.companionArtifacts?.find(
        (entry) => entry.fileSuffix === WALL_FRAMING_OPENING_LINKS_COMPANION_SUFFIX,
      );

      assert.ok(linkedWallCompanion);
      assert.ok(linkedOpeningsCompanion);
      assert.ok(linkedMembersCompanion);

      const linkedOpeningsArtifact = openingsArtifactSchema.parse(
        await readArtifact(linkedOpeningsCompanion.artifactPath),
      );
      const linkedMembersArtifact = structuralMembersArtifactSchema.parse(
        await readArtifact(linkedMembersCompanion.artifactPath),
      );

      assert.equal(linkedOpeningsArtifact.payload.openings[0]?.parentWallId, "W-001");
      assert.equal(linkedOpeningsArtifact.payload.openings[0]?.parentObjectId, "WS-001");
      assert.equal(linkedOpeningsArtifact.payload.openings[0]?.headerMemberId, "SM-HDR-001");
      assert.deepEqual(linkedMembersArtifact.payload.structuralMembers[0]?.supportedObjectIds, [
        "O-001",
      ]);

      const reloadedOpenings = await readCanonicalOpeningsFromDisk(result.stageResults);
      const reloadedMembers = await readCanonicalStructuralMembersFromDisk(
        result.stageResults,
      );
      const reloadedWallFraming = await readCanonicalWallFramingFromDisk(
        result.stageResults,
      );

      assert.equal(reloadedOpenings.openings[0]?.headerMemberId, "SM-HDR-001");
      assert.deepEqual(reloadedMembers.structuralMembers[0]?.supportedObjectIds, ["O-001"]);
      assert.deepEqual(reloadedWallFraming.segments[0]?.openingIds, ["O-001"]);

      const validationArtifact = await readArtifact(validationStage.artifactPath);
      assert.ok(
        validationArtifact.payload.validationResults.some(
          (entry: { ruleId: string; outcome: string; target?: { objectId?: string } }) =>
            entry.ruleId === OPENINGS_RULE_IDS.headerReferenceResolved &&
            entry.outcome === "passed" &&
            entry.target?.objectId === "O-001",
        ),
      );

      const calculationsArtifact = await readArtifact(calculationsStage.artifactPath);
      const studs = studMaterialForSegment(calculationsArtifact.payload, "WS-001");
      const plates = plateMaterialForSegment(calculationsArtifact.payload, "WS-001");
      const header = memberMaterialForObject(
        calculationsArtifact.payload,
        "SM-HDR-001",
      );

      assert.equal(studs?.quantity, 16);
      assert.equal(plates?.quantity, 60);
      assert.equal(header?.quantity, 6);

      const kings = kingStudMaterialForOpening(calculationsArtifact.payload, "O-001");
      assert.equal(kings?.quantity, 2);
      assert.equal(kings?.unit, "each");
      const sill = roughSillMaterialForOpening(calculationsArtifact.payload, "O-001");
      assert.equal(sill?.quantity, 3.5);
      assert.equal(sill?.unit, "linear-foot");
      assert.ok(
        calculationsArtifact.payload.assumptions.some(
          (assumption: { target: { objectId: string } }) =>
            assumption.target.objectId === "O-001",
        ),
      );
      assert.ok(kings?.assumptionIds.length);
      assert.ok(sill?.assumptionIds.length);

      const reportArtifact = finalFramingTakeoffArtifactSchema.parse(
        await readArtifact(reportStage.artifactPath),
      );
      assert.equal(reportArtifact.payload.summary.openingCount, 1);
      assert.equal(reportArtifact.payload.summary.materialLineItemCount, 7);
    } finally {
      await rm(artifactRoot, { recursive: true, force: true });
    }
  });
});
