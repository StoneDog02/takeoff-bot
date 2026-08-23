import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { ArtifactStore } from "../../src/core/artifacts/ArtifactStore.js";
import { PipelineRunner } from "../../src/core/pipeline/PipelineRunner.js";
import type { PipelineStage } from "../../src/core/pipeline/types.js";
import type { ObjectId } from "../../src/core/schemas/identity.schema.js";
import { indexPlan } from "../../src/plans/indexPlan.js";
import {
  extractedFramingEvidenceArtifactSchema,
  finalFramingTakeoffArtifactSchema,
  type FramingCalculationsPayload,
} from "../../src/scopes/framing/schemas/framing-artifacts.schema.js";
import {
  createFramingStageArtifact,
  createFramingStages,
} from "../../src/scopes/framing/stages/createFramingStages.js";
import { createOpeningCrippleLayoutAssumptionId } from "../../src/scopes/framing/calculators/createOpeningCrippleLayoutAssumption.js";
import { createOpeningKingStudCountAssumptionId } from "../../src/scopes/framing/calculators/createOpeningKingStudCountAssumption.js";
import { createOpeningRoughSillSizeAssumptionId } from "../../src/scopes/framing/calculators/createOpeningRoughSillSizeAssumption.js";
import {
  OPENINGS_RULE_IDS,
  OPENING_QUANTITY_KEYS,
  SHEATHING_QUANTITY_KEYS,
  STRUCTURAL_MEMBER_QUANTITY_KEYS,
  WALL_QUANTITY_KEYS,
} from "../../src/scopes/framing/validators/rule-ids.js";
import {
  buildMultiObjectFramingEvidence,
  MULTI_OBJECT_EXPECTED_QUANTITIES,
} from "../fixtures/multiObjectFramingEvidence.js";
import {
  kingStudMaterialForOpening,
  materialLineItemId,
  memberMaterialForObject,
  OPENINGS_HEADER_LINKS_COMPANION_SUFFIX,
  plateMaterialForSegment,
  readCanonicalOpeningsFromDisk,
  readCanonicalStructuralMembersFromDisk,
  readCanonicalWallFramingFromDisk,
  roughSillMaterialForOpening,
  sheathingMaterialForArea,
  STRUCTURAL_MEMBERS_OPENING_LINKS_COMPANION_SUFFIX,
  studMaterialForSegment,
  WALL_FRAMING_OPENING_LINKS_COMPANION_SUFFIX,
} from "../integration/liveFramingProofHelpers.js";

const TWO_WALL_FIXTURE_PDF = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/wall-w001-w002-text-layer.pdf",
);

type MaterialSnapshot = {
  id: string;
  description: string;
  canonicalClassification: string;
  quantity: number;
  unit: string;
  sourceObjectIds: string[];
  assumptionIds: string[];
  reviewItemIds: string[];
};

function replaceStage(
  stages: PipelineStage[],
  name: string,
  run: PipelineStage["run"],
): PipelineStage[] {
  return stages.map((stage) => (stage.name === name ? { ...stage, run } : stage));
}

function withInjectedEvidence(
  stages: PipelineStage[],
  evidence: ReturnType<typeof buildMultiObjectFramingEvidence>,
): PipelineStage[] {
  const original = stages.find((stage) => stage.name === "extractedEvidence");
  assert.ok(original, "Expected extractedEvidence stage");

  return replaceStage(stages, "extractedEvidence", async (context) => {
    await original.run(context);
    return createFramingStageArtifact(
      context,
      6,
      extractedFramingEvidenceArtifactSchema,
      "extracted-framing-evidence",
      { evidence },
      { type: "system", identifier: "framing-pipeline" },
    );
  });
}

