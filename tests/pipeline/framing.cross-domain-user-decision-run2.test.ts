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
import { evidenceSchema } from "../../src/core/schemas/evidence.schema.js";
import type { ReviewItemId } from "../../src/core/schemas/identity.schema.js";
import type { ReviewItem } from "../../src/core/schemas/review-item.schema.js";
import type { UserDecision } from "../../src/core/schemas/user-decision.schema.js";
import { generateArtifactId } from "../../src/core/utils/ids.js";
import { indexPlan } from "../../src/plans/indexPlan.js";
import { createMaterialLineItemId } from "../../src/scopes/framing/calculators/ids.js";
import { buildFloorFramingJoistCountEvidence } from "../../src/scopes/framing/demo/floorFramingJoistCountEvidence.js";
import { buildRoofFramingCommonRafterEvidence } from "../../src/scopes/framing/demo/roofFramingCommonRafterEvidence.js";
import { buildSheathingEvidenceForWall001 } from "../../src/scopes/framing/demo/multiObjectFramingEvidence.js";
import { projectFramingReviewWorkspace } from "../../src/scopes/framing/review-workspace/projectFramingReviewWorkspace.js";
import {
  extractedFramingEvidenceArtifactSchema,
  finalFramingTakeoffArtifactSchema,
  floorFramingArtifactSchema,
  framingCalculationsArtifactSchema,
  roofFramingArtifactSchema,
  sheathingArtifactSchema,
  structuralMembersArtifactSchema,
  userDecisionArtifactSchema,
  validationArtifactSchema,
  type ValidationPayload,
} from "../../src/scopes/framing/schemas/framing-artifacts.schema.js";
import {
  createFramingStageArtifact,
  createFramingStages,
} from "../../src/scopes/framing/stages/createFramingStages.js";
import {
  FLOOR_FRAMING_RULE_IDS,
  FLOOR_QUANTITY_KEYS,
  ROOF_FRAMING_RULE_IDS,
  ROOF_QUANTITY_KEYS,
  SHEATHING_QUANTITY_KEYS,
  SHEATHING_RULE_IDS,
  STRUCTURAL_MEMBER_QUANTITY_KEYS,
  STRUCTURAL_MEMBER_RULE_IDS,
} from "../../src/scopes/framing/validators/rule-ids.js";
import { buildMultiObjectFramingEvidence } from "../fixtures/multiObjectFramingEvidence.js";

const FIXTURE_PDF = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/wall-w001-w002-o001-o002-o003-hdr001-hdr002-text-layer.pdf",
);

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
    if (context.userDecisionRunInput?.evidenceReplay) {
      return original.run(context);
    }

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
    (await mkdtemp(path.join(tmpdir(), "takeoff-bot-xd-ud-")));
  const planIndex = await indexPlan(FIXTURE_PDF);
  const runner = new PipelineRunner(new ArtifactStore(artifactRoot));
  const result = await runner.run({
    projectId: "cross-domain-ud-project",
    pdfPath: FIXTURE_PDF,
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
    producer: { type: "user", identifier: "cross-domain-ud-test" },
    inputArtifactIds: [input.validationArtifactId],
    parentArtifactIds: [input.validationArtifactId],
    payload: input.decision,
  });
}

function reviewItemFor(
  validation: ValidationPayload,
  objectId: string,
  targetProperty: string,
): ReviewItem {
  const reviewItem = validation.reviewItems.find(
    (item) =>
      item.affectedObjects.length === 1 &&
      item.affectedObjects[0]?.objectId === objectId &&
      item.action.targetProperty === targetProperty,
  );
  if (!reviewItem) {
    throw new Error(`Expected Review Item for ${objectId}.${targetProperty}.`);
  }
  return reviewItem;
}

function buildSheathingMissingAreaEvidence(): Evidence[] {
  return buildSheathingEvidenceForWall001().filter(
    (record) =>
      !(
        record.subjectKind === "sheathing-area" &&
        record.propertyPath === "areaSquareFeet"
      ),
  );
}

function buildHeaderMissingLengthEvidence(): Evidence[] {
  return buildMultiObjectFramingEvidence().filter(
    (record) =>
      !(
        record.subjectKind === "structural-member" &&
        record.subjectKey === "HDR-001" &&
        record.propertyPath === "lengthFeet"
      ),
  );
}

function buildCrossDomainBaseEvidence(): Evidence[] {
  return [
    ...buildMultiObjectFramingEvidence().filter(
      (record) =>
        record.subjectKind !== "sheathing-system" &&
        record.subjectKind !== "sheathing-area",
    ),
    ...buildFloorFramingJoistCountEvidence(),
    ...buildRoofFramingCommonRafterEvidence(),
    ...buildSheathingMissingAreaEvidence(),
  ];
}

