import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { ArtifactStore } from "../../src/core/artifacts/ArtifactStore.js";
import { PipelineRunner } from "../../src/core/pipeline/PipelineRunner.js";
import type {
  PipelineStage,
  UserDecisionRunInput,
} from "../../src/core/pipeline/types.js";
import type { Evidence } from "../../src/core/schemas/evidence.schema.js";
import type { ReviewItemId } from "../../src/core/schemas/identity.schema.js";
import type { ReviewItem } from "../../src/core/schemas/review-item.schema.js";
import type { UserDecision } from "../../src/core/schemas/user-decision.schema.js";
import { generateArtifactId } from "../../src/core/utils/ids.js";
import { indexPlan } from "../../src/plans/indexPlan.js";
import { createOpeningKingStudCountAssumptionId } from "../../src/scopes/framing/calculators/createOpeningKingStudCountAssumption.js";
import { createOpeningRoughSillSizeAssumptionId } from "../../src/scopes/framing/calculators/createOpeningRoughSillSizeAssumption.js";
import {
  confidenceArtifactSchema,
  extractedFramingEvidenceArtifactSchema,
  finalFramingTakeoffArtifactSchema,
  openingsArtifactSchema,
  userDecisionArtifactSchema,
  validationArtifactSchema,
  type ValidationPayload,
} from "../../src/scopes/framing/schemas/framing-artifacts.schema.js";
import {
  createFramingStageArtifact,
  createFramingStages,
} from "../../src/scopes/framing/stages/createFramingStages.js";
import {
  OPENING_QUANTITY_KEYS,
  OPENINGS_RULE_IDS,
  STRUCTURAL_MEMBER_QUANTITY_KEYS,
  WALL_QUANTITY_KEYS,
} from "../../src/scopes/framing/validators/rule-ids.js";
import {
  buildMultiObjectFramingEvidence,
  buildOpeningEvidenceForSubject,
} from "../fixtures/multiObjectFramingEvidence.js";
import {
  kingStudMaterialForOpening,
  materialLineItemId,
  memberMaterialForObject,
  plateMaterialForSegment,
  roughSillMaterialForOpening,
  studMaterialForSegment,
} from "../integration/liveFramingProofHelpers.js";

const TWO_WALL_FIXTURE_PDF = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/wall-w001-w002-text-layer.pdf",
);

function buildOpeningUserDecisionEvidence(): Evidence[] {
  const base = buildMultiObjectFramingEvidence().filter(
    (record) => !(record.subjectKind === "opening" && record.subjectKey === "O-002"),
  );

  return [
    ...base,
    ...buildOpeningEvidenceForSubject("O-002", "E-O002", {
      category: "window",
      nominalWidthFeet: 4,
      nominalHeightFeet: 5,
      roughWidthFeet: 4,
      roughHeightFeet: 5.5,
      parentWallTag: "W-001",
    }),
  ];
}

function replaceStage(
  stages: PipelineStage[],
  name: string,
  run: PipelineStage["run"],
): PipelineStage[] {
  return stages.map((stage) => (stage.name === name ? { ...stage, run } : stage));
}

