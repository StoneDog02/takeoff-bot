import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { ArtifactStore } from "../../src/core/artifacts/ArtifactStore.js";
import { PipelineRunner } from "../../src/core/pipeline/PipelineRunner.js";
import type { Evidence } from "../../src/core/schemas/evidence.schema.js";
import type { PipelineStage } from "../../src/core/pipeline/types.js";
import { indexPlan } from "../../src/plans/indexPlan.js";
import { createMaterialLineItemId } from "../../src/scopes/framing/calculators/ids.js";
import {
  buildRoofFramingCommonRafterEvidence,
  ROOF_COMMON_RAFTER_COUNT_EXPECTED,
} from "../../src/scopes/framing/demo/roofFramingCommonRafterEvidence.js";
import { projectFramingReviewWorkspace } from "../../src/scopes/framing/review-workspace/projectFramingReviewWorkspace.js";
import {
  extractedFramingEvidenceArtifactSchema,
  finalFramingTakeoffArtifactSchema,
  framingCalculationsArtifactSchema,
  roofFramingArtifactSchema,
  validationArtifactSchema,
} from "../../src/scopes/framing/schemas/framing-artifacts.schema.js";
import {
  createFramingStageArtifact,
  createFramingStages,
} from "../../src/scopes/framing/stages/createFramingStages.js";
import {
  ROOF_FRAMING_RULE_IDS,
  ROOF_QUANTITY_KEYS,
} from "../../src/scopes/framing/validators/rule-ids.js";
import { buildMultiObjectFramingEvidence } from "../fixtures/multiObjectFramingEvidence.js";
import {
  kingStudMaterialForOpening,
  sheathingMaterialForArea,
  studMaterialForSegment,
} from "../integration/liveFramingProofHelpers.js";

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

function commonRafterMaterialForPlane(
  calculations: { materials: Array<{ id: string; quantity: number; unit: string }> },
  planeId: string,
) {
  return calculations.materials.find(
    (item) =>
      item.id ===
      createMaterialLineItemId(ROOF_QUANTITY_KEYS.commonRafters, planeId),
  );
}

