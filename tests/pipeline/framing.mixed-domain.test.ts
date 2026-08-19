import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { ArtifactStore } from "../../src/core/artifacts/ArtifactStore.js";
import { PipelineRunner } from "../../src/core/pipeline/PipelineRunner.js";
import type { PipelineStage } from "../../src/core/pipeline/types.js";
import type { Evidence } from "../../src/core/schemas/evidence.schema.js";
import { indexPlan } from "../../src/plans/indexPlan.js";
import {
  extractedFramingEvidenceArtifactSchema,
  finalFramingTakeoffArtifactSchema,
} from "../../src/scopes/framing/schemas/framing-artifacts.schema.js";
import {
  createFramingStageArtifact,
  createFramingStages,
} from "../../src/scopes/framing/stages/createFramingStages.js";
import {
  STRUCTURAL_MEMBER_QUANTITY_KEYS,
  STRUCTURAL_MEMBER_RULE_IDS,
  WALL_QUANTITY_KEYS,
} from "../../src/scopes/framing/validators/rule-ids.js";
import { buildCompleteMixedDomainEvidence } from "../fixtures/mixedDomainEvidence.js";
import {
  assertNoCrossDomainTraceContamination,
  evidenceIdsForSubject,
  materialLineItemId,
  memberMaterialForObject,
  plateMaterialForSegment,
  studMaterialForSegment,
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

function withInjectedMixedDomainEvidence(stages: PipelineStage[]): PipelineStage[] {
  const original = stages.find((stage) => stage.name === "extractedEvidence");
  assert.ok(original, "Expected extractedEvidence stage");

  return replaceStage(stages, "extractedEvidence", async (context) => {
    await original.run(context);
    return createFramingStageArtifact(
      context,
      5,
      extractedFramingEvidenceArtifactSchema,
      "extracted-framing-evidence",
      { evidence: buildCompleteMixedDomainEvidence() },
      { type: "system", identifier: "framing-pipeline" },
    );
  });
}

function withPartialHeaderEvidence(stages: PipelineStage[]): PipelineStage[] {
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
        evidence: buildCompleteMixedDomainEvidence({ includeQuantity: false }),
      },
      { type: "system", identifier: "framing-pipeline" },
    );
  });
}

