import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { ArtifactStore } from "../../src/core/artifacts/ArtifactStore.js";
import { PipelineRunner } from "../../src/core/pipeline/PipelineRunner.js";
import type { PipelineStage } from "../../src/core/pipeline/types.js";
import type { UserDecision } from "../../src/core/schemas/user-decision.schema.js";
import { isAnthropicConfigured } from "../../src/config/env.js";
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
  pageClassificationArtifactSchema,
  planReadingOrderArtifactSchema,
  roofFramingArtifactSchema,
  sheathingArtifactSchema,
  userDecisionArtifactSchema,
  validationArtifactSchema,
} from "../../src/scopes/framing/schemas/framing-artifacts.schema.js";
import { buildEvidenceReplayInput } from "../../src/scopes/framing/stages/buildEvidenceReplayInput.js";
import { createFramingStages } from "../../src/scopes/framing/stages/createFramingStages.js";
import {
  FLOOR_QUANTITY_KEYS,
  OPENING_QUANTITY_KEYS,
  ROOF_QUANTITY_KEYS,
  SHEATHING_QUANTITY_KEYS,
  STRUCTURAL_MEMBER_QUANTITY_KEYS,
  WALL_QUANTITY_KEYS,
} from "../../src/scopes/framing/validators/rule-ids.js";
import { createUserDecisionArtifact } from "../../src/ui/createUserDecisionArtifact.js";
import {
  REALISTIC_PLAN_EXPECTED_FACTS,
  REALISTIC_PLAN_FORBIDDEN_INVENTIONS,
  REALISTIC_RESIDENTIAL_FRAMING_PLAN_TEXT,
} from "../fixtures/realisticResidentialFramingPlan.js";
import {
  findForbiddenInventions,
  scoreExpectedFacts,
  summarizeFactScores,
} from "../helpers/extractionQuality.js";
import {
  assertNoEnginePropertyCoaching,
  assertRequiredMarkers,
  REALISTIC_STYLE_A_REQUIRED_MARKERS,
} from "../helpers/planTextNormalize.js";
import {
  isGroundedInPageText,
  materialLineItemId,
  snapshotLiveFramingPipeline,
  type LiveFramingPipelineSnapshot,
} from "./liveFramingProofHelpers.js";

