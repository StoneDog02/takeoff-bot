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
import { WALL_FRAMING_RULE_IDS, WALL_QUANTITY_KEYS } from "../../src/scopes/framing/validators/rule-ids.js";
import { WALL_TWO_WALL_CONFLICT_TEXT } from "../fixtures/wallTwoWallConflictFixtureLines.ts";
import {
  assertConflictingLengthCandidatesPreserved,
  assertNoCrossWallContamination,
  candidatesForSubjectProperty,
  evidenceForSubject,
  hasCandidateForSubject,
  isGroundedInPageText,
  materialLineItemId,
  plateMaterialForSegment,
  snapshotLiveFramingPipeline,
  studMaterialForSegment,
  TWO_WALL_W001_VALUES,
  validationIssuesForObject,
  validationResultsForObject,
  wallById,
  segmentById,
} from "./liveFramingProofHelpers.js";

const RUN_LIVE = process.env.TAKEOFF_LIVE_CLAUDE === "1";
const FIXTURE_CONFLICT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/wall-w001-w002-conflict-text-layer.pdf",
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

const W002_NON_LENGTH_REQUIRED: Array<{
  propertyPath: string;
  candidateValue: string | number;
}> = [
  { propertyPath: "wallType", candidateValue: "wood stud wall" },
  { propertyPath: "assembly.studSize", candidateValue: "2x6" },
  { propertyPath: "assembly.studSpacingInches", candidateValue: 24 },
  { propertyPath: "assembly.heightFeet", candidateValue: 9 },
  { propertyPath: "assembly.plateCount", candidateValue: 2 },
];