async function runFramingPipeline(stages: PipelineStage[]) {
  const artifactRoot = await mkdtemp(
    path.join(tmpdir(), "takeoff-bot-multi-object-"),
  );
  const planIndex = await indexPlan(TWO_WALL_FIXTURE_PDF);
  const runner = new PipelineRunner(new ArtifactStore(artifactRoot));
  const result = await runner.run({
    projectId: "test-project",
    pdfPath: TWO_WALL_FIXTURE_PDF,
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

function materialSnapshot(
  materials: FramingCalculationsPayload["materials"],
): MaterialSnapshot[] {
  return materials
    .map((item) => ({
      id: item.id,
      description: item.description,
      canonicalClassification: item.canonicalClassification,
      quantity: item.quantity,
      unit: item.unit,
      sourceObjectIds: [...item.sourceObjectIds].sort(),
      assumptionIds: [...item.assumptionIds].sort(),
      reviewItemIds: [...item.reviewItemIds].sort(),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function openingById(
  payload: Awaited<ReturnType<typeof readCanonicalOpeningsFromDisk>>,
  id: ObjectId,
) {
  const opening = payload.openings.find((entry) => entry.id === id);
  assert.ok(opening, `Expected opening ${id}`);
  return opening;
}

describe("framing multi-object deterministic system proof", () => {
  it("runs Stage 1→12 with isolated quantities, relationships, and persisted canonical state", async () => {
    const { artifactRoot, result } = await runFramingPipeline(
      withInjectedEvidence(createFramingStages(), buildMultiObjectFramingEvidence()),
    );

    try {
      assert.equal(result.success, true);

      const wallStage = stageByName(result, "wallFraming");
      const openingsStage = stageByName(result, "openings");
      const membersStage = stageByName(result, "structuralMembers");
      const validationStage = stageByName(result, "validation");
      const calculationsStage = stageByName(result, "calculations");
      const reportStage = stageByName(result, "report");

      const validationArtifact = await readArtifact(validationStage.artifactPath);
      const calculationsArtifact = await readArtifact(calculationsStage.artifactPath);
      const reportArtifact = finalFramingTakeoffArtifactSchema.parse(
        await readArtifact(reportStage.artifactPath),
      );

      const reloadedWallFraming = await readCanonicalWallFramingFromDisk(
        result.stageResults,
      );
      const reloadedOpenings = await readCanonicalOpeningsFromDisk(result.stageResults);
      const reloadedMembers = await readCanonicalStructuralMembersFromDisk(
        result.stageResults,
      );

      const wallLinksCompanion = openingsStage.companionArtifacts?.find(
        (entry) => entry.fileSuffix === WALL_FRAMING_OPENING_LINKS_COMPANION_SUFFIX,
      );
      const openingHeaderCompanion = membersStage.companionArtifacts?.find(
        (entry) => entry.fileSuffix === OPENINGS_HEADER_LINKS_COMPANION_SUFFIX,
      );
      const memberOpeningCompanion = membersStage.companionArtifacts?.find(
        (entry) =>
          entry.fileSuffix === STRUCTURAL_MEMBERS_OPENING_LINKS_COMPANION_SUFFIX,
      );

      assert.ok(wallLinksCompanion);
      assert.ok(openingHeaderCompanion);
      assert.ok(memberOpeningCompanion);

      const wall001 = reloadedWallFraming.walls.find((wall) => wall.id === "W-001");
      const wall002 = reloadedWallFraming.walls.find((wall) => wall.id === "W-002");
      const segment001 = reloadedWallFraming.segments.find(
        (segment) => segment.id === "WS-001",
      );
      const segment002 = reloadedWallFraming.segments.find(
        (segment) => segment.id === "WS-002",
      );

      assert.ok(wall001);
      assert.ok(wall002);
      assert.ok(segment001);
      assert.ok(segment002);

      assert.equal(wall001.assembly.studSize, "2x4");
      assert.equal(wall001.assembly.studSpacingInches, 16);
      assert.equal(segment001.lengthFeet, 20);
      assert.equal(wall002.assembly.studSize, "2x6");
      assert.equal(wall002.assembly.studSpacingInches, 24);
      assert.equal(segment002.lengthFeet, 12);

      const o001 = openingById(reloadedOpenings, "O-001");
      const o002 = openingById(reloadedOpenings, "O-002");
      const o003 = openingById(reloadedOpenings, "O-003");

      assert.equal(o001.category, "window");
      assert.equal(o001.parentWallId, "W-001");
      assert.equal(o001.parentObjectId, "WS-001");
      assert.equal(o001.headerMemberId, "SM-HDR-001");
      assert.equal(o001.kingStudCount, 3);
      assert.equal(o001.dimensions.roughWidthFeet, 3.5);

      assert.equal(o002.category, "window");
      assert.equal(o002.parentWallId, "W-001");
      assert.equal(o002.parentObjectId, "WS-001");
      assert.equal(o002.headerMemberId, null);
      assert.equal(o002.dimensions.roughWidthFeet, null);

      assert.equal(o003.category, "door");
      assert.equal(o003.parentWallId, "W-002");
      assert.equal(o003.parentObjectId, "WS-002");
      assert.equal(o003.headerMemberId, "SM-HDR-002");

      assert.deepEqual(segment001.openingIds, ["O-001", "O-002"]);
      assert.deepEqual(segment002.openingIds, ["O-003"]);
      assert.ok(!segment001.openingIds.includes("O-003"));
      assert.ok(!segment002.openingIds.includes("O-001"));
      assert.ok(!segment002.openingIds.includes("O-002"));

      const hdr001 = reloadedMembers.structuralMembers.find(
        (member) => member.id === "SM-HDR-001",
      );
      const hdr002 = reloadedMembers.structuralMembers.find(
        (member) => member.id === "SM-HDR-002",
      );

      assert.ok(hdr001);
      assert.ok(hdr002);
      assert.equal(hdr001.lengthFeet, 6);
      assert.equal(hdr002.lengthFeet, 8);
      assert.deepEqual(hdr001.supportedObjectIds, ["O-001"]);
      assert.deepEqual(hdr002.supportedObjectIds, ["O-003"]);
      assert.ok(!hdr001.supportedObjectIds.includes("O-003"));
      assert.ok(!hdr002.supportedObjectIds.includes("O-001"));

      assert.ok(
        validationArtifact.payload.validationIssues.some(
          (issue: { ruleId: string; target?: { objectId?: string } }) =>
            issue.ruleId === OPENINGS_RULE_IDS.roughDimensionsResolved &&
            issue.target?.objectId === "O-002",
        ),
      );
      assert.ok(
        validationArtifact.payload.reviewItems.some(
          (item: { title: string }) => item.title.includes("Confirm king stud count for opening O-002"),
        ),
      );
      assert.ok(
        validationArtifact.payload.reviewItems.some(
          (item: { title: string }) => item.title.includes("Confirm rough sill size for opening O-001"),
        ),
      );
      assert.ok(
        !validationArtifact.payload.reviewItems.some(
          (item: { title: string }) => item.title.includes("Confirm king stud count for opening O-001"),
        ),
      );

      assert.equal(
        studMaterialForSegment(calculationsArtifact.payload, "WS-001")?.quantity,
        MULTI_OBJECT_EXPECTED_QUANTITIES.walls["WS-001"].studs,
      );
      assert.equal(
        plateMaterialForSegment(calculationsArtifact.payload, "WS-001")?.quantity,
        MULTI_OBJECT_EXPECTED_QUANTITIES.walls["WS-001"].plates,
      );
      assert.equal(
        studMaterialForSegment(calculationsArtifact.payload, "WS-002")?.quantity,
        MULTI_OBJECT_EXPECTED_QUANTITIES.walls["WS-002"].studs,
      );
      assert.equal(
        plateMaterialForSegment(calculationsArtifact.payload, "WS-002")?.quantity,
        MULTI_OBJECT_EXPECTED_QUANTITIES.walls["WS-002"].plates,
      );

      const kingsO001 = kingStudMaterialForOpening(calculationsArtifact.payload, "O-001");
      const kingsO002 = kingStudMaterialForOpening(calculationsArtifact.payload, "O-002");
      const kingsO003 = kingStudMaterialForOpening(calculationsArtifact.payload, "O-003");
      const sillO001 = roughSillMaterialForOpening(calculationsArtifact.payload, "O-001");
      const sillO002 = roughSillMaterialForOpening(calculationsArtifact.payload, "O-002");

      assert.equal(kingsO001?.quantity, 3);
      assert.equal(kingsO002?.quantity, 2);
      assert.equal(kingsO003?.quantity, 2);
      assert.equal(sillO001?.quantity, 3.5);
      assert.equal(sillO002, undefined);

      const cripplesAboveO001 = calculationsArtifact.payload.materials.find(
        (item) =>
          item.id === materialLineItemId(OPENING_QUANTITY_KEYS.cripplesAbove, "O-001"),
      );
      const cripplesBelowO001 = calculationsArtifact.payload.materials.find(
        (item) =>
          item.id === materialLineItemId(OPENING_QUANTITY_KEYS.cripplesBelow, "O-001"),
      );
      assert.equal(cripplesAboveO001?.quantity, 2);
      assert.equal(cripplesBelowO001?.quantity, 2);
      assert.ok(
        cripplesAboveO001?.assumptionIds.includes(
          createOpeningCrippleLayoutAssumptionId("O-001"),
        ),
      );
      assert.equal(
        calculationsArtifact.payload.materials.find(
          (item) =>
            item.id === materialLineItemId(OPENING_QUANTITY_KEYS.cripplesAbove, "O-002"),
        ),
        undefined,
      );
      assert.equal(
        calculationsArtifact.payload.materials.find(
          (item) =>
            item.id === materialLineItemId(OPENING_QUANTITY_KEYS.cripplesBelow, "O-003"),
        ),
        undefined,
      );

      assert.equal(
        memberMaterialForObject(calculationsArtifact.payload, "SM-HDR-001")?.quantity,
        6,
      );
      assert.equal(
        memberMaterialForObject(calculationsArtifact.payload, "SM-HDR-002")?.quantity,
        8,
      );
      assert.equal(
        sheathingMaterialForArea(calculationsArtifact.payload, "SHA-001")?.quantity,
        MULTI_OBJECT_EXPECTED_QUANTITIES.sheathing["SHA-001"],
      );
      assert.equal(
        sheathingMaterialForArea(calculationsArtifact.payload, "SHA-001")?.unit,
        "square-foot",
      );

      assert.equal(kingsO001?.assumptionIds.length, 0);
      assert.ok(
        kingsO002?.assumptionIds.includes(createOpeningKingStudCountAssumptionId("O-002")),
      );
      assert.ok(
        kingsO003?.assumptionIds.includes(createOpeningKingStudCountAssumptionId("O-003")),
      );
      assert.ok(
        sillO001?.assumptionIds.includes(createOpeningRoughSillSizeAssumptionId("O-001")),
      );
      assert.ok(
        !kingsO002?.assumptionIds.includes(createOpeningKingStudCountAssumptionId("O-001")),
      );
      assert.ok(
        !sillO001?.assumptionIds.includes(createOpeningRoughSillSizeAssumptionId("O-002")),
      );

      const expected = MULTI_OBJECT_EXPECTED_QUANTITIES.summary;
      assert.deepEqual(reportArtifact.payload.summary.wallCount, expected.wallCount);
      assert.deepEqual(
        reportArtifact.payload.summary.wallSegmentCount,
        expected.wallSegmentCount,
      );
      assert.deepEqual(reportArtifact.payload.summary.openingCount, expected.openingCount);
      assert.deepEqual(
        reportArtifact.payload.summary.structuralMemberCount,
        expected.structuralMemberCount,
      );
      assert.deepEqual(
        reportArtifact.payload.summary.sheathingSystemCount,
        expected.sheathingSystemCount,
      );
      assert.deepEqual(
        reportArtifact.payload.summary.sheathingAreaCount,
        expected.sheathingAreaCount,
      );
      assert.deepEqual(
        reportArtifact.payload.summary.materialLineItemCount,
        expected.materialLineItemCount,
      );
      assert.deepEqual(
        reportArtifact.payload.summary.reviewItemCount,
        expected.reviewItemCount,
      );
      assert.deepEqual(
        reportArtifact.payload.summary.validationIssueCount,
        expected.validationIssueCount,
      );
      assert.equal(calculationsArtifact.payload.assumptions.length, expected.assumptionCount);

      const snapshots = materialSnapshot(calculationsArtifact.payload.materials);
      assert.equal(snapshots.length, expected.materialLineItemCount);

      const byId = new Map(snapshots.map((item) => [item.id, item]));

      for (const [segmentId, expected] of Object.entries(
        MULTI_OBJECT_EXPECTED_QUANTITIES.walls,
      )) {
        const studs = byId.get(materialLineItemId(WALL_QUANTITY_KEYS.studs, segmentId));
        const plates = byId.get(materialLineItemId(WALL_QUANTITY_KEYS.plates, segmentId));

        assert.equal(studs?.quantity, expected.studs);
        assert.equal(studs?.unit, "each");
        assert.equal(plates?.quantity, expected.plates);
        assert.equal(plates?.unit, "linear-foot");
      }

      for (const [segmentId, wallId] of [
        ["WS-001", "W-001"],
        ["WS-002", "W-002"],
      ] as const) {
        assert.deepEqual(
          byId.get(materialLineItemId(WALL_QUANTITY_KEYS.studs, segmentId))?.sourceObjectIds,
          [wallId, segmentId],
        );
        assert.deepEqual(
          byId.get(materialLineItemId(WALL_QUANTITY_KEYS.plates, segmentId))?.sourceObjectIds,
          [wallId, segmentId],
        );
      }

      assert.equal(
        byId.get(materialLineItemId(OPENING_QUANTITY_KEYS.kingStuds, "O-001"))?.quantity,
        3,
      );
      assert.equal(
        byId.get(materialLineItemId(OPENING_QUANTITY_KEYS.jackStuds, "O-001"))?.quantity,
        2,
      );
      assert.equal(
        byId.get(materialLineItemId(OPENING_QUANTITY_KEYS.roughSill, "O-001"))?.quantity,
        3.5,
      );
      assert.equal(
        byId.get(materialLineItemId(OPENING_QUANTITY_KEYS.kingStuds, "O-002"))?.quantity,
        2,
      );
      assert.equal(
        byId.get(materialLineItemId(OPENING_QUANTITY_KEYS.jackStuds, "O-002")),
        undefined,
      );
      assert.equal(
        byId.get(materialLineItemId(OPENING_QUANTITY_KEYS.kingStuds, "O-003"))?.quantity,
        2,
      );
      assert.equal(
        byId.get(materialLineItemId(OPENING_QUANTITY_KEYS.jackStuds, "O-003")),
        undefined,
      );
      assert.equal(
        byId.get(
          materialLineItemId(STRUCTURAL_MEMBER_QUANTITY_KEYS.material, "SM-HDR-001"),
        )?.quantity,
        6,
      );
      assert.equal(
        byId.get(
          materialLineItemId(STRUCTURAL_MEMBER_QUANTITY_KEYS.material, "SM-HDR-002"),
        )?.quantity,
        8,
      );

      assert.equal(
        byId.get(materialLineItemId(OPENING_QUANTITY_KEYS.roughSill, "O-002")),
        undefined,
      );

      assert.deepEqual(
        reportArtifact.payload.materials.map((item) => item.id).sort(),
        calculationsArtifact.payload.materials.map((item) => item.id).sort(),
      );

      assert.deepEqual(reloadedOpenings.openings.map((entry) => entry.id).sort(), [
        "O-001",
        "O-002",
        "O-003",
      ]);
    } finally {
      await rm(artifactRoot, { recursive: true, force: true });
    }
  });

  it("produces identical outputs when Evidence input order is reversed", async () => {
    const forwardEvidence = buildMultiObjectFramingEvidence();
    const reverseEvidence = [...forwardEvidence].reverse();

    const forwardRun = await runFramingPipeline(
      withInjectedEvidence(createFramingStages(), forwardEvidence),
    );
    const reverseRun = await runFramingPipeline(
      withInjectedEvidence(createFramingStages(), reverseEvidence),
    );

    try {
      assert.equal(forwardRun.result.success, true);
      assert.equal(reverseRun.result.success, true);

      const forwardOpenings = await readCanonicalOpeningsFromDisk(forwardRun.result.stageResults);
      const reverseOpenings = await readCanonicalOpeningsFromDisk(reverseRun.result.stageResults);
      const forwardWallFraming = await readCanonicalWallFramingFromDisk(
        forwardRun.result.stageResults,
      );
      const reverseWallFraming = await readCanonicalWallFramingFromDisk(
        reverseRun.result.stageResults,
      );
      const forwardMembers = await readCanonicalStructuralMembersFromDisk(
        forwardRun.result.stageResults,
      );
      const reverseMembers = await readCanonicalStructuralMembersFromDisk(
        reverseRun.result.stageResults,
      );

      const forwardValidation = await readArtifact(
        stageByName(forwardRun.result, "validation").artifactPath,
      );
      const reverseValidation = await readArtifact(
        stageByName(reverseRun.result, "validation").artifactPath,
      );
      const forwardCalculations = await readArtifact(
        stageByName(forwardRun.result, "calculations").artifactPath,
      );
      const reverseCalculations = await readArtifact(
        stageByName(reverseRun.result, "calculations").artifactPath,
      );
      const forwardReport = finalFramingTakeoffArtifactSchema.parse(
        await readArtifact(stageByName(forwardRun.result, "report").artifactPath),
      );
      const reverseReport = finalFramingTakeoffArtifactSchema.parse(
        await readArtifact(stageByName(reverseRun.result, "report").artifactPath),
      );

      assert.deepEqual(
        forwardOpenings.openings.map((entry) => entry.id),
        reverseOpenings.openings.map((entry) => entry.id),
      );
      assert.deepEqual(forwardWallFraming, reverseWallFraming);
      assert.deepEqual(forwardMembers, reverseMembers);
      assert.deepEqual(forwardOpenings, reverseOpenings);

      assert.deepEqual(
        forwardValidation.payload.validationIssues.map(
          (issue: { ruleId: string; target?: { objectId?: string } }) => ({
            ruleId: issue.ruleId,
            objectId: issue.target?.objectId,
          }),
        ),
        reverseValidation.payload.validationIssues.map(
          (issue: { ruleId: string; target?: { objectId?: string } }) => ({
            ruleId: issue.ruleId,
            objectId: issue.target?.objectId,
          }),
        ),
      );

      assert.deepEqual(
        materialSnapshot(forwardCalculations.payload.materials),
        materialSnapshot(reverseCalculations.payload.materials),
      );
      assert.deepEqual(forwardReport.payload.summary, reverseReport.payload.summary);
    } finally {
      await rm(forwardRun.artifactRoot, { recursive: true, force: true });
      await rm(reverseRun.artifactRoot, { recursive: true, force: true });
    }
  });
});
