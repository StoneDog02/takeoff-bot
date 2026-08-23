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
import {
  buildFloorFramingJoistCountEvidence,
  FLOOR_JOIST_COUNT_EXPECTED,
  FLOOR_JOIST_LINEAR_FEET_EXPECTED,
} from "../../src/scopes/framing/demo/floorFramingJoistCountEvidence.js";
import {
  extractedFramingEvidenceArtifactSchema,
  finalFramingTakeoffArtifactSchema,
  floorFramingArtifactSchema,
  framingCalculationsArtifactSchema,
  validationArtifactSchema,
} from "../../src/scopes/framing/schemas/framing-artifacts.schema.js";
import {
  createFramingStageArtifact,
  createFramingStages,
} from "../../src/scopes/framing/stages/createFramingStages.js";
import { FLOOR_FRAMING_RULE_IDS } from "../../src/scopes/framing/validators/rule-ids.js";
import { projectFramingReviewWorkspace } from "../../src/scopes/framing/review-workspace/projectFramingReviewWorkspace.js";
import { buildMultiObjectFramingEvidence } from "../fixtures/multiObjectFramingEvidence.js";
import {
  kingStudMaterialForOpening,
  sheathingMaterialForArea,
  studMaterialForSegment,
} from "../integration/liveFramingProofHelpers.js";
import { FLOOR_QUANTITY_KEYS } from "../../src/scopes/framing/validators/rule-ids.js";
import { createMaterialLineItemId } from "../../src/scopes/framing/calculators/ids.js";

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

function joistMaterialForArea(
  calculations: { materials: Array<{ id: string; quantity: number; unit: string }> },
  areaId: string,
) {
  return calculations.materials.find(
    (item) => item.id === createMaterialLineItemId(FLOOR_QUANTITY_KEYS.joists, areaId),
  );
}

function joistLfMaterialForArea(
  calculations: { materials: Array<{ id: string; quantity: number; unit: string }> },
  areaId: string,
) {
  return calculations.materials.find(
    (item) =>
      item.id ===
      createMaterialLineItemId(FLOOR_QUANTITY_KEYS.joistLinearFeet, areaId),
  );
}

describe("framing pipeline floor joist count + LF slice", () => {
  it("composes floor count+LF with unchanged wall/opening/sheathing quantities", async () => {
    const artifactRoot = await mkdtemp(
      path.join(tmpdir(), "takeoff-bot-pipeline-floor-"),
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
          ...buildFloorFramingJoistCountEvidence(),
        ]),
      });

      assert.equal(result.success, true);
      assert.equal(result.stageResults.length, 16);

      const floorStage = result.stageResults.find(
        (entry) => entry.name === "floorFraming",
      );
      assert.ok(floorStage?.artifactPath);
      const floorArtifact = floorFramingArtifactSchema.parse(
        JSON.parse(await readFile(floorStage.artifactPath, "utf8")),
      );
      assert.equal(floorArtifact.payload.systems.length, 2);
      assert.equal(floorArtifact.payload.areas.length, 2);
      assert.equal(
        floorArtifact.payload.areas.find((area) => area.id === "FFA-001")
          ?.joistMemberLengthFeet,
        12,
      );
      assert.equal(
        floorArtifact.payload.areas.find((area) => area.id === "FFA-002")
          ?.joistMemberLengthFeet,
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
        joistMaterialForArea(calculations, "FFA-001")?.quantity,
        FLOOR_JOIST_COUNT_EXPECTED["FFA-001"],
      );
      assert.equal(joistMaterialForArea(calculations, "FFA-001")?.unit, "each");
      assert.equal(
        joistLfMaterialForArea(calculations, "FFA-001")?.quantity,
        FLOOR_JOIST_LINEAR_FEET_EXPECTED["FFA-001"],
      );
      assert.equal(
        joistLfMaterialForArea(calculations, "FFA-001")?.unit,
        "linear-foot",
      );
      assert.equal(
        joistMaterialForArea(calculations, "FFA-002")?.quantity,
        FLOOR_JOIST_COUNT_EXPECTED["FFA-002"],
      );
      assert.equal(joistLfMaterialForArea(calculations, "FFA-002"), undefined);
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
      assert.equal(report.summary.floorFramingSystemCount, 2);
      assert.equal(report.summary.floorFramingAreaCount, 2);
      assert.equal(report.summary.sheathingAreaCount, 1);
      assert.deepEqual(report.floorFramingAreaIds.sort(), ["FFA-001", "FFA-002"]);

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
            issue.ruleId === FLOOR_FRAMING_RULE_IDS.joistMemberLengthResolved &&
            issue.target.objectId === "FFA-002",
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
        floorFraming: floorArtifact.payload,
      });
      const memberLengthReview = workspace.items.find(
        (item) =>
          item.objectId === "FFA-002" &&
          item.targetProperty === "joistMemberLengthFeet",
      );
      assert.ok(memberLengthReview);
      assert.equal(memberLengthReview.objectDomain, "floor-framing-area");
      assert.equal(
        memberLengthReview.currentState.resolvedPropertyValue,
        null,
      );
    } finally {
      await rm(artifactRoot, { recursive: true, force: true });
    }
  });

  it("reloads persisted floor framing artifacts without mutation", async () => {
    const artifactRoot = await mkdtemp(
      path.join(tmpdir(), "takeoff-bot-pipeline-floor-reload-"),
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
          buildFloorFramingJoistCountEvidence(),
        ),
      });

      assert.equal(result.success, true);
      const floorPath = result.stageResults.find(
        (entry) => entry.name === "floorFraming",
      )?.artifactPath;
      assert.ok(floorPath);
      const first = floorFramingArtifactSchema.parse(
        JSON.parse(await readFile(floorPath, "utf8")),
      );
      const second = floorFramingArtifactSchema.parse(
        JSON.parse(await readFile(floorPath, "utf8")),
      );
      assert.deepEqual(first, second);
      assert.equal(first.artifactType, "floor-framing");
      assert.equal(first.payload.areas[0]?.joistMemberLengthFeet, 12);
    } finally {
      await rm(artifactRoot, { recursive: true, force: true });
    }
  });
});
