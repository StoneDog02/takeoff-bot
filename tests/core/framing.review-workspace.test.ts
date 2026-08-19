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
import { indexPlan } from "../../src/plans/indexPlan.js";
import { createOpeningKingStudCountAssumptionId } from "../../src/scopes/framing/calculators/createOpeningKingStudCountAssumption.js";
import { createOpeningRoughSillSizeAssumptionId } from "../../src/scopes/framing/calculators/createOpeningRoughSillSizeAssumption.js";
import { createMaterialLineItemId } from "../../src/scopes/framing/calculators/ids.js";
import { projectFramingReviewWorkspace } from "../../src/scopes/framing/review-workspace/projectFramingReviewWorkspace.js";
import {
  extractedFramingEvidenceArtifactSchema,
  type OpeningsPayload,
  type StructuralMembersPayload,
  type ValidationPayload,
  type WallFramingPayload,
} from "../../src/scopes/framing/schemas/framing-artifacts.schema.js";
import {
  createFramingStageArtifact,
  createFramingStages,
} from "../../src/scopes/framing/stages/createFramingStages.js";
import {
  OPENING_QUANTITY_KEYS,
  OPENINGS_RULE_IDS,
  STRUCTURAL_MEMBER_QUANTITY_KEYS,
  STRUCTURAL_MEMBER_RULE_IDS,
} from "../../src/scopes/framing/validators/rule-ids.js";
import { buildCompleteMixedDomainEvidence } from "../fixtures/mixedDomainEvidence.js";
import { buildMultiObjectFramingEvidence } from "../fixtures/multiObjectFramingEvidence.js";

const WALL_FIXTURE_PDF = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/wall-w001-text-layer.pdf",
);
const TWO_WALL_FIXTURE_PDF = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/wall-w001-w002-text-layer.pdf",
);

type PipelineArtifacts = {
  validation: ValidationPayload;
  calculations: Awaited<ReturnType<typeof readCalculationsPayload>>;
  openings: OpeningsPayload;
  structuralMembers: StructuralMembersPayload;
  wallFraming?: WallFramingPayload;
};