describe("framing pipeline Run-2 cross-domain user decisions", () => {
  it("recovers floor joist count after joistLayoutLengthFeet User Decision", async () => {
    const evidence = buildFloorFramingJoistCountEvidence().map((record) => {
      if (
        record.subjectKey === "FFA-002" &&
        record.propertyPath === "joistLayoutLengthFeet"
      ) {
        return null;
      }
      return record;
    }).filter((record): record is Evidence => record !== null);

    const stages = withInjectedEvidence(createFramingStages(), [
      ...buildMultiObjectFramingEvidence().filter(
        (record) =>
          record.subjectKind !== "sheathing-system" &&
          record.subjectKind !== "sheathing-area",
      ),
      ...evidence,
      ...buildRoofFramingCommonRafterEvidence(),
      ...buildSheathingMissingAreaEvidence(),
    ]);
    const run1Root = await mkdtemp(path.join(tmpdir(), "takeoff-bot-floor-layout-r1-"));
    const run2Root = await mkdtemp(path.join(tmpdir(), "takeoff-bot-floor-layout-r2-"));

    try {
      const run1 = await runFramingPipeline(stages, { artifactRoot: run1Root });
      assert.equal(run1.result.success, true);

      const run1Floor = floorFramingArtifactSchema.parse(
        await readArtifact(stageByName(run1.result, "floorFraming").artifactPath),
      );
      const run1Calc = framingCalculationsArtifactSchema.parse(
        await readArtifact(stageByName(run1.result, "calculations").artifactPath),
      );
      const ffa002 = run1Floor.payload.areas.find((area) => area.id === "FFA-002");
      assert.equal(ffa002?.joistLayoutLengthFeet, null);
      assert.equal(
        run1Calc.payload.materials.find(
          (item) =>
            item.id === createMaterialLineItemId(FLOOR_QUANTITY_KEYS.joists, "FFA-002"),
        ),
        undefined,
      );

      const run1Validation = validationArtifactSchema.parse(
        await readArtifact(stageByName(run1.result, "validation").artifactPath),
      );
      const layoutReview = reviewItemFor(
        run1Validation.payload,
        "FFA-002",
        "joistLayoutLengthFeet",
      );
      const decision: UserDecision = {
        id: "UD-FFA002-LAYOUT-001",
        reviewItemId: layoutReview.id,
        result: {
          type: "value-provided",
          value: 20,
          rationale: "Reviewer supplied joist layout length 20 ft.",
        },
        supersedesUserDecisionId: null,
      };

      const decisionArtifact = createUserDecisionArtifact({
        projectId: "cross-domain-ud-project",
        pipelineRunId: run1.result.pipelineRunId,
        validationArtifactId: stageByName(run1.result, "validation").artifactId,
        decision,
      });
      const store = new ArtifactStore(run1Root);
      const decisionPath = await store.writeExternal(
        "cross-domain-ud-project",
        "framing",
        `${decision.id}.json`,
        decisionArtifact,
      );
      const loaded = userDecisionArtifactSchema.parse(await store.read(decisionPath));
      const reviewItemsById = new Map(
        run1Validation.payload.reviewItems.map((item) => [item.id, item]),
      );

      const run2 = await runFramingPipeline(stages, {
        artifactRoot: run2Root,
        userDecisionRunInput: {
          userDecisions: [loaded.payload],
          reviewItemsById,
          inputArtifactIds: [loaded.artifactId],
        },
      });
      assert.equal(run2.result.success, true);

      const run2Floor = floorFramingArtifactSchema.parse(
        await readArtifact(stageByName(run2.result, "floorFraming").artifactPath),
      );
      assert.equal(
        run2Floor.payload.areas.find((area) => area.id === "FFA-002")
          ?.joistLayoutLengthFeet,
        20,
      );

      const run2Calc = framingCalculationsArtifactSchema.parse(
        await readArtifact(stageByName(run2.result, "calculations").artifactPath),
      );
      assert.equal(
        run2Calc.payload.materials.find(
          (item) =>
            item.id === createMaterialLineItemId(FLOOR_QUANTITY_KEYS.joists, "FFA-002"),
        )?.quantity,
        16,
      );
      // Member length still missing on FFA-002 in this fixture → LF stays blocked.
      assert.equal(
        run2Calc.payload.materials.find(
          (item) =>
            item.id ===
            createMaterialLineItemId(FLOOR_QUANTITY_KEYS.joistLinearFeet, "FFA-002"),
        ),
        undefined,
      );
    } finally {
      await rm(run1Root, { recursive: true, force: true });
      await rm(run2Root, { recursive: true, force: true });
    }
  });

  it("recovers floor joist LF on Run 2 after joistMemberLengthFeet User Decision", async () => {
    const evidence = buildCrossDomainBaseEvidence();
    const stages = withInjectedEvidence(createFramingStages(), evidence);
    const run1Root = await mkdtemp(path.join(tmpdir(), "takeoff-bot-floor-ud-r1-"));
    const run2Root = await mkdtemp(path.join(tmpdir(), "takeoff-bot-floor-ud-r2-"));

    try {
      const run1 = await runFramingPipeline(stages, { artifactRoot: run1Root });
      assert.equal(run1.result.success, true);

      const run1Evidence = structuredClone(
        await readArtifact(stageByName(run1.result, "extractedEvidence").artifactPath),
      );
      const run1Validation = validationArtifactSchema.parse(
        await readArtifact(stageByName(run1.result, "validation").artifactPath),
      );
      const run1Floor = floorFramingArtifactSchema.parse(
        await readArtifact(stageByName(run1.result, "floorFraming").artifactPath),
      );
      const run1Calc = framingCalculationsArtifactSchema.parse(
        await readArtifact(stageByName(run1.result, "calculations").artifactPath),
      );

      const ffa002 = run1Floor.payload.areas.find((area) => area.id === "FFA-002");
      assert.ok(ffa002);
      assert.equal(ffa002.joistMemberLengthFeet, null);
      assert.ok(
        run1Calc.payload.materials.some(
          (item) =>
            item.id ===
            createMaterialLineItemId(FLOOR_QUANTITY_KEYS.joists, "FFA-002"),
        ),
      );
      assert.equal(
        run1Calc.payload.materials.find(
          (item) =>
            item.id ===
            createMaterialLineItemId(FLOOR_QUANTITY_KEYS.joistLinearFeet, "FFA-002"),
        ),
        undefined,
      );

      const memberLengthReview = reviewItemFor(
        run1Validation.payload,
        "FFA-002",
        "joistMemberLengthFeet",
      );
      assert.equal(memberLengthReview.action.type, "provide-value");

      const decision: UserDecision = {
        id: "UD-FFA002-MEMBER-LEN-001",
        reviewItemId: memberLengthReview.id,
        result: {
          type: "value-provided",
          value: 12,
          rationale: "Reviewer supplied installed joist member length 12 ft.",
        },
        supersedesUserDecisionId: null,
      };

      const decisionArtifact = createUserDecisionArtifact({
        projectId: "cross-domain-ud-project",
        pipelineRunId: run1.result.pipelineRunId,
        validationArtifactId: stageByName(run1.result, "validation").artifactId,
        decision,
      });
      const store = new ArtifactStore(run1Root);
      const decisionPath = await store.writeExternal(
        "cross-domain-ud-project",
        "framing",
        `${decision.id}.json`,
        decisionArtifact,
      );
      const loaded = userDecisionArtifactSchema.parse(await store.read(decisionPath));
      const reviewItemsById = new Map<ReviewItemId, ReviewItem>(
        run1Validation.payload.reviewItems.map((item) => [item.id, item]),
      );

      const run2 = await runFramingPipeline(stages, {
        artifactRoot: run2Root,
        userDecisionRunInput: {
          userDecisions: [loaded.payload],
          reviewItemsById,
          inputArtifactIds: [loaded.artifactId],
        },
      });
      assert.equal(run2.result.success, true);

      const run2Evidence = await readArtifact(
        stageByName(run2.result, "extractedEvidence").artifactPath,
      );
      assert.deepEqual(run2Evidence.payload.evidence, run1Evidence.payload.evidence);

      const run2Floor = floorFramingArtifactSchema.parse(
        await readArtifact(stageByName(run2.result, "floorFraming").artifactPath),
      );
      const ffa002Run2 = run2Floor.payload.areas.find((area) => area.id === "FFA-002");
      const ffa001Run2 = run2Floor.payload.areas.find((area) => area.id === "FFA-001");
      assert.ok(ffa002Run2);
      assert.ok(ffa001Run2);
      assert.equal(ffa002Run2.joistMemberLengthFeet, 12);
      assert.equal(ffa001Run2.joistMemberLengthFeet, 12);

      const memberTrace = ffa002Run2.resolutionTraces.find(
        (trace) => trace.propertyPath === "joistMemberLengthFeet",
      );
      assert.equal(memberTrace?.method, "user-override");
      assert.deepEqual(memberTrace?.userDecisionIds, ["UD-FFA002-MEMBER-LEN-001"]);

      const run2Calc = framingCalculationsArtifactSchema.parse(
        await readArtifact(stageByName(run2.result, "calculations").artifactPath),
      );
      const lf = run2Calc.payload.materials.find(
        (item) =>
          item.id ===
          createMaterialLineItemId(FLOOR_QUANTITY_KEYS.joistLinearFeet, "FFA-002"),
      );
      assert.equal(lf?.quantity, 192);
      assert.equal(lf?.unit, "linear-foot");

      const run2Validation = validationArtifactSchema.parse(
        await readArtifact(stageByName(run2.result, "validation").artifactPath),
      );
      assert.equal(
        run2Validation.payload.validationResults.find(
          (entry) =>
            entry.ruleId === FLOOR_FRAMING_RULE_IDS.joistMemberLengthResolved &&
            entry.target.kind === "object" &&
            entry.target.objectId === "FFA-002",
        )?.outcome,
        "passed",
      );

      assert.ok(run2Floor.inputArtifactIds.includes(loaded.artifactId));
    } finally {
      await rm(run1Root, { recursive: true, force: true });
      await rm(run2Root, { recursive: true, force: true });
    }
  });

  it("recovers roof common-rafter count after rafterLayoutLengthFeet User Decision", async () => {
    const stages = withInjectedEvidence(
      createFramingStages(),
      buildCrossDomainBaseEvidence(),
    );
    const run1Root = await mkdtemp(path.join(tmpdir(), "takeoff-bot-roof-ud-r1-"));
    const run2Root = await mkdtemp(path.join(tmpdir(), "takeoff-bot-roof-ud-r2-"));

    try {
      const run1 = await runFramingPipeline(stages, { artifactRoot: run1Root });
      assert.equal(run1.result.success, true);

      const run1Validation = validationArtifactSchema.parse(
        await readArtifact(stageByName(run1.result, "validation").artifactPath),
      );
      const run1Roof = roofFramingArtifactSchema.parse(
        await readArtifact(stageByName(run1.result, "roofFraming").artifactPath),
      );
      const run1Calc = framingCalculationsArtifactSchema.parse(
        await readArtifact(stageByName(run1.result, "calculations").artifactPath),
      );

      const rfp002 = run1Roof.payload.planes.find((plane) => plane.id === "RFP-002");
      assert.ok(rfp002);
      assert.equal(rfp002.rafterLayoutLengthFeet, null);
      assert.equal(
        run1Calc.payload.materials.find(
          (item) =>
            item.id ===
            createMaterialLineItemId(ROOF_QUANTITY_KEYS.commonRafters, "RFP-002"),
        ),
        undefined,
      );
      assert.ok(
        run1Calc.payload.materials.some(
          (item) =>
            item.id ===
            createMaterialLineItemId(ROOF_QUANTITY_KEYS.commonRafters, "RFP-001"),
        ),
      );

      const layoutReview = reviewItemFor(
        run1Validation.payload,
        "RFP-002",
        "rafterLayoutLengthFeet",
      );

      const decision: UserDecision = {
        id: "UD-RFP002-LAYOUT-001",
        reviewItemId: layoutReview.id,
        result: {
          type: "value-provided",
          value: 20,
          rationale: "Reviewer supplied rafter layout length 20 ft.",
        },
        supersedesUserDecisionId: null,
      };

      const decisionArtifact = createUserDecisionArtifact({
        projectId: "cross-domain-ud-project",
        pipelineRunId: run1.result.pipelineRunId,
        validationArtifactId: stageByName(run1.result, "validation").artifactId,
        decision,
      });
      const store = new ArtifactStore(run1Root);
      const decisionPath = await store.writeExternal(
        "cross-domain-ud-project",
        "framing",
        `${decision.id}.json`,
        decisionArtifact,
      );
      const loaded = userDecisionArtifactSchema.parse(await store.read(decisionPath));
      const reviewItemsById = new Map(
        run1Validation.payload.reviewItems.map((item) => [item.id, item]),
      );

      const run2 = await runFramingPipeline(stages, {
        artifactRoot: run2Root,
        userDecisionRunInput: {
          userDecisions: [loaded.payload],
          reviewItemsById,
          inputArtifactIds: [loaded.artifactId],
        },
      });
      assert.equal(run2.result.success, true);

      const run2Roof = roofFramingArtifactSchema.parse(
        await readArtifact(stageByName(run2.result, "roofFraming").artifactPath),
      );
      const rfp002Run2 = run2Roof.payload.planes.find((plane) => plane.id === "RFP-002");
      const rfp001Run2 = run2Roof.payload.planes.find((plane) => plane.id === "RFP-001");
      assert.equal(rfp002Run2?.rafterLayoutLengthFeet, 20);
      assert.equal(rfp001Run2?.rafterLayoutLengthFeet, 20);

      const layoutTrace = rfp002Run2?.resolutionTraces.find(
        (trace) => trace.propertyPath === "rafterLayoutLengthFeet",
      );
      assert.equal(layoutTrace?.method, "user-override");
      assert.deepEqual(layoutTrace?.userDecisionIds, ["UD-RFP002-LAYOUT-001"]);

      const run2Calc = framingCalculationsArtifactSchema.parse(
        await readArtifact(stageByName(run2.result, "calculations").artifactPath),
      );
      const commons = run2Calc.payload.materials.find(
        (item) =>
          item.id ===
          createMaterialLineItemId(ROOF_QUANTITY_KEYS.commonRafters, "RFP-002"),
      );
      assert.equal(commons?.quantity, 16);
      assert.equal(commons?.unit, "each");

      const run2Validation = validationArtifactSchema.parse(
        await readArtifact(stageByName(run2.result, "validation").artifactPath),
      );
      assert.equal(
        run2Validation.payload.validationResults.find(
          (entry) =>
            entry.ruleId === ROOF_FRAMING_RULE_IDS.rafterLayoutLengthResolved &&
            entry.target.kind === "object" &&
            entry.target.objectId === "RFP-002",
        )?.outcome,
        "passed",
      );
    } finally {
      await rm(run1Root, { recursive: true, force: true });
      await rm(run2Root, { recursive: true, force: true });
    }
  });

  it("indexes sheathing objects in Review Workspace and recovers SF after areaSquareFeet decision", async () => {
    const stages = withInjectedEvidence(
      createFramingStages(),
      buildCrossDomainBaseEvidence(),
    );
    const run1Root = await mkdtemp(path.join(tmpdir(), "takeoff-bot-sh-ud-r1-"));
    const run2Root = await mkdtemp(path.join(tmpdir(), "takeoff-bot-sh-ud-r2-"));

    try {
      const run1 = await runFramingPipeline(stages, { artifactRoot: run1Root });
      assert.equal(run1.result.success, true);

      const run1Validation = validationArtifactSchema.parse(
        await readArtifact(stageByName(run1.result, "validation").artifactPath),
      );
      const run1Sheathing = sheathingArtifactSchema.parse(
        await readArtifact(stageByName(run1.result, "sheathing").artifactPath),
      );
      const run1Calc = framingCalculationsArtifactSchema.parse(
        await readArtifact(stageByName(run1.result, "calculations").artifactPath),
      );
      const run1Floor = floorFramingArtifactSchema.parse(
        await readArtifact(stageByName(run1.result, "floorFraming").artifactPath),
      );
      const run1Roof = roofFramingArtifactSchema.parse(
        await readArtifact(stageByName(run1.result, "roofFraming").artifactPath),
      );
      const run1Openings = await readArtifact(
        stageByName(run1.result, "openings").artifactPath,
      );
      const run1Sm = structuralMembersArtifactSchema.parse(
        await readArtifact(stageByName(run1.result, "structuralMembers").artifactPath),
      );
      const run1Wall = await readArtifact(
        stageByName(run1.result, "wallFraming").artifactPath,
      );

      const sha001 = run1Sheathing.payload.areas.find((area) => area.id === "SHA-001");
      assert.ok(sha001);
      assert.equal(sha001.areaSquareFeet, null);
      assert.equal(
        run1Calc.payload.materials.find(
          (item) =>
            item.id === createMaterialLineItemId(SHEATHING_QUANTITY_KEYS.area, "SHA-001"),
        ),
        undefined,
      );

      const workspace = projectFramingReviewWorkspace({
        validation: run1Validation.payload,
        calculations: run1Calc.payload,
        openings: run1Openings.payload,
        structuralMembers: run1Sm.payload,
        wallFraming: run1Wall.payload,
        floorFraming: run1Floor.payload,
        roofFraming: run1Roof.payload,
        sheathing: run1Sheathing.payload,
      });
      const shaReview = workspace.items.find(
        (item) =>
          item.objectId === "SHA-001" &&
          item.action.targetProperty === "areaSquareFeet",
      );
      assert.ok(shaReview);
      assert.equal(shaReview.objectType, "sheathing-area");
      assert.equal(shaReview.objectDomain, "sheathing-area");

      const areaReview = reviewItemFor(
        run1Validation.payload,
        "SHA-001",
        "areaSquareFeet",
      );
      const decision: UserDecision = {
        id: "UD-SHA001-AREA-001",
        reviewItemId: areaReview.id,
        result: {
          type: "value-provided",
          value: 240,
          rationale: "Reviewer supplied sheathing coverage 240 SF.",
        },
        supersedesUserDecisionId: null,
      };

      const decisionArtifact = createUserDecisionArtifact({
        projectId: "cross-domain-ud-project",
        pipelineRunId: run1.result.pipelineRunId,
        validationArtifactId: stageByName(run1.result, "validation").artifactId,
        decision,
      });
      const store = new ArtifactStore(run1Root);
      const decisionPath = await store.writeExternal(
        "cross-domain-ud-project",
        "framing",
        `${decision.id}.json`,
        decisionArtifact,
      );
      const loaded = userDecisionArtifactSchema.parse(await store.read(decisionPath));
      const reviewItemsById = new Map(
        run1Validation.payload.reviewItems.map((item) => [item.id, item]),
      );

      const run2 = await runFramingPipeline(stages, {
        artifactRoot: run2Root,
        userDecisionRunInput: {
          userDecisions: [loaded.payload],
          reviewItemsById,
          inputArtifactIds: [loaded.artifactId],
        },
      });
      assert.equal(run2.result.success, true);

      const run2Sheathing = sheathingArtifactSchema.parse(
        await readArtifact(stageByName(run2.result, "sheathing").artifactPath),
      );
      const sha001Run2 = run2Sheathing.payload.areas.find(
        (area) => area.id === "SHA-001",
      );
      assert.equal(sha001Run2?.areaSquareFeet, 240);
      const areaTrace = sha001Run2?.resolutionTraces.find(
        (trace) => trace.propertyPath === "areaSquareFeet",
      );
      assert.equal(areaTrace?.method, "user-override");
      assert.deepEqual(areaTrace?.userDecisionIds, ["UD-SHA001-AREA-001"]);

      const run2Calc = framingCalculationsArtifactSchema.parse(
        await readArtifact(stageByName(run2.result, "calculations").artifactPath),
      );
      const sf = run2Calc.payload.materials.find(
        (item) =>
          item.id === createMaterialLineItemId(SHEATHING_QUANTITY_KEYS.area, "SHA-001"),
      );
      assert.equal(sf?.quantity, 240);
      assert.equal(sf?.unit, "square-foot");

      const run2Validation = validationArtifactSchema.parse(
        await readArtifact(stageByName(run2.result, "validation").artifactPath),
      );
      assert.equal(
        run2Validation.payload.validationResults.find(
          (entry) =>
            entry.ruleId === SHEATHING_RULE_IDS.areaSquareFeetResolved &&
            entry.target.kind === "object" &&
            entry.target.objectId === "SHA-001",
        )?.outcome,
        "passed",
      );
    } finally {
      await rm(run1Root, { recursive: true, force: true });
      await rm(run2Root, { recursive: true, force: true });
    }
  });

  it("resolves conflicting roof layout Evidence via conflict-resolved User Decision", async () => {
    const base = buildRoofFramingCommonRafterEvidence().filter(
      (record) =>
        !(
          record.subjectKey === "RFP-002" &&
          record.propertyPath === "rafterLayoutLengthFeet"
        ),
    );
    const conflictEvidence: Evidence[] = [
      ...base,
      evidenceSchema.parse({
        id: "E-RFP-002-LAYOUT-A",
        type: "dimension",
        relationship: "supports",
        description: "Conflicting rafter layout length A.",
        source: {
          page: {
            documentId: null,
            pageNumber: 1,
            sheetId: null,
            sheetTitle: null,
            pageLabel: null,
            revision: null,
          },
          region: null,
          elementLabel: "RFP-002",
          detailNumber: null,
          sectionNumber: null,
          scheduleName: null,
          noteReference: null,
        },
        originalText: "Rafter layout length: 18 feet",
        references: [],
        subjectKind: "roof-plane",
        subjectKey: "RFP-002",
        propertyPath: "rafterLayoutLengthFeet",
        candidateValue: 18,
      }),
      evidenceSchema.parse({
        id: "E-RFP-002-LAYOUT-B",
        type: "dimension",
        relationship: "supports",
        description: "Conflicting rafter layout length B.",
        source: {
          page: {
            documentId: null,
            pageNumber: 1,
            sheetId: null,
            sheetTitle: null,
            pageLabel: null,
            revision: null,
          },
          region: null,
          elementLabel: "RFP-002",
          detailNumber: null,
          sectionNumber: null,
          scheduleName: null,
          noteReference: null,
        },
        originalText: "Rafter layout length: 20 feet",
        references: [],
        subjectKind: "roof-plane",
        subjectKey: "RFP-002",
        propertyPath: "rafterLayoutLengthFeet",
        candidateValue: 20,
      }),
    ];

    const stages = withInjectedEvidence(createFramingStages(), [
      ...buildMultiObjectFramingEvidence().filter(
        (record) =>
          record.subjectKind !== "sheathing-system" &&
          record.subjectKind !== "sheathing-area",
      ),
      ...buildFloorFramingJoistCountEvidence(),
      ...conflictEvidence,
      ...buildSheathingMissingAreaEvidence(),
    ]);
    const run1Root = await mkdtemp(path.join(tmpdir(), "takeoff-bot-roof-cf-r1-"));
    const run2Root = await mkdtemp(path.join(tmpdir(), "takeoff-bot-roof-cf-r2-"));

    try {
      const run1 = await runFramingPipeline(stages, { artifactRoot: run1Root });
      assert.equal(run1.result.success, true);

      const run1Roof = roofFramingArtifactSchema.parse(
        await readArtifact(stageByName(run1.result, "roofFraming").artifactPath),
      );
      const rfp002 = run1Roof.payload.planes.find((plane) => plane.id === "RFP-002");
      assert.equal(rfp002?.rafterLayoutLengthFeet, null);
      const conflictTrace = rfp002?.resolutionTraces.find(
        (trace) => trace.propertyPath === "rafterLayoutLengthFeet",
      );
      assert.equal(conflictTrace?.method, "unresolved");

      const run1Validation = validationArtifactSchema.parse(
        await readArtifact(stageByName(run1.result, "validation").artifactPath),
      );
      const layoutReview = reviewItemFor(
        run1Validation.payload,
        "RFP-002",
        "rafterLayoutLengthFeet",
      );

      const decision: UserDecision = {
        id: "UD-RFP002-LAYOUT-CONFLICT-001",
        reviewItemId: layoutReview.id,
        result: {
          type: "conflict-resolved",
          value: 20,
          acceptedEvidenceIds: ["E-RFP-002-LAYOUT-B"],
          rejectedEvidenceIds: ["E-RFP-002-LAYOUT-A"],
          rationale: "Reviewer selected 20 ft from conflicting layout lengths.",
        },
        supersedesUserDecisionId: null,
      };

      const decisionArtifact = createUserDecisionArtifact({
        projectId: "cross-domain-ud-project",
        pipelineRunId: run1.result.pipelineRunId,
        validationArtifactId: stageByName(run1.result, "validation").artifactId,
        decision,
      });
      const store = new ArtifactStore(run1Root);
      const decisionPath = await store.writeExternal(
        "cross-domain-ud-project",
        "framing",
        `${decision.id}.json`,
        decisionArtifact,
      );
      const loaded = userDecisionArtifactSchema.parse(await store.read(decisionPath));
      const reviewItemsById = new Map(
        run1Validation.payload.reviewItems.map((item) => [item.id, item]),
      );

      const run2 = await runFramingPipeline(stages, {
        artifactRoot: run2Root,
        userDecisionRunInput: {
          userDecisions: [loaded.payload],
          reviewItemsById,
          inputArtifactIds: [loaded.artifactId],
        },
      });
      assert.equal(run2.result.success, true);

      const run2Roof = roofFramingArtifactSchema.parse(
        await readArtifact(stageByName(run2.result, "roofFraming").artifactPath),
      );
      const rfp002Run2 = run2Roof.payload.planes.find((plane) => plane.id === "RFP-002");
      assert.equal(rfp002Run2?.rafterLayoutLengthFeet, 20);
      const overrideTrace = rfp002Run2?.resolutionTraces.find(
        (trace) => trace.propertyPath === "rafterLayoutLengthFeet",
      );
      assert.equal(overrideTrace?.method, "user-override");
      assert.deepEqual(overrideTrace?.userDecisionIds, [
        "UD-RFP002-LAYOUT-CONFLICT-001",
      ]);
      assert.ok(overrideTrace?.evidenceIds.includes("E-RFP-002-LAYOUT-A"));
      assert.ok(overrideTrace?.evidenceIds.includes("E-RFP-002-LAYOUT-B"));

      const run2Calc = framingCalculationsArtifactSchema.parse(
        await readArtifact(stageByName(run2.result, "calculations").artifactPath),
      );
      assert.equal(
        run2Calc.payload.materials.find(
          (item) =>
            item.id ===
            createMaterialLineItemId(ROOF_QUANTITY_KEYS.commonRafters, "RFP-002"),
        )?.quantity,
        16,
      );
    } finally {
      await rm(run1Root, { recursive: true, force: true });
      await rm(run2Root, { recursive: true, force: true });
    }
  });

  it("applies Floor + Roof + Sheathing decisions together without sibling blast radius", async () => {
    const stages = withInjectedEvidence(
      createFramingStages(),
      buildCrossDomainBaseEvidence(),
    );
    const run1Root = await mkdtemp(path.join(tmpdir(), "takeoff-bot-xd-r1-"));
    const run2Root = await mkdtemp(path.join(tmpdir(), "takeoff-bot-xd-r2-"));

    try {
      const run1 = await runFramingPipeline(stages, { artifactRoot: run1Root });
      assert.equal(run1.result.success, true);
      const run1Validation = validationArtifactSchema.parse(
        await readArtifact(stageByName(run1.result, "validation").artifactPath),
      );
      const run1Calc = framingCalculationsArtifactSchema.parse(
        await readArtifact(stageByName(run1.result, "calculations").artifactPath),
      );
      const run1WallStuds = run1Calc.payload.materials.filter((item) =>
        item.id.startsWith("wall.studs:"),
      );

      const decisions: UserDecision[] = [
        {
          id: "UD-FFA002-MEMBER-LEN-XD",
          reviewItemId: reviewItemFor(
            run1Validation.payload,
            "FFA-002",
            "joistMemberLengthFeet",
          ).id,
          result: {
            type: "value-provided",
            value: 12,
            rationale: "Floor member length.",
          },
          supersedesUserDecisionId: null,
        },
        {
          id: "UD-RFP002-LAYOUT-XD",
          reviewItemId: reviewItemFor(
            run1Validation.payload,
            "RFP-002",
            "rafterLayoutLengthFeet",
          ).id,
          result: {
            type: "value-provided",
            value: 20,
            rationale: "Roof layout length.",
          },
          supersedesUserDecisionId: null,
        },
        {
          id: "UD-SHA001-AREA-XD",
          reviewItemId: reviewItemFor(
            run1Validation.payload,
            "SHA-001",
            "areaSquareFeet",
          ).id,
          result: {
            type: "value-provided",
            value: 240,
            rationale: "Sheathing area.",
          },
          supersedesUserDecisionId: null,
        },
      ];

      const reviewItemsById = new Map(
        run1Validation.payload.reviewItems.map((item) => [item.id, item]),
      );
      const inputArtifactIds = [];
      for (const decision of decisions) {
        const artifact = createUserDecisionArtifact({
          projectId: "cross-domain-ud-project",
          pipelineRunId: run1.result.pipelineRunId,
          validationArtifactId: stageByName(run1.result, "validation").artifactId,
          decision,
        });
        const store = new ArtifactStore(run1Root);
        const decisionPath = await store.writeExternal(
          "cross-domain-ud-project",
          "framing",
          `${decision.id}.json`,
          artifact,
        );
        const loaded = userDecisionArtifactSchema.parse(await store.read(decisionPath));
        inputArtifactIds.push(loaded.artifactId);
      }

      const run2 = await runFramingPipeline(stages, {
        artifactRoot: run2Root,
        userDecisionRunInput: {
          userDecisions: decisions,
          reviewItemsById,
          inputArtifactIds,
        },
      });
      assert.equal(run2.result.success, true);

      const run2Calc = framingCalculationsArtifactSchema.parse(
        await readArtifact(stageByName(run2.result, "calculations").artifactPath),
      );
      assert.equal(
        run2Calc.payload.materials.find(
          (item) =>
            item.id ===
            createMaterialLineItemId(FLOOR_QUANTITY_KEYS.joistLinearFeet, "FFA-002"),
        )?.quantity,
        192,
      );
      assert.equal(
        run2Calc.payload.materials.find(
          (item) =>
            item.id ===
            createMaterialLineItemId(ROOF_QUANTITY_KEYS.commonRafters, "RFP-002"),
        )?.quantity,
        16,
      );
      assert.equal(
        run2Calc.payload.materials.find(
          (item) =>
            item.id === createMaterialLineItemId(SHEATHING_QUANTITY_KEYS.area, "SHA-001"),
        )?.quantity,
        240,
      );

      const run2Floor = floorFramingArtifactSchema.parse(
        await readArtifact(stageByName(run2.result, "floorFraming").artifactPath),
      );
      assert.equal(
        run2Floor.payload.areas.find((area) => area.id === "FFA-001")
          ?.joistMemberLengthFeet,
        12,
      );

      const run2Roof = roofFramingArtifactSchema.parse(
        await readArtifact(stageByName(run2.result, "roofFraming").artifactPath),
      );
      assert.equal(
        run2Roof.payload.planes.find((plane) => plane.id === "RFP-001")
          ?.rafterLayoutLengthFeet,
        20,
      );

      const run2WallStuds = run2Calc.payload.materials.filter((item) =>
        item.id.startsWith("wall.studs:"),
      );
      assert.deepEqual(
        run2WallStuds.map((item) => ({ id: item.id, quantity: item.quantity })),
        run1WallStuds.map((item) => ({ id: item.id, quantity: item.quantity })),
      );

      finalFramingTakeoffArtifactSchema.parse(
        await readArtifact(stageByName(run2.result, "report").artifactPath),
      );
    } finally {
      await rm(run1Root, { recursive: true, force: true });
      await rm(run2Root, { recursive: true, force: true });
    }
  });

  it("recovers SM header LF after lengthFeet User Decision", async () => {
    const stages = withInjectedEvidence(
      createFramingStages(),
      buildHeaderMissingLengthEvidence(),
    );
    const run1Root = await mkdtemp(path.join(tmpdir(), "takeoff-bot-sm-ud-r1-"));
    const run2Root = await mkdtemp(path.join(tmpdir(), "takeoff-bot-sm-ud-r2-"));

    try {
      const run1 = await runFramingPipeline(stages, { artifactRoot: run1Root });
      assert.equal(run1.result.success, true);

      const run1Validation = validationArtifactSchema.parse(
        await readArtifact(stageByName(run1.result, "validation").artifactPath),
      );
      const run1Sm = structuralMembersArtifactSchema.parse(
        await readArtifact(stageByName(run1.result, "structuralMembers").artifactPath),
      );
      const hdr001 = run1Sm.payload.structuralMembers.find(
        (member) => member.id === "SM-HDR-001",
      );
      assert.equal(hdr001?.lengthFeet, null);

      const lengthReview = reviewItemFor(
        run1Validation.payload,
        "SM-HDR-001",
        "lengthFeet",
      );
      const decision: UserDecision = {
        id: "UD-SM-HDR001-LENGTH-001",
        reviewItemId: lengthReview.id,
        result: {
          type: "value-provided",
          value: 6,
          rationale: "Reviewer supplied header length 6 ft.",
        },
        supersedesUserDecisionId: null,
      };

      const decisionArtifact = createUserDecisionArtifact({
        projectId: "cross-domain-ud-project",
        pipelineRunId: run1.result.pipelineRunId,
        validationArtifactId: stageByName(run1.result, "validation").artifactId,
        decision,
      });
      const store = new ArtifactStore(run1Root);
      const decisionPath = await store.writeExternal(
        "cross-domain-ud-project",
        "framing",
        `${decision.id}.json`,
        decisionArtifact,
      );
      const loaded = userDecisionArtifactSchema.parse(await store.read(decisionPath));
      const reviewItemsById = new Map(
        run1Validation.payload.reviewItems.map((item) => [item.id, item]),
      );

      const run2 = await runFramingPipeline(stages, {
        artifactRoot: run2Root,
        userDecisionRunInput: {
          userDecisions: [loaded.payload],
          reviewItemsById,
          inputArtifactIds: [loaded.artifactId],
        },
      });
      assert.equal(run2.result.success, true);

      const run2Sm = structuralMembersArtifactSchema.parse(
        await readArtifact(stageByName(run2.result, "structuralMembers").artifactPath),
      );
      const hdr001Run2 = run2Sm.payload.structuralMembers.find(
        (member) => member.id === "SM-HDR-001",
      );
      assert.equal(hdr001Run2?.lengthFeet, 6);
      const lengthTrace = hdr001Run2?.resolutionTraces.find(
        (trace) => trace.propertyPath === "lengthFeet",
      );
      assert.equal(lengthTrace?.method, "user-override");
      assert.deepEqual(lengthTrace?.userDecisionIds, ["UD-SM-HDR001-LENGTH-001"]);

      const run2Calc = framingCalculationsArtifactSchema.parse(
        await readArtifact(stageByName(run2.result, "calculations").artifactPath),
      );
      assert.ok(
        run2Calc.payload.materials.some(
          (item) =>
            item.id ===
            createMaterialLineItemId(
              STRUCTURAL_MEMBER_QUANTITY_KEYS.material,
              "SM-HDR-001",
            ),
        ),
      );

      const run2Validation = validationArtifactSchema.parse(
        await readArtifact(stageByName(run2.result, "validation").artifactPath),
      );
      assert.equal(
        run2Validation.payload.validationResults.find(
          (entry) =>
            entry.ruleId === STRUCTURAL_MEMBER_RULE_IDS.lengthResolved &&
            entry.target.kind === "object" &&
            entry.target.objectId === "SM-HDR-001",
        )?.outcome,
        "passed",
      );
    } finally {
      await rm(run1Root, { recursive: true, force: true });
      await rm(run2Root, { recursive: true, force: true });
    }
  });

  it("rejects invalid User Decision values safely", async () => {
    const { resolveFloorFraming } = await import(
      "../../src/scopes/framing/resolvers/resolveFloorFraming.js"
    );
    const evidence = buildFloorFramingJoistCountEvidence();
    const floor = resolveFloorFraming(evidence);
    const validation = (
      await import("../../src/scopes/framing/validators/floor-framing.validator.js")
    ).validateFloorFraming({ payload: floor });
    const reviewItem = reviewItemFor(
      validation,
      "FFA-002",
      "joistMemberLengthFeet",
    );

    assert.throws(
      () =>
        resolveFloorFraming(evidence, {
          userDecisions: [
            {
              id: "UD-INVALID-NEG",
              reviewItemId: reviewItem.id,
              result: {
                type: "value-provided",
                value: -12,
                rationale: "Invalid negative length.",
              },
              supersedesUserDecisionId: null,
            },
          ],
          reviewItemsById: new Map([[reviewItem.id, reviewItem]]),
        }),
      /value is not valid for property joistMemberLengthFeet/,
    );
  });
});