const RUN_LIVE = process.env.TAKEOFF_LIVE_CLAUDE === "1";
const FIXTURE = path.resolve(
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

const CRITICAL_FACT_IDS = new Set([
  "wall-w1-stud-size",
  "wall-w1-spacing",
  "wall-w1-length",
  "wall-w1-height",
  "wall-w1-type",
  "wall-w1-plates",
  "opening-w3-jacks",
  "opening-w3-header",
  "opening-w3-wall",
  "opening-w3-qty",
  "opening-w3-nominal-w",
  "opening-w3-nominal-h",
  "opening-w3-rough-w",
  "sm-h2-category",
  "sm-h2-material",
  "sm-h2-size",
  "sm-h2-length",
  "sm-h2-qty",
  "sm-h2-opening",
  "floor-sys-joist-type",
  "floor-sys-size",
  "floor-sys-spacing",
  "floor-bay-layout",
  "floor-bay-member",
  "floor-bay-span",
  "roof-sys-type",
  "roof-sys-size",
  "roof-sys-spacing",
  "roof-gable-layout",
  "roof-gable-span",
  "sheathing-sys-application",
  "sheathing-sys-panel",
  "sheathing-sys-thick",
]);

function replaceStage(
  stages: PipelineStage[],
  name: string,
  run: PipelineStage["run"],
): PipelineStage[] {
  return stages.map((stage) => (stage.name === name ? { ...stage, run } : stage));
}

/**
 * Counts Stage-5 extraction invocations (Claude path). Evidence replay does not
 * increment the counter — that is the Milestone G invariant under test.
 */
function withExtractionCallCounter(
  stages: PipelineStage[],
  extractionCallCount: { value: number },
): PipelineStage[] {
  const production = stages.find((stage) => stage.name === "extractedEvidence");
  assert.ok(production, "Expected extractedEvidence stage");

  return replaceStage(stages, "extractedEvidence", async (context) => {
    if (!context.userDecisionRunInput?.evidenceReplay) {
      extractionCallCount.value += 1;
    }
    return production.run(context);
  });
}

async function runLiveRealisticPipeline(
  pdfPath: string,
  projectId: string,
  artifactRoot: string,
  options: {
    userDecisionRunInput?: Parameters<PipelineRunner["run"]>[0]["userDecisionRunInput"];
    stages?: PipelineStage[];
  } = {},
) {
  const planIndex = await indexPlan(pdfPath);
  const pageText = planIndex.pages.map((page) => page.textContent).join("\n");
  const runner = new PipelineRunner(new ArtifactStore(artifactRoot));
  const result = await runner.run({
    projectId,
    pdfPath,
    scopeName: "framing",
    planIndex,
    useMockAi: false,
    stages: options.stages ?? createFramingStages(),
    userDecisionRunInput: options.userDecisionRunInput,
  });

  assert.equal(result.success, true, result.errors.join("\n"));
  assert.equal(result.errors.length, 0);
  assert.equal(result.stageResults.length, 15);

  const snapshot = await snapshotLiveFramingPipeline(pageText, result);
  return { planIndex, snapshot, result };
}

function reviewForObjectProperty(
  snapshot: LiveFramingPipelineSnapshot,
  objectId: string,
  targetProperty: string,
) {
  return snapshot.validation.reviewItems.find(
    (item) =>
      item.affectedObjects.some((object) => object.objectId === objectId) &&
      item.action.targetProperty === targetProperty,
  );
}

describe(
  "live Claude realistic synthetic framing plan extraction",
  { skip: !RUN_LIVE },
  () => {
    it(
      "extracts authorized facts from schedule/callout language without coaching labels",
      { timeout: 480_000 },
      async () => {
        assert.equal(
          isAnthropicConfigured(),
          true,
          "TAKEOFF_LIVE_CLAUDE=1 requires ANTHROPIC_API_KEY.",
        );

        const run1Root = await mkdtemp(
          path.join(tmpdir(), "takeoff-bot-live-realistic-r1-"),
        );
        const run2Root = await mkdtemp(
          path.join(tmpdir(), "takeoff-bot-live-realistic-r2-"),
        );
        const extractionCallCount = { value: 0 };
        const stages = withExtractionCallCounter(
          createFramingStages(),
          extractionCallCount,
        );
        let retainArtifactsForDiagnosis = true;

        try {
          const { planIndex, snapshot, result } = await runLiveRealisticPipeline(
            FIXTURE,
            "live-proof-realistic-residential",
            run1Root,
            { stages },
          );
          assert.equal(
            extractionCallCount.value,
            1,
            "Run 1 must invoke Claude extraction exactly once",
          );

          assertRequiredMarkers(
            snapshot.pageText,
            REALISTIC_STYLE_A_REQUIRED_MARKERS,
            "live Style A indexed text",
          );
          assertNoEnginePropertyCoaching(snapshot.pageText);
          assertNoEnginePropertyCoaching(REALISTIC_RESIDENTIAL_FRAMING_PLAN_TEXT);

          const pageClassification = pageClassificationArtifactSchema.parse(
            JSON.parse(
              await readFile(
                snapshot.stageResults.find((s) => s.name === "pageClassification")!
                  .artifactPath,
                "utf8",
              ),
            ),
          );
          const readingOrder = planReadingOrderArtifactSchema.parse(
            JSON.parse(
              await readFile(
                snapshot.stageResults.find((s) => s.name === "planReadingOrder")!
                  .artifactPath,
                "utf8",
              ),
            ),
          );

          const relevantPages = pageClassification.payload.pages.filter(
            (page) => page.relevantToFraming,
          );
          assert.equal(relevantPages.length, 4);
          assert.deepEqual(
            [...readingOrder.payload.orderedPageNumbers].sort((a, b) => a - b),
            [1, 2, 3, 4],
          );
          assert.equal(planIndex.pages.length, 4);

          const evidencePages = new Set(
            snapshot.evidence.map((record) => record.source.page.pageNumber),
          );
          assert.ok(
            evidencePages.has(1) && evidencePages.has(2) && evidencePages.has(3),
            `Expected cross-page Evidence from pages 1–3; got ${[...evidencePages].join(",")}`,
          );

          for (const record of snapshot.evidence) {
            assert.ok(
              isGroundedInPageText(record.originalText, snapshot.pageText),
              `Ungrounded Evidence ${record.id}: ${record.originalText}`,
            );
          }

          const scores = scoreExpectedFacts(
            snapshot.evidence,
            REALISTIC_PLAN_EXPECTED_FACTS,
          );
          const summary = summarizeFactScores(scores);
          const criticalFailures = scores.filter(
            (score) =>
              CRITICAL_FACT_IDS.has(score.factId) &&
              score.classification !== "CORRECT" &&
              score.classification !== "CONFLICTED",
          );

          assert.equal(
            criticalFailures.length,
            0,
            `Critical extraction failures:\n${criticalFailures
              .map((score) => `${score.factId}: ${score.classification} ${score.detail ?? ""}`)
              .join("\n")}\nSummary: ${JSON.stringify(summary)}`,
          );
          console.info(
            "[realistic-extraction] Run-1 fact summary:",
            JSON.stringify(summary),
            "evidence count:",
            snapshot.evidence.length,
            "extractionCalls:",
            extractionCallCount.value,
          );

          const inventions = findForbiddenInventions(
            snapshot.evidence,
            REALISTIC_PLAN_FORBIDDEN_INVENTIONS,
          );
          assert.equal(
            inventions.length,
            0,
            `Invented facts:\n${inventions.map((hit) => hit.detail).join("\n")}`,
          );

          assert.equal(
            snapshot.evidence.filter(
              (record) =>
                record.subjectKey.toUpperCase().includes("D04") &&
                record.propertyPath === "jackStudCount",
            ).length,
            0,
          );
          assert.equal(
            snapshot.evidence.filter(
              (record) =>
                record.propertyPath === "areaSquareFeet" &&
                (record.subjectKind === "sheathing-area" ||
                  record.subjectKey.toUpperCase().includes("SH")),
            ).length,
            0,
          );

          const wall = snapshot.wallFraming.walls.find((entry) => entry.id === WALL_ID);
          assert.ok(wall, `Expected wall ${WALL_ID}`);
          assert.equal(wall.assembly.studSize, "2x6");
          assert.equal(wall.assembly.studSpacingInches, 16);
          assert.equal(wall.assembly.heightFeet, 9);
          assert.match(String(wall.wallType ?? ""), /wood/i);

          const segment = snapshot.wallFraming.segments.find(
            (entry) => entry.id === SEGMENT_ID,
          );
          assert.ok(segment);
          assert.equal(segment.lengthFeet, 24);

          const studLine = snapshot.calculations.materials.find(
            (item) =>
              item.id === materialLineItemId(WALL_QUANTITY_KEYS.studs, SEGMENT_ID),
          );
          assert.equal(studLine?.quantity, 19);
          assert.equal(studLine?.unit, "each");

          const plateLine = snapshot.calculations.materials.find(
            (item) =>
              item.id === materialLineItemId(WALL_QUANTITY_KEYS.plates, SEGMENT_ID),
          );
          assert.ok(plateLine);
          assert.equal(plateLine.unit, "linear-foot");

          const openingW3 = snapshot.openings.openings.find(
            (entry) => entry.id === OPENING_W3,
          );
          assert.ok(openingW3);
          assert.equal(openingW3.parentWallId, WALL_ID);
          assert.equal(openingW3.headerMemberId, HEADER_H2);
          assert.equal(openingW3.quantity, 1);
          assert.equal(openingW3.jackStudCount, 2);

          const openingD04 = snapshot.openings.openings.find(
            (entry) => entry.id === OPENING_D04,
          );
          assert.ok(openingD04);
          assert.equal(openingD04.jackStudCount, null);

          const jackLine = snapshot.calculations.materials.find(
            (item) =>
              item.id ===
              materialLineItemId(OPENING_QUANTITY_KEYS.jackStuds, OPENING_W3),
          );
          assert.ok(
            jackLine,
            `Expected jack stud material for ${OPENING_W3}; opening.quantity=${String(openingW3.quantity)} jackStudCount=${String(openingW3.jackStudCount)} wallType=${String(wall.wallType)} height=${String(wall.assembly.heightFeet)}`,
          );
          assert.equal(jackLine.quantity, 2);

          const headerH2 = snapshot.structuralMembers.structuralMembers.find(
            (entry) => entry.id === HEADER_H2,
          );
          assert.ok(headerH2);
          assert.equal(headerH2.category, "header");
          assert.equal(headerH2.lengthFeet, 6);
          assert.ok(headerH2.supportedObjectIds.includes(OPENING_W3));

          const headerLf = snapshot.calculations.materials.find(
            (item) =>
              item.id ===
              createMaterialLineItemId(
                STRUCTURAL_MEMBER_QUANTITY_KEYS.material,
                HEADER_H2,
              ),
          );
          assert.equal(headerLf?.quantity, 6);

          const beamB1 = snapshot.structuralMembers.structuralMembers.find(
            (entry) => entry.id === BEAM_B1,
          );
          assert.ok(beamB1, "Expected special beam B1 alongside floor population");
          assert.equal(beamB1.category, "beam");
          assert.equal(beamB1.lengthFeet, 16);
          // Double-count posture: tagged SM must coexist as its own object.
          // Material LF requires full SM identity (materialType/size/quantity);
          // if Claude omits one, review owns completion — do not invent it.
          const beamLf = snapshot.calculations.materials.find(
            (item) =>
              item.id ===
              createMaterialLineItemId(
                STRUCTURAL_MEMBER_QUANTITY_KEYS.material,
                BEAM_B1,
              ),
          );
          if (
            beamB1.materialType !== null &&
            beamB1.size !== null &&
            beamB1.quantity !== null
          ) {
            assert.equal(beamLf?.quantity, 16);
          } else {
            console.info(
              "[realistic-extraction] B1 present without full material identity:",
              {
                materialType: beamB1.materialType,
                size: beamB1.size,
                quantity: beamB1.quantity,
              },
            );
          }

          const floorPayload = floorFramingArtifactSchema.parse(
            JSON.parse(
              await readFile(
                snapshot.stageResults.find((s) => s.name === "floorFraming")!
                  .artifactPath,
                "utf8",
              ),
            ),
          ).payload;
          const bay = floorPayload.areas.find((area) => area.id === FLOOR_AREA);
          assert.ok(bay);
          assert.equal(bay.joistLayoutLengthFeet, 20);
          assert.equal(bay.joistMemberLengthFeet, 12);

          assert.equal(
            snapshot.calculations.materials.find(
              (item) =>
                item.id ===
                materialLineItemId(FLOOR_QUANTITY_KEYS.joists, FLOOR_AREA),
            )?.quantity,
            16,
          );
          assert.equal(
            snapshot.calculations.materials.find(
              (item) =>
                item.id ===
                materialLineItemId(FLOOR_QUANTITY_KEYS.joistLinearFeet, FLOOR_AREA),
            )?.quantity,
            192,
          );

          const roofPayload = roofFramingArtifactSchema.parse(
            JSON.parse(
              await readFile(
                snapshot.stageResults.find((s) => s.name === "roofFraming")!
                  .artifactPath,
                "utf8",
              ),
            ),
          ).payload;
          const gable = roofPayload.planes.find((plane) => plane.id === ROOF_PLANE);
          assert.ok(gable);
          assert.equal(gable.rafterLayoutLengthFeet, 20);
          assert.equal(
            snapshot.calculations.materials.find(
              (item) =>
                item.id ===
                materialLineItemId(ROOF_QUANTITY_KEYS.commonRafters, ROOF_PLANE),
            )?.quantity,
            16,
          );

          const sheathingPayload = sheathingArtifactSchema.parse(
            JSON.parse(
              await readFile(
                snapshot.stageResults.find((s) => s.name === "sheathing")!
                  .artifactPath,
                "utf8",
              ),
            ),
          ).payload;
          const sheathingArea = sheathingPayload.areas.find(
            (area) => area.id === SHEATHING_AREA,
          );
          assert.ok(sheathingArea);
          assert.equal(sheathingArea.areaSquareFeet, null);
          assert.equal(
            snapshot.calculations.materials.find(
              (item) =>
                item.id ===
                createMaterialLineItemId(
                  SHEATHING_QUANTITY_KEYS.area,
                  SHEATHING_AREA,
                ),
            ),
            undefined,
          );

          const sheathingSfReview = reviewForObjectProperty(
            snapshot,
            SHEATHING_AREA,
            "areaSquareFeet",
          );
          assert.ok(
            sheathingSfReview,
            "Expected provide-value review for missing sheathing SF",
          );
          assert.equal(sheathingSfReview.action.type, "provide-value");

          const d04JackReview = reviewForObjectProperty(
            snapshot,
            OPENING_D04,
            "jackStudCount",
          );
          assert.ok(
            d04JackReview,
            "Expected provide-value review for missing D04 jack count",
          );

          const validationStage = snapshot.stageResults.find(
            (s) => s.name === "validation",
          )!;
          const validationArtifact = validationArtifactSchema.parse(
            JSON.parse(await readFile(validationStage.artifactPath, "utf8")),
          );

          const decision: UserDecision = {
            id: "UD-REALISTIC-SHEATHING-SF-001",
            reviewItemId: sheathingSfReview.id,
            result: {
              type: "value-provided",
              value: 1420,
              rationale:
                "Reviewer supplied wall sheathing coverage from field measure.",
            },
            supersedesUserDecisionId: null,
          };

          const written = createUserDecisionArtifact({
            projectId: "live-proof-realistic-residential",
            pipelineRunId: result.pipelineRunId,
            validationArtifactId: validationArtifact.artifactId,
            decision,
            producerIdentifier: "live-realistic-test",
          });

          const store = new ArtifactStore(run1Root);
          const decisionPath = await store.writeExternal(
            "live-proof-realistic-residential",
            "framing",
            `${decision.id}.json`,
            written,
          );
          const loaded = userDecisionArtifactSchema.parse(
            await store.read(decisionPath),
          );
          const reviewItemsById = new Map(
            snapshot.validation.reviewItems.map((item) => [item.id, item]),
          );

          const run1EvidenceArtifact = extractedFramingEvidenceArtifactSchema.parse(
            JSON.parse(
              await readFile(
                snapshot.stageResults.find((s) => s.name === "extractedEvidence")!
                  .artifactPath,
                "utf8",
              ),
            ),
          );
          const run1EvidenceIds = run1EvidenceArtifact.payload.evidence.map(
            (record) => record.id,
          );
          const callsBeforeRun2 = extractionCallCount.value;

          const run2 = await runLiveRealisticPipeline(
            FIXTURE,
            "live-proof-realistic-residential-run2",
            run2Root,
            {
              stages,
              userDecisionRunInput: {
                userDecisions: [loaded.payload],
                reviewItemsById,
                inputArtifactIds: [loaded.artifactId],
                evidenceReplay: buildEvidenceReplayInput({
                  extractedEvidenceArtifact: run1EvidenceArtifact,
                  planIndex,
                }),
              },
            },
          );
          assert.equal(
            extractionCallCount.value,
            callsBeforeRun2,
            "Run 2 must not invoke Claude extraction",
          );
          assert.equal(
            extractionCallCount.value,
            1,
            "End-to-end Run-1→Run-2 must invoke Claude extraction exactly once",
          );

          const run2EvidenceArtifact = extractedFramingEvidenceArtifactSchema.parse(
            JSON.parse(
              await readFile(
                run2.snapshot.stageResults.find((s) => s.name === "extractedEvidence")!
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
            run2EvidenceArtifact.inputArtifactIds.includes(
              run1EvidenceArtifact.artifactId,
            ),
          );
          assert.notEqual(
            run2EvidenceArtifact.artifactId,
            run1EvidenceArtifact.artifactId,
          );
          assert.deepEqual(
            run2EvidenceArtifact.payload.evidence.map((record) => record.id),
            run1EvidenceIds,
          );

          const run2Sheathing = sheathingArtifactSchema.parse(
            JSON.parse(
              await readFile(
                run2.snapshot.stageResults.find((s) => s.name === "sheathing")!
                  .artifactPath,
                "utf8",
              ),
            ),
          ).payload;
          const run2Area = run2Sheathing.areas.find(
            (area) => area.id === SHEATHING_AREA,
          );
          assert.equal(run2Area?.areaSquareFeet, 1420);
          assert.equal(
            run2Area?.resolutionTraces.find(
              (trace) => trace.propertyPath === "areaSquareFeet",
            )?.method,
            "user-override",
          );

          const run2Calc = framingCalculationsArtifactSchema.parse(
            JSON.parse(
              await readFile(
                run2.snapshot.stageResults.find((s) => s.name === "calculations")!
                  .artifactPath,
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

          const run2Validation = validationArtifactSchema.parse(
            JSON.parse(
              await readFile(
                run2.snapshot.stageResults.find((s) => s.name === "validation")!
                  .artifactPath,
                "utf8",
              ),
            ),
          ).payload;
          assert.equal(
            run2Validation.reviewItems.find(
              (item) =>
                item.affectedObjects.some(
                  (object) => object.objectId === SHEATHING_AREA,
                ) && item.action.targetProperty === "areaSquareFeet",
            ),
            undefined,
          );

          assert.equal(
            run2Calc.materials.find(
              (item) =>
                item.id === materialLineItemId(WALL_QUANTITY_KEYS.studs, SEGMENT_ID),
            )?.quantity,
            studLine?.quantity,
          );

          assert.equal(sheathingArea.areaSquareFeet, null);

          const missingNonCritical = scores.filter(
            (score) =>
              score.classification === "MISSING" &&
              !CRITICAL_FACT_IDS.has(score.factId),
          );
          if (missingNonCritical.length > 0) {
            console.info(
              "[realistic-extraction] non-critical missing facts:",
              missingNonCritical.map((score) => score.factId).join(", "),
            );
          }
          console.info(
            "[realistic-extraction] final summary:",
            JSON.stringify(summary),
            "evidence count:",
            snapshot.evidence.length,
            "totalExtractionCalls:",
            extractionCallCount.value,
          );
          retainArtifactsForDiagnosis = false;
        } finally {
          if (retainArtifactsForDiagnosis) {
            console.info(
              "[realistic-extraction] retaining artifacts for diagnosis:",
              { run1Root, run2Root, extractionCallCount: extractionCallCount.value },
            );
          } else {
            await rm(run1Root, { recursive: true, force: true });
            await rm(run2Root, { recursive: true, force: true });
          }
        }
      },
    );
  },
);