async function readCalculationsPayload(stagePath: string) {
  const artifact = JSON.parse(await readFile(stagePath, "utf8"));
  return artifact.payload as {
    materials: Array<{
      id: string;
      description: string;
      quantity: number;
      unit: string;
      sourceObjectIds: string[];
      assumptionIds: string[];
      reviewItemIds: string[];
    }>;
    assumptions: Array<{
      id: string;
      reviewItemIds: string[];
      target: { objectId: string; propertyPath: string };
      assumedValue: string | number | boolean;
    }>;
  };
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
      5,
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
    pdfPath?: string;
    userDecisionRunInput?: UserDecisionRunInput;
  } = {},
) {
  const artifactRoot =
    options.artifactRoot ??
    (await mkdtemp(path.join(tmpdir(), "takeoff-bot-review-workspace-")));
  const pdfPath = options.pdfPath ?? WALL_FIXTURE_PDF;
  const planIndex = await indexPlan(pdfPath);
  const runner = new PipelineRunner(new ArtifactStore(artifactRoot));
  const result = await runner.run({
    projectId: "review-workspace-project",
    pdfPath,
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

async function loadPipelineArtifacts(
  result: Awaited<ReturnType<typeof runFramingPipeline>>["result"],
): Promise<PipelineArtifacts> {
  const validationArtifact = JSON.parse(
    await readFile(stageByName(result, "validation").artifactPath, "utf8"),
  );
  const openingsArtifact = JSON.parse(
    await readFile(stageByName(result, "openings").artifactPath, "utf8"),
  );
  const membersArtifact = JSON.parse(
    await readFile(stageByName(result, "structuralMembers").artifactPath, "utf8"),
  );
  const wallFramingArtifact = JSON.parse(
    await readFile(stageByName(result, "wallFraming").artifactPath, "utf8"),
  );

  return {
    validation: validationArtifact.payload,
    calculations: await readCalculationsPayload(
      stageByName(result, "calculations").artifactPath,
    ),
    openings: openingsArtifact.payload,
    structuralMembers: membersArtifact.payload,
    wallFraming: wallFramingArtifact.payload,
  };
}

function findItem(
  payload: ReturnType<typeof projectFramingReviewWorkspace>,
  objectId: string,
  targetProperty: string,
) {
  return payload.items.find(
    (item) =>
      item.objectId === objectId && item.targetProperty === targetProperty,
  );
}

describe("framing review workspace projection", () => {
  it("projects Run-1 multi-object review items deterministically", async () => {
    const stages = withInjectedEvidence(
      createFramingStages(),
      buildMultiObjectFramingEvidence(),
    );
    const { artifactRoot, result } = await runFramingPipeline(stages, {
      pdfPath: TWO_WALL_FIXTURE_PDF,
    });

    try {
      assert.equal(result.success, true);

      const artifacts = await loadPipelineArtifacts(result);
      const validationSnapshot = structuredClone(artifacts.validation);
      const calculationsSnapshot = structuredClone(artifacts.calculations);

      const workspace = projectFramingReviewWorkspace(artifacts);
      const workspaceRepeat = projectFramingReviewWorkspace(artifacts);

      assert.deepEqual(workspace, workspaceRepeat);
      assert.equal(workspace.summary.activeReviewItemCount, workspace.items.length);
      assert.ok(workspace.summary.activeReviewItemCount >= 4);

      const o001RoughSill = findItem(workspace, "O-001", "roughSillSize");
      const o002King = findItem(workspace, "O-002", "kingStudCount");
      const o003King = findItem(workspace, "O-003", "kingStudCount");
      const o002Rough = findItem(workspace, "O-002", "dimensions");

      assert.ok(o001RoughSill);
      assert.ok(o002King);
      assert.ok(o003King);
      assert.ok(o002Rough);

      assert.equal(findItem(workspace, "O-002", "roughSillSize"), undefined);

      assert.equal(o002King?.objectDomain, "opening");
      assert.equal(o002King?.currentState.resolvedPropertyValue, null);
      assert.equal(o002King?.currentState.calculationValueUsed, 2);
      assert.equal(o002King?.currentState.valueSource, "industry-default-assumption");
      assert.equal(o002King?.status.reviewStatus, "review-recommended");
      assert.equal(o002King?.status.blockingStatus, "not-blocked");
      assert.equal(o002King?.action.type, "provide-value");
      assert.equal(o002King?.calculationImpact.isCalculationBlocked, false);
      assert.ok(
        o002King?.provenance.assumptionIds.includes(
          createOpeningKingStudCountAssumptionId("O-002"),
        ),
      );
      assert.equal(o002King?.provenance.evidenceIds.length, 0);

      const kingMaterial = o002King?.calculationImpact.materialLines.find(
        (line) =>
          line.materialLineId ===
          createMaterialLineItemId(OPENING_QUANTITY_KEYS.kingStuds, "O-002"),
      );
      assert.ok(kingMaterial);
      assert.equal(kingMaterial.quantity, 2);
      assert.equal(kingMaterial.unit, "each");

      assert.ok(
        o001RoughSill?.provenance.assumptionIds.includes(
          createOpeningRoughSillSizeAssumptionId("O-001"),
        ),
      );
      assert.equal(o001RoughSill?.currentState.valueSource, "industry-default-assumption");

      const itemOrder = workspace.items.map((item) => ({
        objectId: item.objectId,
        targetProperty: item.targetProperty,
      }));
      assert.deepEqual(itemOrder, [...itemOrder].sort((left, right) => {
        const objectCompare = compareIds(left.objectId, right.objectId);
        if (objectCompare !== 0) {
          return objectCompare;
        }
        return compareIds(left.targetProperty ?? "", right.targetProperty ?? "");
      }));

      const artifactsAfterProjection = await loadPipelineArtifacts(result);
      assert.deepEqual(artifactsAfterProjection.validation, validationSnapshot);
      assert.deepEqual(artifactsAfterProjection.calculations, calculationsSnapshot);
    } finally {
      await rm(artifactRoot, { recursive: true, force: true });
    }
  });

  it("projects a blocking structural-member quantity review item", async () => {
    const stages = withInjectedEvidence(createFramingStages(), [
      ...buildCompleteMixedDomainEvidence({ includeQuantity: false }),
    ]);
    const { artifactRoot, result } = await runFramingPipeline(stages);

    try {
      assert.equal(result.success, true);

      const artifacts = await loadPipelineArtifacts(result);
      const workspace = projectFramingReviewWorkspace(artifacts);

      const quantityItem = workspace.items.find(
        (item) =>
          item.objectId === "SM-HDR-001" && item.targetProperty === "quantity",
      );
      assert.ok(quantityItem);

      assert.equal(quantityItem.status.reviewStatus, "review-required");
      assert.equal(quantityItem.status.blockingStatus, "blocked");
      assert.equal(quantityItem.currentState.resolvedPropertyValue, null);
      assert.equal(quantityItem.currentState.valueSource, "unresolved");
      assert.equal(quantityItem.calculationImpact.isCalculationBlocked, true);
      assert.equal(quantityItem.calculationImpact.materialLines.length, 0);
      assert.equal(quantityItem.action.type, "provide-value");
      assert.ok(
        quantityItem.calculationImpact.quantityImpacts.some(
          (impact) =>
            impact.quantityKey === STRUCTURAL_MEMBER_QUANTITY_KEYS.material &&
            impact.canCalculate === false,
        ),
      );
      assert.equal(workspace.summary.blockingReviewItemCount, 1);
    } finally {
      await rm(artifactRoot, { recursive: true, force: true });
    }
  });

  it("projects Run-2 user override into resolvedItems without polluting the active queue", async () => {
    const run1Stages = withInjectedEvidence(
      createFramingStages(),
      buildMultiObjectFramingEvidence(),
    );
    const run1Root = await mkdtemp(path.join(tmpdir(), "takeoff-bot-rw-run1-"));
    const run2Root = await mkdtemp(path.join(tmpdir(), "takeoff-bot-rw-run2-"));

    try {
      const run1 = await runFramingPipeline(run1Stages, {
        artifactRoot: run1Root,
        pdfPath: TWO_WALL_FIXTURE_PDF,
      });
      assert.equal(run1.result.success, true);

      const run1Artifacts = await loadPipelineArtifacts(run1.result);
      const run1Workspace = projectFramingReviewWorkspace(run1Artifacts);
      const kingReviewItem = run1Workspace.items.find(
        (item) =>
          item.objectId === "O-002" && item.targetProperty === "kingStudCount",
      );
      assert.ok(kingReviewItem);

      const decision: UserDecision = {
        id: "UD-O002-KING-001",
        reviewItemId: kingReviewItem.reviewItemId,
        result: {
          type: "value-provided",
          value: 3,
          rationale: "Reviewer confirmed 3 king studs per occurrence for O-002.",
        },
        supersedesUserDecisionId: null,
      };

      const reviewItemsById = new Map<ReviewItemId, ReviewItem>(
        run1Artifacts.validation.reviewItems.map((item) => [item.id, item]),
      );

      const run2 = await runFramingPipeline(run1Stages, {
        artifactRoot: run2Root,
        pdfPath: TWO_WALL_FIXTURE_PDF,
        userDecisionRunInput: {
          userDecisions: [decision],
          reviewItemsById,
          inputArtifactIds: ["ART-USER-DECISION-RW-TEST"],
        },
      });
      assert.equal(run2.result.success, true);

      const run2Artifacts = await loadPipelineArtifacts(run2.result);
      const run2Workspace = projectFramingReviewWorkspace({
        ...run2Artifacts,
        userDecisions: [decision],
        supplementalReviewItemsById: reviewItemsById,
      });

      assert.equal(findItem(run2Workspace, "O-002", "kingStudCount"), undefined);
      assert.equal(run2Workspace.summary.resolvedByUserDecisionCount, 1);

      const resolved = run2Workspace.resolvedItems.find(
        (item) => item.objectId === "O-002" && item.targetProperty === "kingStudCount",
      );
      assert.ok(resolved);
      assert.equal(resolved.userDecisionId, "UD-O002-KING-001");
      assert.equal(resolved.resolvedPropertyValue, 3);
      assert.equal(resolved.calculationValueUsed, 3);
      assert.equal(resolved.valueSource, "user-override");
      assert.deepEqual(resolved.provenance.userDecisionIds, ["UD-O002-KING-001"]);
      assert.equal(resolved.provenance.assumptionIds.length, 0);

      const kingMaterial = resolved.calculationImpact.materialLines.find(
        (line) =>
          line.materialLineId ===
          createMaterialLineItemId(OPENING_QUANTITY_KEYS.kingStuds, "O-002"),
      );
      assert.ok(kingMaterial);
      assert.equal(kingMaterial.quantity, 3);

      assert.ok(
        !run2Artifacts.calculations.assumptions.some(
          (assumption) =>
            assumption.id === createOpeningKingStudCountAssumptionId("O-002"),
        ),
      );

      const o003King = findItem(run2Workspace, "O-003", "kingStudCount");
      assert.ok(o003King);
      assert.equal(o003King.currentState.calculationValueUsed, 2);
    } finally {
      await rm(run1Root, { recursive: true, force: true });
      await rm(run2Root, { recursive: true, force: true });
    }
  });
});

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
