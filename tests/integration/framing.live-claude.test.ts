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
import {
  WALL_W001_20FT_TEXT,
  WALL_W001_24FT_TEXT,
} from "../fixtures/wallW001FixtureLines.ts";
import {
  hasCandidate,
  isGroundedInPageText,
  plateMaterial,
  snapshotLiveFramingProof,
  studMaterial,
  validationRuleOutcomes,
} from "./liveFramingProofHelpers.js";

const RUN_LIVE = process.env.TAKEOFF_LIVE_CLAUDE === "1";
const FIXTURE_20FT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/wall-w001-text-layer.pdf",
);
const FIXTURE_24FT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/wall-w001-24ft-text-layer.pdf",
);

const REQUIRED_PROPERTIES = [
  "wallType",
  "lengthFeet",
  "assembly.studSize",
  "assembly.studSpacingInches",
  "assembly.heightFeet",
  "assembly.plateCount",
] as const;

async function runLivePipeline(
  pdfPath: string,
  projectId: string,
  artifactRoot: string,
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
    stages: createFramingStages(),
  });

  assert.equal(result.success, true, result.errors.join("\n"));
  assert.equal(result.errors.length, 0);
  assert.equal(result.stageResults.length, 15);

  return snapshotLiveFramingProof(pageText, result);
}

function assertSharedWallFacts(
  snapshot: Awaited<ReturnType<typeof runLivePipeline>>,
  expectedLengthFeet: number,
): void {
  assert.match(snapshot.pageText, /W-001/);
  assert.match(snapshot.pageText, /wood stud wall/i);
  assert.match(snapshot.pageText, new RegExp(`${expectedLengthFeet} ft`));
  assert.match(snapshot.pageText, /2x4/);
  assert.match(snapshot.pageText, /16 in O\.C\./);
  assert.match(snapshot.pageText, /8 ft wall height/);
  assert.match(snapshot.pageText, /3 plates/);

  for (const record of snapshot.evidence) {
    assert.ok(
      isGroundedInPageText(record.originalText, snapshot.pageText),
      `Evidence ${record.id} originalText is not grounded in indexed PDF text: ${record.originalText}`,
    );
  }

  assert.ok(
    snapshot.evidence.some((record) => record.subjectKey.includes("W-001")),
  );
  assert.equal(hasCandidate(snapshot.evidence, "wallType", "wood stud wall"), true);
  assert.equal(
    hasCandidate(snapshot.evidence, "lengthFeet", expectedLengthFeet),
    true,
  );
  assert.equal(hasCandidate(snapshot.evidence, "assembly.studSize", "2x4"), true);
  assert.equal(
    hasCandidate(snapshot.evidence, "assembly.studSpacingInches", 16),
    true,
  );
  assert.equal(hasCandidate(snapshot.evidence, "assembly.heightFeet", 8), true);
  assert.equal(hasCandidate(snapshot.evidence, "assembly.plateCount", 3), true);

  for (const propertyPath of REQUIRED_PROPERTIES) {
    assert.ok(
      snapshot.evidence.some((record) => record.propertyPath === propertyPath),
      `Missing live Evidence for ${propertyPath}`,
    );
  }

  assert.equal(snapshot.wall.id, "W-001");
  assert.equal(snapshot.segment.id, "WS-001");
  assert.equal(snapshot.wall.wallType, "wood stud wall");
  assert.equal(snapshot.segment.lengthFeet, expectedLengthFeet);
  assert.equal(snapshot.wall.assembly.studSize, "2x4");
  assert.equal(snapshot.wall.assembly.studSpacingInches, 16);
  assert.equal(snapshot.wall.assembly.heightFeet, 8);
  assert.equal(snapshot.wall.assembly.plateCount, 3);
  assert.equal(snapshot.wall.assumptionIds.length, 0);
  assert.equal(snapshot.segment.assumptionIds.length, 0);

  assert.ok(
    snapshot.validation.validationResults.some(
      (entry) =>
        entry.ruleId === WALL_FRAMING_RULE_IDS.typeResolved &&
        entry.outcome === "passed",
    ),
  );
  assert.ok(
    snapshot.validation.validationResults.some(
      (entry) =>
        entry.ruleId === WALL_FRAMING_RULE_IDS.geometryLengthResolved &&
        entry.outcome === "passed",
    ),
  );
  assert.equal(
    snapshot.validation.validationIssues.some(
      (issue) => issue.ruleId === WALL_FRAMING_RULE_IDS.typeResolved,
    ),
    false,
  );
  assert.ok(
    snapshot.validation.validationIssues.some(
      (issue) => issue.ruleId === WALL_FRAMING_RULE_IDS.locationResolved,
    ),
  );
  assert.ok(
    snapshot.validation.validationIssues.some(
      (issue) => issue.ruleId === WALL_FRAMING_RULE_IDS.bearingResolved,
    ),
  );

  assert.equal(snapshot.takeoff.executionMode, "anthropic");
  assert.equal(snapshot.takeoff.summary.materialLineItemCount, 2);
  assert.ok(
    snapshot.confidence.confidenceEvaluations.some(
      (evaluation) => evaluation.target.kind === "takeoff",
    ),
  );
}

