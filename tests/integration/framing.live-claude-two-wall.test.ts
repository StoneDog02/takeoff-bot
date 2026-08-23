import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { ArtifactStore } from "../../src/core/artifacts/ArtifactStore.js";
import { PipelineRunner } from "../../src/core/pipeline/PipelineRunner.js";
import { isAnthropicConfigured } from "../../src/config/env.js";
import { indexPlan } from "../../src/plans/indexPlan.js";
import { createFramingStages } from "../../src/scopes/framing/stages/createFramingStages.js";
import { WALL_FRAMING_RULE_IDS } from "../../src/scopes/framing/validators/rule-ids.js";
import { WALL_TWO_WALL_TEXT } from "../fixtures/wallTwoWallFixtureLines.ts";
import {
  assertNoCrossWallContamination,
  evidenceForSubject,
  hasCandidateForSubject,
  isGroundedInPageText,
  materialLineItemId,
  plateMaterialForSegment,
  snapshotLiveFramingPipeline,
  studMaterialForSegment,
  TWO_WALL_W001_VALUES,
  TWO_WALL_W002_VALUES,
  validationIssuesForObject,
  validationResultsForObject,
  wallById,
  segmentById,
} from "./liveFramingProofHelpers.js";

const RUN_LIVE = process.env.TAKEOFF_LIVE_CLAUDE === "1";
const FIXTURE_TWO_WALL = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/wall-w001-w002-text-layer.pdf",
);

const W001_REQUIRED: Array<{
  propertyPath: string;
  candidateValue: string | number;
}> = [
  { propertyPath: "wallType", candidateValue: "wood stud wall" },
  { propertyPath: "lengthFeet", candidateValue: 20 },
  { propertyPath: "assembly.studSize", candidateValue: "2x4" },
  { propertyPath: "assembly.studSpacingInches", candidateValue: 16 },
  { propertyPath: "assembly.heightFeet", candidateValue: 8 },
  { propertyPath: "assembly.plateCount", candidateValue: 3 },
];

const W002_REQUIRED: Array<{
  propertyPath: string;
  candidateValue: string | number;
}> = [
  { propertyPath: "wallType", candidateValue: "wood stud wall" },
  { propertyPath: "lengthFeet", candidateValue: 12 },
  { propertyPath: "assembly.studSize", candidateValue: "2x6" },
  { propertyPath: "assembly.studSpacingInches", candidateValue: 24 },
  { propertyPath: "assembly.heightFeet", candidateValue: 9 },
  { propertyPath: "assembly.plateCount", candidateValue: 2 },
];

async function runLiveTwoWallPipeline(
  projectId: string,
  artifactRoot: string,
) {
  const planIndex = await indexPlan(FIXTURE_TWO_WALL);
  const pageText = planIndex.pages.map((page) => page.textContent).join("\n");
  const runner = new PipelineRunner(new ArtifactStore(artifactRoot));
  const result = await runner.run({
    projectId,
    pdfPath: FIXTURE_TWO_WALL,
    scopeName: "framing",
    planIndex,
    useMockAi: false,
    stages: createFramingStages(),
  });

  assert.equal(result.success, true, result.errors.join("\n"));
  assert.equal(result.errors.length, 0);
  assert.equal(result.stageResults.length, 16);

  return snapshotLiveFramingPipeline(pageText, result);
}

