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
import type { UserDecision } from "../../src/core/schemas/user-decision.schema.js";
import { indexPlan } from "../../src/plans/indexPlan.js";
import { createMaterialLineItemId } from "../../src/scopes/framing/calculators/ids.js";
import {
  createFloorFramingAreaObjectId,
  createOpeningObjectId,
  createRoofPlaneObjectId,
  createSheathingAreaObjectId,
  createStructuralMemberObjectId,
  createWallObjectId,
  createWallSegmentObjectId,
} from "../../src/scopes/framing/resolvers/ids.js";
import {
  extractedFramingEvidenceArtifactSchema,
  floorFramingArtifactSchema,
  framingCalculationsArtifactSchema,
  roofFramingArtifactSchema,
  sheathingArtifactSchema,
  validationArtifactSchema,
} from "../../src/scopes/framing/schemas/framing-artifacts.schema.js";
import { buildEvidenceReplayInput } from "../../src/scopes/framing/stages/buildEvidenceReplayInput.js";
import {
  createFramingStageArtifact,
  createFramingStages,
} from "../../src/scopes/framing/stages/createFramingStages.js";
import {
  FLOOR_QUANTITY_KEYS,
  OPENING_QUANTITY_KEYS,
  ROOF_QUANTITY_KEYS,
  SHEATHING_QUANTITY_KEYS,
  STRUCTURAL_MEMBER_QUANTITY_KEYS,
  WALL_QUANTITY_KEYS,
} from "../../src/scopes/framing/validators/rule-ids.js";
import { createUserDecisionArtifact } from "../../src/ui/createUserDecisionArtifact.js";
import { buildRealisticResidentialInjectedEvidence } from "../fixtures/realisticResidentialInjectedEvidence.js";
import {
  findForbiddenInventions,
  scoreExpectedFacts,
} from "../helpers/extractionQuality.js";
import {
  REALISTIC_PLAN_EXPECTED_FACTS,
  REALISTIC_PLAN_FORBIDDEN_INVENTIONS,
} from "../fixtures/realisticResidentialFramingPlan.js";
import { materialLineItemId } from "../integration/liveFramingProofHelpers.js";

const FIXTURE_PDF = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/realistic-residential-framing-plan-text-layer.pdf",
);

const WALL_ID = createWallObjectId("W1");
const SEGMENT_ID = createWallSegmentObjectId(WALL_ID);
const OPENING_W3 = createOpeningObjectId("W3");
const OPENING_D04 = createOpeningObjectId("D04");
const HEADER_H2 = createStructuralMemberObjectId("H2");
const BEAM_B1 = createStructuralMemberObjectId("B1");
const FLOOR_AREA = createFloorFramingAreaObjectId("BAY A");
const ROOF_PLANE = createRoofPlaneObjectId("GABLE A");
const SHEATHING_AREA = createSheathingAreaObjectId("WALL SH A");

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