async function runLiveConflictPipeline(
  projectId: string,
  artifactRoot: string,
) {
  const planIndex = await indexPlan(FIXTURE_CONFLICT);
  const pageText = planIndex.pages.map((page) => page.textContent).join("\n");
  const runner = new PipelineRunner(new ArtifactStore(artifactRoot));
  const result = await runner.run({
    projectId,
    pdfPath: FIXTURE_CONFLICT,
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

describe("live Claude two-wall conflict framing proof", { skip: !RUN_LIVE }, () => {
  it(
    "preserves W-002 length conflict and still emits W-001 quantities in takeoff",
    { timeout: 240_000 },
    async () => {
      assert.equal(
        isAnthropicConfigured(),
        true,
        "TAKEOFF_LIVE_CLAUDE=1 requires ANTHROPIC_API_KEY.",
      );

      const artifactRoot = await mkdtemp(
        path.join(tmpdir(), "takeoff-bot-live-two-wall-conflict-"),
      );

      try {
        const indexed = await indexPlan(FIXTURE_CONFLICT);
        assert.equal(indexed.pages[0]?.textContent, WALL_TWO_WALL_CONFLICT_TEXT);

        const snapshot = await runLiveConflictPipeline(
          "live-proof-w001-w002-conflict",
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
        assert.ok(w001Evidence.length > 0);
        assert.ok(w002Evidence.length > 0);

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

        for (const required of W002_NON_LENGTH_REQUIRED) {
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

        assertConflictingLengthCandidatesPreserved(
          snapshot.evidence,
          "W-002",
          [12, 14],
        );

        assertNoCrossWallContamination(
          snapshot.evidence,
          "W-001",
          "W-002",
          TWO_WALL_W001_VALUES,
          [
            { propertyPath: "lengthFeet", value: 12 },
            { propertyPath: "lengthFeet", value: 14 },
            { propertyPath: "assembly.studSize", value: "2x6" },
            { propertyPath: "assembly.studSpacingInches", value: 24 },
            { propertyPath: "assembly.heightFeet", value: 9 },
            { propertyPath: "assembly.plateCount", value: 2 },
          ],
        );

        assert.equal(
          snapshot.evidence.some(
            (record) =>
              record.subjectKey === "W-001" &&
              (record.candidateValue === 12 || record.candidateValue === 14),
          ),
          false,
        );

        const wall001 = wallById(snapshot.wallFraming, "W-001");
        const wall002 = wallById(snapshot.wallFraming, "W-002");
        const segment001 = segmentById(snapshot.wallFraming, "WS-001");
        const segment002 = segmentById(snapshot.wallFraming, "WS-002");
        assert.ok(wall001 && wall002 && segment001 && segment002);

        assert.equal(segment001.lengthFeet, 20);
        assert.equal(segment002.lengthFeet, null);
        assert.equal(wall002.assembly.studSize, "2x6");
        assert.equal(wall002.assembly.studSpacingInches, 24);
        assert.equal(wall002.assembly.heightFeet, 9);
        assert.equal(wall002.assembly.plateCount, 2);

        const trace001 = segment001.resolutionTraces.find(
          (entry) => entry.propertyPath === "lengthFeet",
        );
        const trace002 = segment002.resolutionTraces.find(
          (entry) => entry.propertyPath === "lengthFeet",
        );
        assert.equal(trace001?.method, "explicit-project-value");
        assert.equal(trace002?.method, "unresolved");
        assert.equal(trace002?.evidenceIds.length, 2);
        assert.ok(
          trace002?.evidenceIds.every((evidenceId) =>
            w002Evidence.some((record) => record.id === evidenceId),
          ),
        );
        assert.ok(
          [...wall001.resolutionTraces, ...segment001.resolutionTraces].every(
            (trace) =>
              trace.evidenceIds.every((evidenceId) =>
                w001Evidence.some((record) => record.id === evidenceId),
              ),
          ),
        );

        assert.equal(
          validationResultsForObject(snapshot.validation, "W-001").find(
            (entry) => entry.ruleId === WALL_FRAMING_RULE_IDS.typeResolved,
          )?.outcome,
          "passed",
        );
        assert.equal(
          validationResultsForObject(snapshot.validation, "WS-001").find(
            (entry) =>
              entry.ruleId === WALL_FRAMING_RULE_IDS.geometryLengthResolved,
          )?.outcome,
          "passed",
        );
        assert.equal(
          validationResultsForObject(snapshot.validation, "W-002").find(
            (entry) => entry.ruleId === WALL_FRAMING_RULE_IDS.typeResolved,
          )?.outcome,
          "passed",
        );
        assert.equal(
          validationResultsForObject(snapshot.validation, "WS-002").find(
            (entry) =>
              entry.ruleId === WALL_FRAMING_RULE_IDS.geometryLengthResolved,
          )?.outcome,
          "failed",
        );

        const ws002LengthIssue = validationIssuesForObject(
          snapshot.validation,
          "WS-002",
        ).find(
          (issue) =>
            issue.ruleId === WALL_FRAMING_RULE_IDS.geometryLengthResolved,
        );
        assert.ok(ws002LengthIssue);
        assert.equal(
          ws002LengthIssue.quantityImpacts.some(
            (impact) =>
              impact.quantityKey === WALL_QUANTITY_KEYS.studs &&
              impact.canCalculate === false,
          ),
          true,
        );
        assert.equal(
          ws002LengthIssue.quantityImpacts.some(
            (impact) =>
              impact.quantityKey === WALL_QUANTITY_KEYS.plates &&
              impact.canCalculate === false,
          ),
          true,
        );
        assert.equal(
          validationIssuesForObject(snapshot.validation, "WS-001").some(
            (issue) =>
              issue.ruleId === WALL_FRAMING_RULE_IDS.geometryLengthResolved,
          ),
          false,
        );

        const stud001 = studMaterialForSegment(snapshot.calculations, "WS-001");
        const plate001 = plateMaterialForSegment(snapshot.calculations, "WS-001");
        assert.ok(stud001 && plate001);
        assert.equal(stud001.quantity, 16);
        assert.equal(plate001.quantity, 60);
        assert.equal(snapshot.calculations.materials.length, 2);
        assert.equal(
          snapshot.calculations.materials.some((item) => item.id.includes("WS-002")),
          false,
        );

        assert.equal(snapshot.takeoff.summary.wallCount, 2);
        assert.equal(snapshot.takeoff.summary.wallSegmentCount, 2);
        assert.equal(snapshot.takeoff.summary.materialLineItemCount, 2);
        assert.equal(snapshot.takeoff.status, "completed");
        assert.equal(snapshot.takeoff.executionMode, "anthropic");
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
          ],
        );

        assert.ok(
          snapshot.validation.reviewItems.some(
            (item) =>
              item.validationIssueIds.includes(ws002LengthIssue.id) ||
              item.affectedObjects.some(
                (object) => object.objectId === "WS-002",
              ),
          ),
        );

        const takeoffConfidence = snapshot.confidence.confidenceEvaluations.find(
          (evaluation) => evaluation.target.kind === "takeoff",
        );
        assert.ok(takeoffConfidence);
        assert.equal(takeoffConfidence.overallLabel, "blocked");
        assert.equal(takeoffConfidence.blockingStatus, "blocked");
        assert.equal(takeoffConfidence.reviewStatus, "review-required");

        const segment002Confidence = snapshot.confidence.confidenceEvaluations.find(
          (evaluation) =>
            evaluation.target.kind === "object" &&
            evaluation.target.objectId === "WS-002",
        );
        assert.ok(segment002Confidence);
        assert.equal(segment002Confidence.overallLabel, "blocked");
        assert.equal(segment002Confidence.blockingStatus, "blocked");

        assert.equal(
          candidatesForSubjectProperty(snapshot.evidence, "W-002", "lengthFeet")
            .length,
          2,
        );
      } finally {
        await rm(artifactRoot, { recursive: true, force: true });
      }
    },
  );
});