describe("live Claude two-wall framing proof", { skip: !RUN_LIVE }, () => {
  it(
    "runs the two-wall controlled PDF through live Claude Evidence to takeoff",
    { timeout: 240_000 },
    async () => {
      assert.equal(
        isAnthropicConfigured(),
        true,
        "TAKEOFF_LIVE_CLAUDE=1 requires ANTHROPIC_API_KEY.",
      );

      const artifactRoot = await mkdtemp(
        path.join(tmpdir(), "takeoff-bot-live-two-wall-"),
      );

      try {
        const indexed = await indexPlan(FIXTURE_TWO_WALL);
        assert.equal(indexed.totalPages, 1);
        assert.equal(indexed.pages[0]?.textContent, WALL_TWO_WALL_TEXT);
        assert.match(indexed.pages[0]?.textContent ?? "", /W-001/);
        assert.match(indexed.pages[0]?.textContent ?? "", /W-002/);

        const snapshot = await runLiveTwoWallPipeline(
          "live-proof-w001-w002",
          artifactRoot,
        );

        for (const record of snapshot.evidence) {
          assert.ok(
            isGroundedInPageText(record.originalText, snapshot.pageText),
            `Evidence ${record.id} originalText is not grounded in indexed PDF text: ${record.originalText}`,
          );
        }

        const w001Evidence = evidenceForSubject(snapshot.evidence, "W-001");
        const w002Evidence = evidenceForSubject(snapshot.evidence, "W-002");
        assert.ok(w001Evidence.length > 0, "Missing W-001 Evidence cluster");
        assert.ok(w002Evidence.length > 0, "Missing W-002 Evidence cluster");

        for (const required of W001_REQUIRED) {
          assert.equal(
            hasCandidateForSubject(
              snapshot.evidence,
              "W-001",
              required.propertyPath,
              required.candidateValue,
            ),
            true,
            `Missing W-001 ${required.propertyPath}=${required.candidateValue}`,
          );
        }

        for (const required of W002_REQUIRED) {
          assert.equal(
            hasCandidateForSubject(
              snapshot.evidence,
              "W-002",
              required.propertyPath,
              required.candidateValue,
            ),
            true,
            `Missing W-002 ${required.propertyPath}=${required.candidateValue}`,
          );
        }

        assertNoCrossWallContamination(
          snapshot.evidence,
          "W-001",
          "W-002",
          TWO_WALL_W001_VALUES,
          TWO_WALL_W002_VALUES,
        );

        assert.equal(
          snapshot.evidence.some(
            (record) =>
              record.propertyPath === "location" ||
              record.propertyPath === "bearingStatus",
          ),
          false,
          "Claude invented unsupported location/bearing Evidence",
        );

        assert.deepEqual(
          snapshot.wallFraming.walls.map((wall) => wall.id),
          ["W-001", "W-002"],
        );
        assert.deepEqual(
          snapshot.wallFraming.segments.map((segment) => segment.id),
          ["WS-001", "WS-002"],
        );

        const wall001 = wallById(snapshot.wallFraming, "W-001");
        const wall002 = wallById(snapshot.wallFraming, "W-002");
        const segment001 = segmentById(snapshot.wallFraming, "WS-001");
        const segment002 = segmentById(snapshot.wallFraming, "WS-002");
        assert.ok(wall001 && wall002 && segment001 && segment002);

        assert.equal(wall001.wallType, "wood stud wall");
        assert.equal(wall001.assembly.studSize, "2x4");
        assert.equal(wall001.assembly.studSpacingInches, 16);
        assert.equal(wall001.assembly.heightFeet, 8);
        assert.equal(wall001.assembly.plateCount, 3);
        assert.deepEqual(wall001.segmentIds, ["WS-001"]);
        assert.equal(segment001.parentWallId, "W-001");
        assert.equal(segment001.lengthFeet, 20);

        assert.equal(wall002.wallType, "wood stud wall");
        assert.equal(wall002.assembly.studSize, "2x6");
        assert.equal(wall002.assembly.studSpacingInches, 24);
        assert.equal(wall002.assembly.heightFeet, 9);
        assert.equal(wall002.assembly.plateCount, 2);
        assert.deepEqual(wall002.segmentIds, ["WS-002"]);
        assert.equal(segment002.parentWallId, "W-002");
        assert.equal(segment002.lengthFeet, 12);

        for (const trace of wall001.resolutionTraces) {
          assert.ok(
            trace.evidenceIds.every((evidenceId) =>
              w001Evidence.some((record) => record.id === evidenceId),
            ),
            `W-001 trace ${trace.propertyPath} references foreign Evidence`,
          );
        }
        for (const trace of segment001.resolutionTraces) {
          assert.ok(
            trace.evidenceIds.every((evidenceId) =>
              w001Evidence.some((record) => record.id === evidenceId),
            ),
            `WS-001 trace references foreign Evidence`,
          );
        }
        for (const trace of wall002.resolutionTraces) {
          assert.ok(
            trace.evidenceIds.every((evidenceId) =>
              w002Evidence.some((record) => record.id === evidenceId),
            ),
            `W-002 trace ${trace.propertyPath} references foreign Evidence`,
          );
        }
        for (const trace of segment002.resolutionTraces) {
          assert.ok(
            trace.evidenceIds.every((evidenceId) =>
              w002Evidence.some((record) => record.id === evidenceId),
            ),
            `WS-002 trace references foreign Evidence`,
          );
        }

        for (const wallId of ["W-001", "W-002"] as const) {
          const typeResult = validationResultsForObject(
            snapshot.validation,
            wallId,
          ).find((entry) => entry.ruleId === WALL_FRAMING_RULE_IDS.typeResolved);
          assert.equal(typeResult?.outcome, "passed", wallId);
        }

        for (const segmentId of ["WS-001", "WS-002"] as const) {
          const lengthResult = validationResultsForObject(
            snapshot.validation,
            segmentId,
          ).find(
            (entry) =>
              entry.ruleId === WALL_FRAMING_RULE_IDS.geometryLengthResolved,
          );
          assert.equal(lengthResult?.outcome, "passed", segmentId);
        }

        for (const objectId of ["W-001", "W-002"] as const) {
          assert.ok(
            validationIssuesForObject(snapshot.validation, objectId).some(
              (issue) => issue.ruleId === WALL_FRAMING_RULE_IDS.locationResolved,
            ),
          );
          assert.ok(
            validationIssuesForObject(snapshot.validation, objectId).some(
              (issue) => issue.ruleId === WALL_FRAMING_RULE_IDS.bearingResolved,
            ),
          );
        }

        assert.equal(
          validationIssuesForObject(snapshot.validation, "W-001").some(
            (issue) => issue.ruleId === WALL_FRAMING_RULE_IDS.typeResolved,
          ),
          false,
        );
        assert.equal(
          validationIssuesForObject(snapshot.validation, "W-002").some(
            (issue) => issue.ruleId === WALL_FRAMING_RULE_IDS.typeResolved,
          ),
          false,
        );

        const stud001 = studMaterialForSegment(snapshot.calculations, "WS-001");
        const plate001 = plateMaterialForSegment(snapshot.calculations, "WS-001");
        const stud002 = studMaterialForSegment(snapshot.calculations, "WS-002");
        const plate002 = plateMaterialForSegment(snapshot.calculations, "WS-002");
        assert.ok(stud001 && plate001 && stud002 && plate002);

        assert.equal(stud001.quantity, 16);
        assert.equal(plate001.quantity, 60);
        assert.equal(stud002.quantity, 7);
        assert.equal(plate002.quantity, 24);
        assert.equal(snapshot.calculations.materials.length, 4);

        for (const line of [stud001, plate001]) {
          assert.deepEqual([...line.sourceObjectIds].sort(), ["W-001", "WS-001"]);
          assert.equal(line.assumptionIds.length, 0);
        }
        for (const line of [stud002, plate002]) {
          assert.deepEqual([...line.sourceObjectIds].sort(), ["W-002", "WS-002"]);
          assert.equal(line.assumptionIds.length, 0);
        }

        assert.equal(snapshot.takeoff.executionMode, "anthropic");
        assert.equal(snapshot.takeoff.summary.wallCount, 2);
        assert.equal(snapshot.takeoff.summary.wallSegmentCount, 2);
        assert.equal(snapshot.takeoff.summary.materialLineItemCount, 4);
        assert.deepEqual(
          snapshot.takeoff.materials.map((item) => item.id).sort(),
          snapshot.calculations.materials.map((item) => item.id).sort(),
        );
        assert.deepEqual(
          snapshot.takeoff.materials.map((item) => ({
            id: item.id,
            quantity: item.quantity,
            unit: item.unit,
          })),
          [
            {
              id: materialLineItemId("wall.studs", "WS-001"),
              quantity: 16,
              unit: "each",
            },
            {
              id: materialLineItemId("wall.plates", "WS-001"),
              quantity: 60,
              unit: "linear-foot",
            },
            {
              id: materialLineItemId("wall.studs", "WS-002"),
              quantity: 7,
              unit: "each",
            },
            {
              id: materialLineItemId("wall.plates", "WS-002"),
              quantity: 24,
              unit: "linear-foot",
            },
          ],
        );

        const takeoffConfidence = snapshot.confidence.confidenceEvaluations.find(
          (evaluation) => evaluation.target.kind === "takeoff",
        );
        assert.ok(takeoffConfidence);
        assert.ok(
          snapshot.confidence.confidenceEvaluations.some(
            (evaluation) =>
              evaluation.target.kind === "object" &&
              evaluation.target.objectId === "W-001",
          ),
        );
        assert.ok(
          snapshot.confidence.confidenceEvaluations.some(
            (evaluation) =>
              evaluation.target.kind === "object" &&
              evaluation.target.objectId === "W-002",
          ),
        );

        assert.equal(
          snapshot.stageResults.some((stage) => stage.name === "extractedEvidence"),
          true,
        );
        assert.equal(
          snapshot.stageResults.some((stage) => stage.name === "wallFraming"),
          true,
        );
        assert.equal(
          snapshot.stageResults.some((stage) => stage.name === "validation"),
          true,
        );
        assert.equal(
          snapshot.stageResults.some((stage) => stage.name === "calculations"),
          true,
        );
        assert.equal(
          snapshot.stageResults.some((stage) => stage.name === "confidence"),
          true,
        );
        assert.equal(
          snapshot.stageResults.some((stage) => stage.name === "report"),
          true,
        );
      } finally {
        await rm(artifactRoot, { recursive: true, force: true });
      }
    },
  );
});