describe("realistic synthetic deterministic pipeline (injected Evidence)", () => {
  it("resolves multi-domain graph and authorized materials without Claude", async () => {
    const evidence = buildRealisticResidentialInjectedEvidence();
    const scores = scoreExpectedFacts(evidence, REALISTIC_PLAN_EXPECTED_FACTS);
    assert.equal(
      scores.filter((score) => score.classification === "MISSING").length,
      0,
      scores
        .filter((score) => score.classification === "MISSING")
        .map((score) => score.factId)
        .join(", "),
    );
    assert.equal(
      findForbiddenInventions(evidence, REALISTIC_PLAN_FORBIDDEN_INVENTIONS).length,
      0,
    );

    const root = await mkdtemp(path.join(tmpdir(), "realistic-injected-"));
    try {
      const planIndex = await indexPlan(FIXTURE_PDF);
      const runner = new PipelineRunner(new ArtifactStore(root));
      const result = await runner.run({
        projectId: "realistic-injected",
        pdfPath: FIXTURE_PDF,
        scopeName: "framing",
        planIndex,
        useMockAi: true,
        stages: withInjectedEvidence(createFramingStages(), evidence),
      });
      assert.equal(result.success, true, result.errors.join("\n"));

      const calc = framingCalculationsArtifactSchema.parse(
        JSON.parse(
          await readFile(
            result.stageResults.find((s) => s.name === "calculations")!.artifactPath,
            "utf8",
          ),
        ),
      ).payload;

      assert.equal(
        calc.materials.find(
          (item) =>
            item.id === materialLineItemId(WALL_QUANTITY_KEYS.studs, SEGMENT_ID),
        )?.quantity,
        19,
      );
      assert.equal(
        calc.materials.find(
          (item) =>
            item.id ===
            materialLineItemId(OPENING_QUANTITY_KEYS.jackStuds, OPENING_W3),
        )?.quantity,
        2,
      );
      assert.equal(
        calc.materials.find(
          (item) =>
            item.id ===
            createMaterialLineItemId(
              STRUCTURAL_MEMBER_QUANTITY_KEYS.material,
              HEADER_H2,
            ),
        )?.quantity,
        6,
      );
      assert.equal(
        calc.materials.find(
          (item) =>
            item.id ===
            createMaterialLineItemId(
              STRUCTURAL_MEMBER_QUANTITY_KEYS.material,
              BEAM_B1,
            ),
        )?.quantity,
        16,
      );
      assert.equal(
        calc.materials.find(
          (item) =>
            item.id === materialLineItemId(FLOOR_QUANTITY_KEYS.joists, FLOOR_AREA),
        )?.quantity,
        16,
      );
      assert.equal(
        calc.materials.find(
          (item) =>
            item.id ===
            materialLineItemId(FLOOR_QUANTITY_KEYS.joistLinearFeet, FLOOR_AREA),
        )?.quantity,
        192,
      );
      assert.equal(
        calc.materials.find(
          (item) =>
            item.id ===
            materialLineItemId(ROOF_QUANTITY_KEYS.commonRafters, ROOF_PLANE),
        )?.quantity,
        16,
      );
      assert.equal(
        calc.materials.find(
          (item) =>
            item.id ===
            createMaterialLineItemId(SHEATHING_QUANTITY_KEYS.area, SHEATHING_AREA),
        ),
        undefined,
      );

      const validation = validationArtifactSchema.parse(
        JSON.parse(
          await readFile(
            result.stageResults.find((s) => s.name === "validation")!.artifactPath,
            "utf8",
          ),
        ),
      ).payload;
      assert.ok(
        validation.reviewItems.some(
          (item) =>
            item.affectedObjects.some((object) => object.objectId === SHEATHING_AREA) &&
            item.action.targetProperty === "areaSquareFeet",
        ),
      );
      assert.ok(
        validation.reviewItems.some(
          (item) =>
            item.affectedObjects.some((object) => object.objectId === OPENING_D04) &&
            item.action.targetProperty === "jackStudCount",
        ),
      );

      const floor = floorFramingArtifactSchema.parse(
        JSON.parse(
          await readFile(
            result.stageResults.find((s) => s.name === "floorFraming")!.artifactPath,
            "utf8",
          ),
        ),
      ).payload;
      assert.ok(floor.areas.some((area) => area.id === FLOOR_AREA));

      const roof = roofFramingArtifactSchema.parse(
        JSON.parse(
          await readFile(
            result.stageResults.find((s) => s.name === "roofFraming")!.artifactPath,
            "utf8",
          ),
        ),
      ).payload;
      assert.ok(roof.planes.some((plane) => plane.id === ROOF_PLANE));

      const sheathing = sheathingArtifactSchema.parse(
        JSON.parse(
          await readFile(
            result.stageResults.find((s) => s.name === "sheathing")!.artifactPath,
            "utf8",
          ),
        ),
      ).payload;
      assert.equal(
        sheathing.areas.find((area) => area.id === SHEATHING_AREA)?.areaSquareFeet,
        null,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("Run-2 sheathing SF User Decision emits 1420 when application identity is resolved", async () => {
    const evidence = buildRealisticResidentialInjectedEvidence();
    const run1Root = await mkdtemp(path.join(tmpdir(), "realistic-sha-r1-"));
    const run2Root = await mkdtemp(path.join(tmpdir(), "realistic-sha-r2-"));
    try {
      const planIndex = await indexPlan(FIXTURE_PDF);
      const run1 = await new PipelineRunner(new ArtifactStore(run1Root)).run({
        projectId: "realistic-sha-r1",
        pdfPath: FIXTURE_PDF,
        scopeName: "framing",
        planIndex,
        useMockAi: true,
        stages: withInjectedEvidence(createFramingStages(), evidence),
      });
      assert.equal(run1.success, true, run1.errors.join("\n"));

      const validation = validationArtifactSchema.parse(
        JSON.parse(
          await readFile(
            run1.stageResults.find((s) => s.name === "validation")!.artifactPath,
            "utf8",
          ),
        ),
      );
      const sheathingSfReview = validation.payload.reviewItems.find(
        (item) =>
          item.affectedObjects.some((object) => object.objectId === SHEATHING_AREA) &&
          item.action.targetProperty === "areaSquareFeet",
      );
      assert.ok(sheathingSfReview);

      const decision: UserDecision = {
        id: "UD-REALISTIC-SHEATHING-SF-001",
        reviewItemId: sheathingSfReview.id,
        result: {
          type: "value-provided",
          value: 1420,
          rationale: "Reviewer supplied wall sheathing coverage from field measure.",
        },
        supersedesUserDecisionId: null,
      };
      const written = createUserDecisionArtifact({
        projectId: "realistic-sha-r1",
        pipelineRunId: run1.pipelineRunId,
        validationArtifactId: validation.artifactId,
        decision,
        producerIdentifier: "realistic-injected-test",
      });
      const reviewItemsById = new Map(
        validation.payload.reviewItems.map((item) => [item.id, item]),
      );

      const run1EvidenceArtifact = extractedFramingEvidenceArtifactSchema.parse(
        JSON.parse(
          await readFile(
            run1.stageResults.find((s) => s.name === "extractedEvidence")!
              .artifactPath,
            "utf8",
          ),
        ),
      );

      const run2 = await new PipelineRunner(new ArtifactStore(run2Root)).run({
        projectId: "realistic-sha-r2",
        pdfPath: FIXTURE_PDF,
        scopeName: "framing",
        planIndex,
        useMockAi: true,
        stages: withInjectedEvidence(createFramingStages(), evidence),
        userDecisionRunInput: {
          userDecisions: [written.payload],
          reviewItemsById,
          inputArtifactIds: [written.artifactId],
          evidenceReplay: buildEvidenceReplayInput({
            extractedEvidenceArtifact: run1EvidenceArtifact,
            planIndex,
          }),
        },
      });
      assert.equal(run2.success, true, run2.errors.join("\n"));

      const run2EvidenceArtifact = extractedFramingEvidenceArtifactSchema.parse(
        JSON.parse(
          await readFile(
            run2.stageResults.find((s) => s.name === "extractedEvidence")!
              .artifactPath,
            "utf8",
          ),
        ),
      );
      assert.equal(
        run2EvidenceArtifact.producer.identifier,
        "extractedEvidence-replay",
      );
      assert.ok(
        run2EvidenceArtifact.inputArtifactIds.includes(run1EvidenceArtifact.artifactId),
      );
      assert.deepEqual(
        run2EvidenceArtifact.payload.evidence.map((record) => record.id),
        run1EvidenceArtifact.payload.evidence.map((record) => record.id),
      );

      const run2Sheathing = sheathingArtifactSchema.parse(
        JSON.parse(
          await readFile(
            run2.stageResults.find((s) => s.name === "sheathing")!.artifactPath,
            "utf8",
          ),
        ),
      ).payload;
      const area = run2Sheathing.areas.find((entry) => entry.id === SHEATHING_AREA);
      assert.equal(area?.areaSquareFeet, 1420);
      assert.equal(
        area?.resolutionTraces.find((trace) => trace.propertyPath === "areaSquareFeet")
          ?.method,
        "user-override",
      );
      assert.equal(
        run2Sheathing.systems.find((system) => system.id === area?.parentSystemId)
          ?.application,
        "wall",
      );

      const run2Calc = framingCalculationsArtifactSchema.parse(
        JSON.parse(
          await readFile(
            run2.stageResults.find((s) => s.name === "calculations")!.artifactPath,
            "utf8",
          ),
        ),
      ).payload;
      const sfLine = run2Calc.materials.find(
        (item) =>
          item.id ===
          createMaterialLineItemId(SHEATHING_QUANTITY_KEYS.area, SHEATHING_AREA),
      );
      assert.equal(sfLine?.quantity, 1420);
      assert.equal(sfLine?.unit, "square-foot");
      assert.match(sfLine?.description ?? "", /wall/i);
    } finally {
      await rm(run1Root, { recursive: true, force: true });
      await rm(run2Root, { recursive: true, force: true });
    }
  });

  it("Run-2 SF User Decision preserves areaSquareFeet but blocks material line without application", async () => {
    const evidence = buildRealisticResidentialInjectedEvidence().filter(
      (record) => record.propertyPath !== "application",
    );
    const run1Root = await mkdtemp(path.join(tmpdir(), "realistic-sha-noapp-r1-"));
    const run2Root = await mkdtemp(path.join(tmpdir(), "realistic-sha-noapp-r2-"));
    try {
      const planIndex = await indexPlan(FIXTURE_PDF);
      const run1 = await new PipelineRunner(new ArtifactStore(run1Root)).run({
        projectId: "realistic-sha-noapp-r1",
        pdfPath: FIXTURE_PDF,
        scopeName: "framing",
        planIndex,
        useMockAi: true,
        stages: withInjectedEvidence(createFramingStages(), evidence),
      });
      assert.equal(run1.success, true, run1.errors.join("\n"));

      const validation = validationArtifactSchema.parse(
        JSON.parse(
          await readFile(
            run1.stageResults.find((s) => s.name === "validation")!.artifactPath,
            "utf8",
          ),
        ),
      );
      const sheathingSfReview = validation.payload.reviewItems.find(
        (item) =>
          item.affectedObjects.some((object) => object.objectId === SHEATHING_AREA) &&
          item.action.targetProperty === "areaSquareFeet",
      );
      assert.ok(sheathingSfReview);

      const decision: UserDecision = {
        id: "UD-REALISTIC-SHEATHING-SF-NOAPP-001",
        reviewItemId: sheathingSfReview.id,
        result: {
          type: "value-provided",
          value: 1420,
          rationale: "Reviewer supplied SF without resolved application identity.",
        },
        supersedesUserDecisionId: null,
      };
      const written = createUserDecisionArtifact({
        projectId: "realistic-sha-noapp-r1",
        pipelineRunId: run1.pipelineRunId,
        validationArtifactId: validation.artifactId,
        decision,
        producerIdentifier: "realistic-injected-test",
      });
      const reviewItemsById = new Map(
        validation.payload.reviewItems.map((item) => [item.id, item]),
      );

      const run1EvidenceArtifact = extractedFramingEvidenceArtifactSchema.parse(
        JSON.parse(
          await readFile(
            run1.stageResults.find((s) => s.name === "extractedEvidence")!
              .artifactPath,
            "utf8",
          ),
        ),
      );

      const run2 = await new PipelineRunner(new ArtifactStore(run2Root)).run({
        projectId: "realistic-sha-noapp-r2",
        pdfPath: FIXTURE_PDF,
        scopeName: "framing",
        planIndex,
        useMockAi: true,
        stages: withInjectedEvidence(createFramingStages(), evidence),
        userDecisionRunInput: {
          userDecisions: [written.payload],
          reviewItemsById,
          inputArtifactIds: [written.artifactId],
          evidenceReplay: buildEvidenceReplayInput({
            extractedEvidenceArtifact: run1EvidenceArtifact,
            planIndex,
          }),
        },
      });
      assert.equal(run2.success, true, run2.errors.join("\n"));

      const run2Sheathing = sheathingArtifactSchema.parse(
        JSON.parse(
          await readFile(
            run2.stageResults.find((s) => s.name === "sheathing")!.artifactPath,
            "utf8",
          ),
        ),
      ).payload;
      const area = run2Sheathing.areas.find((entry) => entry.id === SHEATHING_AREA);
      assert.equal(area?.areaSquareFeet, 1420);
      assert.equal(
        run2Sheathing.systems.find((system) => system.id === area?.parentSystemId)
          ?.application,
        "unknown",
      );

      const run2Validation = validationArtifactSchema.parse(
        JSON.parse(
          await readFile(
            run2.stageResults.find((s) => s.name === "validation")!.artifactPath,
            "utf8",
          ),
        ),
      ).payload;
      const applicationIssue = run2Validation.validationIssues.find(
        (issue) =>
          issue.ruleId === "sheathing.system.application.resolved" &&
          issue.target.kind === "object" &&
          issue.target.objectId === area?.parentSystemId,
      );
      assert.ok(applicationIssue);
      assert.equal(
        applicationIssue.quantityImpacts.find(
          (impact) => impact.quantityKey === SHEATHING_QUANTITY_KEYS.area,
        )?.canCalculate,
        true,
      );
      assert.equal(
        applicationIssue.quantityImpacts.find(
          (impact) => impact.quantityKey === SHEATHING_QUANTITY_KEYS.material,
        )?.canCalculate,
        false,
      );

      const run2Calc = framingCalculationsArtifactSchema.parse(
        JSON.parse(
          await readFile(
            run2.stageResults.find((s) => s.name === "calculations")!.artifactPath,
            "utf8",
          ),
        ),
      ).payload;
      assert.equal(
        run2Calc.materials.find(
          (item) =>
            item.id ===
            createMaterialLineItemId(SHEATHING_QUANTITY_KEYS.area, SHEATHING_AREA),
        ),
        undefined,
      );
    } finally {
      await rm(run1Root, { recursive: true, force: true });
      await rm(run2Root, { recursive: true, force: true });
    }
  });
});