function withInjectedEvidence(
  stages: PipelineStage[],
  evidence: Evidence[],
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

async function runFramingPipeline(
  stages: PipelineStage[],
  options: {
    artifactRoot?: string;
    userDecisionRunInput?: UserDecisionRunInput;
  } = {},
) {
  const artifactRoot =
    options.artifactRoot ??
    (await mkdtemp(path.join(tmpdir(), "takeoff-bot-opening-run2-")));
  const planIndex = await indexPlan(TWO_WALL_FIXTURE_PDF);
  const runner = new PipelineRunner(new ArtifactStore(artifactRoot));
  const result = await runner.run({
    projectId: "opening-run2-project",
    pdfPath: TWO_WALL_FIXTURE_PDF,
    scopeName: "framing",
    planIndex,
    useMockAi: true,
    stages,
    userDecisionRunInput: options.userDecisionRunInput,
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

function o002KingStudReviewItem(validation: ValidationPayload): ReviewItem {
  const reviewItem = validation.reviewItems.find(
    (item) =>
      item.affectedObjects.length === 1 &&
      item.affectedObjects[0]?.objectId === "O-002" &&
      item.action.targetProperty === "kingStudCount",
  );
  if (!reviewItem) {
    throw new Error("Expected O-002 kingStudCount Review Item.");
  }
  return reviewItem;
}

function createUserDecisionArtifact(input: {
  projectId: string;
  pipelineRunId: string;
  validationArtifactId: string;
  decision: UserDecision;
}) {
  const now = new Date().toISOString();
  return userDecisionArtifactSchema.parse({
    artifactId: generateArtifactId(91),
    artifactType: "user-decision",
    schemaVersion: "1.0.0",
    artifactVersion: 1,
    engineVersion: "0.1.0",
    pipelineRunId: input.pipelineRunId,
    projectId: input.projectId,
    createdAt: now,
    lastModifiedAt: now,
    producer: { type: "user", identifier: "opening-run2-integration-test" },
    inputArtifactIds: [input.validationArtifactId],
    parentArtifactIds: [input.validationArtifactId],
    payload: input.decision,
  });
}

describe("framing pipeline Run-2 opening user decision replay", () => {
  it("replays Run 2 with a persisted value-provided User Decision for O-002 kingStudCount", async () => {
    const stages = withInjectedEvidence(
      createFramingStages(),
      buildOpeningUserDecisionEvidence(),
    );
    const run1Root = await mkdtemp(path.join(tmpdir(), "takeoff-bot-opening-run1-"));
    const run2Root = await mkdtemp(path.join(tmpdir(), "takeoff-bot-opening-run2-"));

    try {
      const run1 = await runFramingPipeline(stages, { artifactRoot: run1Root });
      assert.equal(run1.result.success, true);

      const run1EvidenceArtifact = await readArtifact(
        stageByName(run1.result, "extractedEvidence").artifactPath,
      );
      const run1EvidenceSnapshot = structuredClone(run1EvidenceArtifact);

      const run1ValidationStage = stageByName(run1.result, "validation");
      const run1ValidationArtifact = validationArtifactSchema.parse(
        await readArtifact(run1ValidationStage.artifactPath),
      );
      const run1ValidationSnapshot = structuredClone(run1ValidationArtifact);

      const run1OpeningsArtifact = openingsArtifactSchema.parse(
        await readArtifact(stageByName(run1.result, "openings").artifactPath),
      );
      const o002Run1 = run1OpeningsArtifact.payload.openings.find(
        (opening) => opening.id === "O-002",
      );
      assert.ok(o002Run1);
      assert.equal(o002Run1.kingStudCount, null);
      assert.equal(
        o002Run1.resolutionTraces.find(
          (trace) => trace.propertyPath === "kingStudCount",
        ),
        undefined,
      );
      assert.equal(o002Run1.dimensions.roughWidthFeet, 4);

      const kingReviewItem = o002KingStudReviewItem(run1ValidationArtifact.payload);
      assert.equal(
        run1ValidationArtifact.payload.validationResults.find(
          (entry) =>
            entry.ruleId === OPENINGS_RULE_IDS.kingStudCountDefault &&
            entry.target.kind === "object" &&
            entry.target.objectId === "O-002",
        )?.outcome,
        "failed",
      );

      const run1Calculations = await readArtifact(
        stageByName(run1.result, "calculations").artifactPath,
      );
      assert.equal(
        kingStudMaterialForOpening(run1Calculations.payload, "O-002")?.quantity,
        2,
      );
      assert.equal(
        roughSillMaterialForOpening(run1Calculations.payload, "O-002")?.quantity,
        4,
      );
      assert.ok(
        kingStudMaterialForOpening(run1Calculations.payload, "O-002")?.assumptionIds.includes(
          createOpeningKingStudCountAssumptionId("O-002"),
        ),
      );

      const decision: UserDecision = {
        id: "UD-O002-KING-001",
        reviewItemId: kingReviewItem.id,
        result: {
          type: "value-provided",
          value: 3,
          rationale: "Reviewer confirmed 3 king studs per occurrence for O-002.",
        },
        supersedesUserDecisionId: null,
      };

      const decisionArtifact = createUserDecisionArtifact({
        projectId: "opening-run2-project",
        pipelineRunId: run1.result.pipelineRunId,
        validationArtifactId: run1ValidationStage.artifactId,
        decision,
      });

      const run1Store = new ArtifactStore(run1Root);
      const decisionPath = await run1Store.writeExternal(
        "opening-run2-project",
        "framing",
        `${decision.id}.json`,
        decisionArtifact,
      );
      const loadedDecisionArtifact = userDecisionArtifactSchema.parse(
        await run1Store.read(decisionPath),
      );

      const reviewItemsById = new Map<ReviewItemId, ReviewItem>(
        run1ValidationArtifact.payload.reviewItems.map((item) => [item.id, item]),
      );

      const run2 = await runFramingPipeline(stages, {
        artifactRoot: run2Root,
        userDecisionRunInput: {
          userDecisions: [loadedDecisionArtifact.payload],
          reviewItemsById,
          inputArtifactIds: [loadedDecisionArtifact.artifactId],
        },
      });
      assert.equal(run2.result.success, true);

      const run2OpeningsArtifact = openingsArtifactSchema.parse(
        await readArtifact(stageByName(run2.result, "openings").artifactPath),
      );
      const o002Run2 = run2OpeningsArtifact.payload.openings.find(
        (opening) => opening.id === "O-002",
      );
      assert.ok(o002Run2);
      assert.equal(o002Run2.id, "O-002");
      assert.equal(o002Run2.kingStudCount, 3);

      const kingTrace = o002Run2.resolutionTraces.find(
        (trace) => trace.propertyPath === "kingStudCount",
      );
      assert.equal(kingTrace?.method, "user-override");
      assert.deepEqual(kingTrace?.userDecisionIds, ["UD-O002-KING-001"]);
      assert.deepEqual(kingTrace?.reviewItemIds, [kingReviewItem.id]);
      assert.deepEqual(kingTrace?.evidenceIds, []);

      assert.ok(
        run2OpeningsArtifact.inputArtifactIds.includes(loadedDecisionArtifact.artifactId),
      );

      const run2ValidationArtifact = validationArtifactSchema.parse(
        await readArtifact(stageByName(run2.result, "validation").artifactPath),
      );
      assert.equal(
        run2ValidationArtifact.payload.validationResults.find(
          (entry) =>
            entry.ruleId === OPENINGS_RULE_IDS.kingStudCountDefault &&
            entry.target.kind === "object" &&
            entry.target.objectId === "O-002",
        )?.outcome,
        "passed",
      );
      assert.equal(
        run2ValidationArtifact.payload.reviewItems.some(
          (item) =>
            item.affectedObjects.some((object) => object.objectId === "O-002") &&
            item.action.targetProperty === "kingStudCount",
        ),
        false,
      );
      assert.ok(
        run2ValidationArtifact.payload.reviewItems.some(
          (item) =>
            item.affectedObjects.some((object) => object.objectId === "O-001") &&
            item.action.targetProperty === "roughSillSize",
        ),
      );
      assert.ok(
        run2ValidationArtifact.payload.reviewItems.some(
          (item) =>
            item.affectedObjects.some((object) => object.objectId === "O-003") &&
            item.action.targetProperty === "kingStudCount",
        ),
      );

      const run2Calculations = await readArtifact(
        stageByName(run2.result, "calculations").artifactPath,
      );
      assert.equal(
        studMaterialForSegment(run2Calculations.payload, "WS-001")?.quantity,
        16,
      );
      assert.equal(
        plateMaterialForSegment(run2Calculations.payload, "WS-001")?.quantity,
        60,
      );
      assert.equal(
        studMaterialForSegment(run2Calculations.payload, "WS-002")?.quantity,
        7,
      );
      assert.equal(
        plateMaterialForSegment(run2Calculations.payload, "WS-002")?.quantity,
        24,
      );
      assert.equal(
        kingStudMaterialForOpening(run2Calculations.payload, "O-001")?.quantity,
        3,
      );
      assert.equal(
        roughSillMaterialForOpening(run2Calculations.payload, "O-001")?.quantity,
        3.5,
      );
      assert.equal(
        kingStudMaterialForOpening(run2Calculations.payload, "O-002")?.quantity,
        3,
      );
      assert.equal(
        kingStudMaterialForOpening(run2Calculations.payload, "O-002")?.claimStatus,
        "CONFIRMED",
      );
      assert.ok(
        kingStudMaterialForOpening(run2Calculations.payload, "O-002")?.assumptionIds.includes(
          createOpeningKingStudCountAssumptionId("O-002"),
        ),
      );
      const replacedKingAssumption = run2Calculations.payload.assumptions.find(
        (assumption) =>
          assumption.id === createOpeningKingStudCountAssumptionId("O-002"),
      );
      assert.ok(replacedKingAssumption);
      assert.equal(replacedKingAssumption.status, "replaced");
      assert.equal(replacedKingAssumption.userDecisionId, "UD-O002-KING-001");

      assert.equal(
        roughSillMaterialForOpening(run2Calculations.payload, "O-002")?.quantity,
        4,
      );
      assert.equal(
        kingStudMaterialForOpening(run2Calculations.payload, "O-003")?.quantity,
        2,
      );
      assert.equal(
        memberMaterialForObject(run2Calculations.payload, "SM-HDR-001")?.quantity,
        6,
      );
      assert.equal(
        memberMaterialForObject(run2Calculations.payload, "SM-HDR-002")?.quantity,
        8,
      );

      assert.ok(
        roughSillMaterialForOpening(run2Calculations.payload, "O-001")?.assumptionIds.includes(
          createOpeningRoughSillSizeAssumptionId("O-001"),
        ),
      );
      assert.ok(
        kingStudMaterialForOpening(run2Calculations.payload, "O-003")?.assumptionIds.includes(
          createOpeningKingStudCountAssumptionId("O-003"),
        ),
      );

      const run2Report = finalFramingTakeoffArtifactSchema.parse(
        JSON.parse(await readFile(run2.result.reportPath!, "utf8")),
      );
      assert.equal(run2Report.payload.materials.length, 17);

      const run2ConfidenceArtifact = confidenceArtifactSchema.parse(
        await readArtifact(stageByName(run2.result, "confidence").artifactPath),
      );
      const o002Confidence = run2ConfidenceArtifact.payload.confidenceEvaluations.find(
        (evaluation) =>
          evaluation.target.kind === "object" &&
          evaluation.target.objectId === "O-002",
      );
      assert.ok(o002Confidence);
      assert.deepEqual(o002Confidence.userDecisionIds, ["UD-O002-KING-001"]);
      assert.equal(o002Confidence.resolution.label, "high");

      const run1EvidenceAfterRun2 = await readArtifact(
        stageByName(run1.result, "extractedEvidence").artifactPath,
      );
      const run1ValidationAfterRun2 = validationArtifactSchema.parse(
        await readArtifact(run1ValidationStage.artifactPath),
      );
      assert.deepEqual(run1EvidenceAfterRun2, run1EvidenceSnapshot);
      assert.deepEqual(run1ValidationAfterRun2, run1ValidationSnapshot);
      assert.deepEqual(
        kingReviewItem,
        run1ValidationSnapshot.payload.reviewItems.find(
          (item) => item.id === kingReviewItem.id,
        ),
      );

      const unchangedMaterialIds = [
        materialLineItemId(WALL_QUANTITY_KEYS.studs, "WS-001"),
        materialLineItemId(WALL_QUANTITY_KEYS.plates, "WS-001"),
        materialLineItemId(WALL_QUANTITY_KEYS.studs, "WS-002"),
        materialLineItemId(WALL_QUANTITY_KEYS.plates, "WS-002"),
        materialLineItemId(OPENING_QUANTITY_KEYS.kingStuds, "O-001"),
        materialLineItemId(OPENING_QUANTITY_KEYS.roughSill, "O-001"),
        materialLineItemId(OPENING_QUANTITY_KEYS.roughSill, "O-002"),
        materialLineItemId(OPENING_QUANTITY_KEYS.kingStuds, "O-003"),
        materialLineItemId(
          STRUCTURAL_MEMBER_QUANTITY_KEYS.material,
          "SM-HDR-001",
        ),
        materialLineItemId(
          STRUCTURAL_MEMBER_QUANTITY_KEYS.material,
          "SM-HDR-002",
        ),
      ];

      for (const materialId of unchangedMaterialIds) {
        const run1Item = run1Calculations.payload.materials.find(
          (item) => item.id === materialId,
        );
        const run2Item = run2Calculations.payload.materials.find(
          (item) => item.id === materialId,
        );
        assert.deepEqual(run2Item, run1Item, `Expected ${materialId} unchanged`);
      }

      const run1KingsO002 = run1Calculations.payload.materials.find(
        (item) => item.id === materialLineItemId(OPENING_QUANTITY_KEYS.kingStuds, "O-002"),
      );
      const run2KingsO002 = run2Calculations.payload.materials.find(
        (item) => item.id === materialLineItemId(OPENING_QUANTITY_KEYS.kingStuds, "O-002"),
      );
      assert.equal(run1KingsO002?.quantity, 2);
      assert.equal(run2KingsO002?.quantity, 3);
    } finally {
      await rm(run1Root, { recursive: true, force: true });
      await rm(run2Root, { recursive: true, force: true });
    }
  });

  it("fails Run 2 when a value-provided decision supplies an invalid kingStudCount", async () => {
    const stages = withInjectedEvidence(
      createFramingStages(),
      buildOpeningUserDecisionEvidence(),
    );
    const run1Root = await mkdtemp(path.join(tmpdir(), "takeoff-bot-opening-stale-"));
    const run2Root = await mkdtemp(path.join(tmpdir(), "takeoff-bot-opening-stale2-"));

    try {
      const run1 = await runFramingPipeline(stages, { artifactRoot: run1Root });
      assert.equal(run1.result.success, true);

      const run1ValidationStage = stageByName(run1.result, "validation");
      const run1ValidationArtifact = validationArtifactSchema.parse(
        await readArtifact(run1ValidationStage.artifactPath),
      );
      const kingReviewItem = o002KingStudReviewItem(run1ValidationArtifact.payload);

      const run2 = await runFramingPipeline(stages, {
        artifactRoot: run2Root,
        userDecisionRunInput: {
          userDecisions: [
            {
              id: "UD-O002-KING-INVALID",
              reviewItemId: kingReviewItem.id,
              result: {
                type: "value-provided",
                value: 0,
                rationale: "Invalid king stud count.",
              },
              supersedesUserDecisionId: null,
            },
          ],
          reviewItemsById: new Map(
            run1ValidationArtifact.payload.reviewItems.map((item) => [item.id, item]),
          ),
          inputArtifactIds: ["ART-USER-DECISION-INVALID"],
        },
      });

      assert.equal(run2.result.success, false);
      assert.match(
        run2.result.errors.join("\n"),
        /value is not valid for property kingStudCount/,
      );
    } finally {
      await rm(run1Root, { recursive: true, force: true });
      await rm(run2Root, { recursive: true, force: true });
    }
  });
});
