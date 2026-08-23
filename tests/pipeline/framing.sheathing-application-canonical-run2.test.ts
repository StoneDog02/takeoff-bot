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
  createSheathingAreaObjectId,
  createWallObjectId,
  createWallSegmentObjectId,
} from "../../src/scopes/framing/resolvers/ids.js";
import {
  extractedFramingEvidenceArtifactSchema,
  framingCalculationsArtifactSchema,
  sheathingArtifactSchema,
  validationArtifactSchema,
} from "../../src/scopes/framing/schemas/framing-artifacts.schema.js";
import { buildEvidenceReplayInput } from "../../src/scopes/framing/stages/buildEvidenceReplayInput.js";
import {
  createFramingStageArtifact,
  createFramingStages,
} from "../../src/scopes/framing/stages/createFramingStages.js";
import {
  SHEATHING_QUANTITY_KEYS,
  WALL_QUANTITY_KEYS,
} from "../../src/scopes/framing/validators/rule-ids.js";
import { createUserDecisionArtifact } from "../../src/ui/createUserDecisionArtifact.js";
import { buildRealisticResidentialInjectedEvidence } from "../fixtures/realisticResidentialInjectedEvidence.js";
import { classifyExpectedFact } from "../helpers/extractionQuality.js";
import { materialLineItemId } from "../integration/liveFramingProofHelpers.js";

const FIXTURE_PDF = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/realistic-residential-framing-plan-text-layer.pdf",
);

const SHEATHING_AREA = createSheathingAreaObjectId("WALL SH A");
const WALL_SEGMENT = createWallSegmentObjectId(createWallObjectId("W1"));

function replaceStage(
  stages: PipelineStage[],
  name: string,
  run: PipelineStage["run"],
): PipelineStage[] {
  return stages.map((stage) => (stage.name === name ? { ...stage, run } : stage));
}

function withEvidence(
  stages: PipelineStage[],
  evidence: Evidence[],
): PipelineStage[] {
  const original = stages.find((stage) => stage.name === "extractedEvidence");
  assert.ok(original);

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
      { type: "system", identifier: "milestone-h-fixture" },
    );
  });
}