async function runFramingPipeline(stages: PipelineStage[]) {
  const artifactRoot = await mkdtemp(path.join(tmpdir(), "takeoff-bot-mixed-"));
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

describe("framing mixed-domain pipeline", () => {
  it("resolves wall and structural member domains independently through Stage 10", async () => {
    const { artifactRoot, result } = await runFramingPipeline(
      withInjectedMixedDomainEvidence(createFramingStages()),
    );

    try {
      assert.equal(result.success, true);
      assert.equal(result.errors.length, 0);

      const extractedStage = stageByName(result, "extractedEvidence");
      const openingsStage = stageByName(result, "openings");
      const wallStage = stageByName(result, "wallFraming");
      const membersStage = stageByName(result, "structuralMembers");
      const validationStage = stageByName(result, "validation");
      const calculationsStage = stageByName(result, "calculations");

      const extractedArtifact = await readArtifact(extractedStage.artifactPath);
      const membersArtifact = await readArtifact(membersStage.artifactPath);
      const wallArtifact = await readArtifact(wallStage.artifactPath);
      const validationArtifact = await readArtifact(validationStage.artifactPath);
      const calculationsArtifact = await readArtifact(
        calculationsStage.artifactPath,
      );

      assert.ok(
        membersArtifact.inputArtifactIds.includes(extractedStage.artifactId),
      );
      assert.deepEqual(membersArtifact.parentArtifactIds, [
        openingsStage.artifactId,
      ]);

      const evidence = extractedArtifact.payload.evidence as Evidence[];
      const wallEvidenceIds = evidenceIdsForSubject(evidence, "W-001");
      const memberEvidenceIds = evidenceIdsForSubject(evidence, "HDR-001");

      assert.equal(wallArtifact.payload.walls.length, 1);
      assert.equal(wallArtifact.payload.segments.length, 1);
      assert.equal(wallArtifact.payload.walls[0]?.id, "W-001");
      assert.equal(wallArtifact.payload.segments[0]?.id, "WS-001");
      assert.equal(
        wallArtifact.payload.walls.some((wall: { id: string }) => wall.id === "SM-HDR-001"),
        false,
      );

      assert.equal(membersArtifact.payload.structuralMembers.length, 1);
      assert.equal(membersArtifact.payload.structuralMembers[0]?.id, "SM-HDR-001");
      assert.equal(
        membersArtifact.payload.structuralMembers.some(
          (member: { id: string }) => member.id === "W-001",
        ),
        false,
      );

      const member = membersArtifact.payload.structuralMembers[0];
      assert.equal(member.category, "header");
      assert.equal(member.materialType, "lvl");
      assert.equal(member.size, "1.75x11.875");
      assert.equal(member.lengthFeet, 6);
      assert.equal(member.quantity, 1);
      assert.equal(member.location, "over Window W-001 at Wall W-001");

      assertNoCrossDomainTraceContamination(
        wallArtifact.payload,
        membersArtifact.payload,
        wallEvidenceIds,
        memberEvidenceIds,
      );
      assert.deepEqual(
        [
          ...new Set([
            ...(wallArtifact.payload.walls[0]?.evidenceIds ?? []),
            ...(wallArtifact.payload.segments[0]?.evidenceIds ?? []),
          ]),
        ].sort(),
        wallEvidenceIds,
      );
      assert.deepEqual(member.evidenceIds.sort(), memberEvidenceIds);

      assert.equal(
        validationArtifact.payload.validationIssues.some(
          (issue: { ruleId: string }) =>
            issue.ruleId === STRUCTURAL_MEMBER_RULE_IDS.quantityResolved,
        ),
        false,
      );

      const studs = studMaterialForSegment(calculationsArtifact.payload, "WS-001");
      const plates = plateMaterialForSegment(
        calculationsArtifact.payload,
        "WS-001",
      );
      const header = memberMaterialForObject(
        calculationsArtifact.payload,
        "SM-HDR-001",
      );

      assert.ok(studs);
      assert.ok(plates);
      assert.ok(header);
      assert.equal(studs.quantity, 16);
      assert.equal(plates.quantity, 60);
      assert.equal(header.quantity, 6);
      assert.deepEqual(studs.sourceObjectIds.sort(), ["W-001", "WS-001"]);
      assert.deepEqual(plates.sourceObjectIds.sort(), ["W-001", "WS-001"]);
      assert.deepEqual(header.sourceObjectIds, ["SM-HDR-001"]);

      const report = finalFramingTakeoffArtifactSchema.parse(
        JSON.parse(await readFile(result.reportPath!, "utf8")),
      );
      assert.equal(report.payload.summary.materialLineItemCount, 3);
      assert.deepEqual(
        report.payload.materials.map((item) => ({
          id: item.id,
          quantity: item.quantity,
          unit: item.unit,
        })),
        [
          {
            id: materialLineItemId(WALL_QUANTITY_KEYS.studs, "WS-001"),
            quantity: 16,
            unit: "each",
          },
          {
            id: materialLineItemId(WALL_QUANTITY_KEYS.plates, "WS-001"),
            quantity: 60,
            unit: "linear-foot",
          },
          {
            id: materialLineItemId(
              STRUCTURAL_MEMBER_QUANTITY_KEYS.material,
              "SM-HDR-001",
            ),
            quantity: 6,
            unit: "linear-foot",
          },
        ],
      );
    } finally {
      await rm(artifactRoot, { recursive: true, force: true });
    }
  });

  it("preserves a partial structural member and blocks only its material LF", async () => {
    const { artifactRoot, result } = await runFramingPipeline(
      withPartialHeaderEvidence(createFramingStages()),
    );

    try {
      assert.equal(result.success, true);
      assert.equal(result.errors.length, 0);

      const membersArtifact = await readArtifact(
        stageByName(result, "structuralMembers").artifactPath,
      );
      const validationArtifact = await readArtifact(
        stageByName(result, "validation").artifactPath,
      );
      const calculationsArtifact = await readArtifact(
        stageByName(result, "calculations").artifactPath,
      );

      const member = membersArtifact.payload.structuralMembers[0];
      assert.equal(member?.id, "SM-HDR-001");
      assert.equal(member?.quantity, null);

      const quantityIssue = validationArtifact.payload.validationIssues.find(
        (issue: { ruleId: string; target: { objectId?: string } }) =>
          issue.ruleId === STRUCTURAL_MEMBER_RULE_IDS.quantityResolved &&
          issue.target.objectId === "SM-HDR-001",
      );
      assert.ok(quantityIssue);
      assert.equal(
        quantityIssue.quantityImpacts.find(
          (impact: { quantityKey: string }) =>
            impact.quantityKey === STRUCTURAL_MEMBER_QUANTITY_KEYS.material,
        )?.canCalculate,
        false,
      );

      const quantityReview = validationArtifact.payload.reviewItems.find(
        (item: { validationIssueIds: string[] }) =>
          item.validationIssueIds.includes(quantityIssue.id),
      );
      assert.ok(quantityReview);
      assert.equal(quantityReview.action?.targetProperty, "quantity");

      assert.equal(
        memberMaterialForObject(calculationsArtifact.payload, "SM-HDR-001"),
        undefined,
      );
      assert.equal(studMaterialForSegment(calculationsArtifact.payload, "WS-001")?.quantity, 16);
      assert.equal(plateMaterialForSegment(calculationsArtifact.payload, "WS-001")?.quantity, 60);

      const report = finalFramingTakeoffArtifactSchema.parse(
        JSON.parse(await readFile(result.reportPath!, "utf8")),
      );
      assert.equal(report.payload.summary.materialLineItemCount, 2);
      assert.equal(report.payload.summary.structuralMemberCount, 1);
    } finally {
      await rm(artifactRoot, { recursive: true, force: true });
    }
  });
});