describe("framing pipeline roof common-rafter count slice", () => {
  it("composes roof common-rafter count with unchanged wall/opening/sheathing quantities", async () => {
    const artifactRoot = await mkdtemp(
      path.join(tmpdir(), "takeoff-bot-pipeline-roof-"),
    );

    try {
      const planIndex = await indexPlan(FIXTURE_PDF);
      const runner = new PipelineRunner(new ArtifactStore(artifactRoot));
      const result = await runner.run({
        projectId: "test-project",
        pdfPath: FIXTURE_PDF,
        scopeName: "framing",
        planIndex,
        useMockAi: true,
        stages: withInjectedEvidence(createFramingStages(), [
          ...buildMultiObjectFramingEvidence(),
          ...buildRoofFramingCommonRafterEvidence(),
        ]),
      });

      assert.equal(result.success, true);
      assert.equal(result.stageResults.length, 16);

      const roofStage = result.stageResults.find(
        (entry) => entry.name === "roofFraming",
      );
      assert.ok(roofStage?.artifactPath);
      const roofArtifact = roofFramingArtifactSchema.parse(
        JSON.parse(await readFile(roofStage.artifactPath, "utf8")),
      );
      assert.equal(roofArtifact.payload.systems.length, 2);
      assert.equal(roofArtifact.payload.planes.length, 2);
      assert.equal(
        roofArtifact.payload.planes.find((plane) => plane.id === "RFP-001")
          ?.rafterLayoutLengthFeet,
        20,
      );
      assert.equal(
        roofArtifact.payload.planes.find((plane) => plane.id === "RFP-002")
          ?.rafterLayoutLengthFeet,
        null,
      );

      const calculations = framingCalculationsArtifactSchema.parse(
        JSON.parse(
          await readFile(
            result.stageResults.find((entry) => entry.name === "calculations")!
              .artifactPath!,
            "utf8",
          ),
        ),
      ).payload;

      assert.equal(
        commonRafterMaterialForPlane(calculations, "RFP-001")?.quantity,
        ROOF_COMMON_RAFTER_COUNT_EXPECTED["RFP-001"],
      );
      assert.equal(
        commonRafterMaterialForPlane(calculations, "RFP-001")?.unit,
        "each",
      );
      assert.equal(
        commonRafterMaterialForPlane(calculations, "RFP-002"),
        undefined,
      );
      assert.equal(studMaterialForSegment(calculations, "WS-001")?.quantity, 16);
      assert.equal(kingStudMaterialForOpening(calculations, "O-001")?.quantity, 3);
      assert.equal(sheathingMaterialForArea(calculations, "SHA-001")?.quantity, 160);

      const report = finalFramingTakeoffArtifactSchema.parse(
        JSON.parse(
          await readFile(
            result.stageResults.find((entry) => entry.name === "report")!
              .artifactPath!,
            "utf8",
          ),
        ),
      ).payload;
      assert.equal(report.summary.roofFramingSystemCount, 2);
      assert.equal(report.summary.roofPlaneCount, 2);
      assert.equal(report.summary.sheathingAreaCount, 1);
      assert.deepEqual(report.roofPlaneIds.sort(), ["RFP-001", "RFP-002"]);

      const validation = validationArtifactSchema.parse(
        JSON.parse(
          await readFile(
            result.stageResults.find((entry) => entry.name === "validation")!
              .artifactPath!,
            "utf8",
          ),
        ),
      ).payload;
      assert.ok(
        validation.validationIssues.some(
          (issue) =>
            issue.ruleId === ROOF_FRAMING_RULE_IDS.rafterLayoutLengthResolved &&
            issue.target.objectId === "RFP-002",
        ),
      );

      const openings = JSON.parse(
        await readFile(
          result.stageResults.find((entry) => entry.name === "openings")!
            .artifactPath!,
          "utf8",
        ),
      ).payload;
      const members = JSON.parse(
        await readFile(
          result.stageResults.find((entry) => entry.name === "structuralMembers")!
            .artifactPath!,
          "utf8",
        ),
      ).payload;
      const walls = JSON.parse(
        await readFile(
          result.stageResults.find((entry) => entry.name === "wallFraming")!
            .artifactPath!,
          "utf8",
        ),
      ).payload;
      const workspace = projectFramingReviewWorkspace({
        validation,
        calculations,
        openings,
        structuralMembers: members,
        wallFraming: walls,
        roofFraming: roofArtifact.payload,
      });
      const layoutLengthReview = workspace.items.find(
        (item) =>
          item.objectId === "RFP-002" &&
          item.targetProperty === "rafterLayoutLengthFeet",
      );
      assert.ok(layoutLengthReview);
      assert.equal(layoutLengthReview.objectDomain, "roof-plane");
      assert.equal(
        layoutLengthReview.currentState.resolvedPropertyValue,
        null,
      );
    } finally {
      await rm(artifactRoot, { recursive: true, force: true });
    }
  });

  it("reloads persisted roof framing artifacts without mutation", async () => {
    const artifactRoot = await mkdtemp(
      path.join(tmpdir(), "takeoff-bot-pipeline-roof-reload-"),
    );

    try {
      const planIndex = await indexPlan(FIXTURE_PDF);
      const runner = new PipelineRunner(new ArtifactStore(artifactRoot));
      const result = await runner.run({
        projectId: "test-project",
        pdfPath: FIXTURE_PDF,
        scopeName: "framing",
        planIndex,
        useMockAi: true,
        stages: withInjectedEvidence(
          createFramingStages(),
          buildRoofFramingCommonRafterEvidence(),
        ),
      });

      assert.equal(result.success, true);
      const roofPath = result.stageResults.find(
        (entry) => entry.name === "roofFraming",
      )?.artifactPath;
      assert.ok(roofPath);
      const first = roofFramingArtifactSchema.parse(
        JSON.parse(await readFile(roofPath, "utf8")),
      );
      const second = roofFramingArtifactSchema.parse(
        JSON.parse(await readFile(roofPath, "utf8")),
      );
      assert.deepEqual(first, second);
      assert.equal(first.artifactType, "roof-framing");
      assert.equal(first.payload.planes[0]?.rafterLayoutLengthFeet, 20);
    } finally {
      await rm(artifactRoot, { recursive: true, force: true });
    }
  });
});