describe("live Claude framing proof", { skip: !RUN_LIVE }, () => {
  it(
    "runs the 20-ft controlled PDF through live Claude Evidence to takeoff",
    { timeout: 180_000 },
    async () => {
      assert.equal(
        isAnthropicConfigured(),
        true,
        "TAKEOFF_LIVE_CLAUDE=1 requires ANTHROPIC_API_KEY.",
      );

      const artifactRoot = await mkdtemp(
        path.join(tmpdir(), "takeoff-bot-live-20-"),
      );

      try {
        const snapshot = await runLivePipeline(
          FIXTURE_20FT,
          "live-proof-w001-20ft",
          artifactRoot,
        );
        assertSharedWallFacts(snapshot, 20);

        const studs = studMaterial(snapshot.calculations);
        const plates = plateMaterial(snapshot.calculations);
        assert.ok(studs);
        assert.ok(plates);
        assert.equal(studs.quantity, 16);
        assert.equal(plates.quantity, 60);
        assert.deepEqual(
          snapshot.takeoff.materials.map((item) => item.id).sort(),
          snapshot.calculations.materials.map((item) => item.id).sort(),
        );
      } finally {
        await rm(artifactRoot, { recursive: true, force: true });
      }
    },
  );

  it(
    "proves PDF length causality through live Claude to takeoff",
    { timeout: 360_000 },
    async () => {
      assert.equal(
        isAnthropicConfigured(),
        true,
        "TAKEOFF_LIVE_CLAUDE=1 requires ANTHROPIC_API_KEY.",
      );

      const artifactRoot = await mkdtemp(
        path.join(tmpdir(), "takeoff-bot-live-causality-"),
      );

      try {
        const control20 = await indexPlan(FIXTURE_20FT);
        const mutation24 = await indexPlan(FIXTURE_24FT);
        const controlText = control20.pages[0]?.textContent ?? "";
        const mutationText = mutation24.pages[0]?.textContent ?? "";

        assert.equal(controlText, WALL_W001_20FT_TEXT);
        assert.equal(mutationText, WALL_W001_24FT_TEXT);
        assert.notEqual(controlText, mutationText);

        const controlLines = controlText.split("\n");
        const mutationLines = mutationText.split("\n");
        assert.equal(controlLines.length, mutationLines.length);
        const differingLineIndexes = controlLines.flatMap((line, index) =>
          line !== mutationLines[index] ? [index] : [],
        );
        assert.deepEqual(differingLineIndexes, [2]);
        assert.equal(controlLines[2], "20 ft");
        assert.equal(mutationLines[2], "24 ft");

        const control = await runLivePipeline(
          FIXTURE_20FT,
          "live-proof-w001-20ft-causality",
          artifactRoot,
        );
        const mutation = await runLivePipeline(
          FIXTURE_24FT,
          "live-proof-w001-24ft-causality",
          artifactRoot,
        );

        assertSharedWallFacts(control, 20);
        assertSharedWallFacts(mutation, 24);

        assert.equal(control.wall.id, mutation.wall.id);
        assert.equal(control.segment.id, mutation.segment.id);
        assert.equal(control.wall.wallType, mutation.wall.wallType);
        assert.equal(control.wall.assembly.studSize, mutation.wall.assembly.studSize);
        assert.equal(
          control.wall.assembly.studSpacingInches,
          mutation.wall.assembly.studSpacingInches,
        );
        assert.equal(
          control.wall.assembly.heightFeet,
          mutation.wall.assembly.heightFeet,
        );
        assert.equal(
          control.wall.assembly.plateCount,
          mutation.wall.assembly.plateCount,
        );
        assert.deepEqual(
          validationRuleOutcomes(control.validation),
          validationRuleOutcomes(mutation.validation),
        );

        const controlStuds = studMaterial(control.calculations);
        const controlPlates = plateMaterial(control.calculations);
        const mutationStuds = studMaterial(mutation.calculations);
        const mutationPlates = plateMaterial(mutation.calculations);
        assert.ok(controlStuds && controlPlates && mutationStuds && mutationPlates);

        assert.equal(controlStuds.quantity, 16);
        assert.equal(controlPlates.quantity, 60);
        assert.equal(mutationStuds.quantity, 19);
        assert.equal(mutationPlates.quantity, 72);

        assert.equal(mutationStuds.canonicalClassification, controlStuds.canonicalClassification);
        assert.equal(mutationPlates.canonicalClassification, controlPlates.canonicalClassification);
        assert.deepEqual(
          [...mutationStuds.sourceObjectIds].sort(),
          [...controlStuds.sourceObjectIds].sort(),
        );
        assert.deepEqual(
          [...mutationPlates.sourceObjectIds].sort(),
          [...controlPlates.sourceObjectIds].sort(),
        );

        assert.deepEqual(
          control.takeoff.materials.map((item) => ({
            id: item.id,
            quantity: item.quantity,
            unit: item.unit,
          })),
          [
            { id: controlStuds.id, quantity: 16, unit: "each" },
            { id: controlPlates.id, quantity: 60, unit: "linear-foot" },
          ],
        );
        assert.deepEqual(
          mutation.takeoff.materials.map((item) => ({
            id: item.id,
            quantity: item.quantity,
            unit: item.unit,
          })),
          [
            { id: mutationStuds.id, quantity: 19, unit: "each" },
            { id: mutationPlates.id, quantity: 72, unit: "linear-foot" },
          ],
        );
      } finally {
        await rm(artifactRoot, { recursive: true, force: true });
      }
    },
  );
});