describe("Milestone H — EXTERIOR WALLS → wall → SF completion", () => {
  it("resolves verbatim EXTERIOR WALLS Evidence to application=wall and emits 1420 SF on Run-2 replay", async () => {
    const evidence = buildRealisticResidentialInjectedEvidence().map((record) => {
      if (
        record.subjectKind === "sheathing-system" &&
        record.propertyPath === "application"
      ) {
        return {
          ...record,
          candidateValue: "EXTERIOR WALLS",
          originalText: "WALL SH SYS  EXTERIOR WALLS  LEVEL 2",
        };
      }
      return record;
    });

    assert.equal(
      classifyExpectedFact(evidence, {
        id: "sheathing-sys-application",
        domain: "sheathing",
        subjectKey: "WALL SH SYS",
        propertyPath: "application",
        expectedValue: "wall",
        sourceHint: "EXTERIOR WALLS",
      }).classification,
      "CORRECT",
    );

    const stages = withEvidence(createFramingStages(), evidence);
    const run1Root = await mkdtemp(path.join(tmpdir(), "h-sha-r1-"));
    const run2Root = await mkdtemp(path.join(tmpdir(), "h-sha-r2-"));
    try {
      const planIndex = await indexPlan(FIXTURE_PDF);
      const run1 = await new PipelineRunner(new ArtifactStore(run1Root)).run({
        projectId: "h-sha-r1",
        pdfPath: FIXTURE_PDF,
        scopeName: "framing",
        planIndex,
        useMockAi: true,
        stages,
      });
      assert.equal(run1.success, true, run1.errors.join("\n"));

      const run1Evidence = extractedFramingEvidenceArtifactSchema.parse(
        JSON.parse(
          await readFile(
            run1.stageResults.find((s) => s.name === "extractedEvidence")!
              .artifactPath,
            "utf8",
          ),
        ),
      );
      const appEvidence = run1Evidence.payload.evidence.find(
        (record) =>
          record.subjectKind === "sheathing-system" &&
          record.propertyPath === "application",
      );
      assert.equal(appEvidence?.candidateValue, "EXTERIOR WALLS");

      const run1Sheathing = sheathingArtifactSchema.parse(
        JSON.parse(
          await readFile(
            run1.stageResults.find((s) => s.name === "sheathing")!.artifactPath,
            "utf8",
          ),
        ),
      ).payload;
      const system = run1Sheathing.systems.find(
        (entry) => entry.id === "SHS-WALL-SH-SYS",
      );
      assert.equal(system?.application, "wall");
      assert.equal(
        system?.resolutionTraces.find((trace) => trace.propertyPath === "application")
          ?.method,
        "explicit-project-value",
      );
      assert.ok(
        system?.resolutionTraces
          .find((trace) => trace.propertyPath === "application")
          ?.evidenceIds.includes(appEvidence!.id),
      );
      assert.equal(
        run1Sheathing.areas.find((area) => area.id === SHEATHING_AREA)?.areaSquareFeet,
        null,
      );

      const run1Calc = framingCalculationsArtifactSchema.parse(
        JSON.parse(
          await readFile(
            run1.stageResults.find((s) => s.name === "calculations")!.artifactPath,
            "utf8",
          ),
        ),
      ).payload;
      const run1Studs = run1Calc.materials.find(
        (item) =>
          item.id === materialLineItemId(WALL_QUANTITY_KEYS.studs, WALL_SEGMENT),
      )?.quantity;

      const validation = validationArtifactSchema.parse(
        JSON.parse(
          await readFile(
            run1.stageResults.find((s) => s.name === "validation")!.artifactPath,
            "utf8",
          ),
        ),
      );
      const sfReview = validation.payload.reviewItems.find(
        (item) =>
          item.affectedObjects.some((object) => object.objectId === SHEATHING_AREA) &&
          item.action.targetProperty === "areaSquareFeet",
      );
      assert.ok(sfReview);

      const decision: UserDecision = {
        id: "UD-H-SHEATHING-SF-001",
        reviewItemId: sfReview.id,
        result: {
          type: "value-provided",
          value: 1420,
          rationale: "Milestone H SF completion after application canonicalization.",
        },
        supersedesUserDecisionId: null,
      };
      const written = createUserDecisionArtifact({
        projectId: "h-sha-r1",
        pipelineRunId: run1.pipelineRunId,
        validationArtifactId: validation.artifactId,
        decision,
      });

      const run2 = await new PipelineRunner(new ArtifactStore(run2Root)).run({
        projectId: "h-sha-r2",
        pdfPath: FIXTURE_PDF,
        scopeName: "framing",
        planIndex,
        useMockAi: true,
        stages,
        userDecisionRunInput: {
          userDecisions: [written.payload],
          reviewItemsById: new Map(
            validation.payload.reviewItems.map((item) => [item.id, item]),
          ),
          inputArtifactIds: [written.artifactId],
          evidenceReplay: buildEvidenceReplayInput({
            extractedEvidenceArtifact: run1Evidence,
            planIndex,
          }),
        },
      });
      assert.equal(run2.success, true, run2.errors.join("\n"));

      const run2Evidence = extractedFramingEvidenceArtifactSchema.parse(
        JSON.parse(
          await readFile(
            run2.stageResults.find((s) => s.name === "extractedEvidence")!
              .artifactPath,
            "utf8",
          ),
        ),
      );
      assert.equal(run2Evidence.producer.identifier, "extractedEvidence-replay");
      assert.equal(
        run2Evidence.payload.evidence.find(
          (record) => record.propertyPath === "application",
        )?.candidateValue,
        "EXTERIOR WALLS",
      );

      const run2Sheathing = sheathingArtifactSchema.parse(
        JSON.parse(
          await readFile(
            run2.stageResults.find((s) => s.name === "sheathing")!.artifactPath,
            "utf8",
          ),
        ),
      ).payload;
      assert.equal(
        run2Sheathing.systems.find((entry) => entry.id === "SHS-WALL-SH-SYS")
          ?.application,
        "wall",
      );
      assert.equal(
        run2Sheathing.areas.find((area) => area.id === SHEATHING_AREA)
          ?.areaSquareFeet,
        1420,
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
        )?.quantity,
        1420,
      );
      assert.equal(
        run2Calc.materials.find(
          (item) =>
            item.id === materialLineItemId(WALL_QUANTITY_KEYS.studs, WALL_SEGMENT),
        )?.quantity,
        run1Studs,
      );
    } finally {
      await rm(run1Root, { recursive: true, force: true });
      await rm(run2Root, { recursive: true, force: true });
    }
  });
});
