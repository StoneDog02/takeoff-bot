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
import { createOpeningKingStudCountAssumptionId } from "../../src/scopes/framing/calculators/createOpeningKingStudCountAssumption.js";
import { createFramingStages } from "../../src/scopes/framing/stages/createFramingStages.js";
import { OPENINGS_RULE_IDS } from "../../src/scopes/framing/validators/rule-ids.js";
import { WALL_O001_HDR001_MIXED_TEXT } from "../fixtures/wallOpeningHeaderFixtureLines.js";
import {
  openingKingStudCountLineIndexes,
  WALL_O001_HDR001_KING2_TEXT,
  WALL_O001_HDR001_KING3_TEXT,
  wallOpeningHeaderKingStudFixtureLines,
} from "../fixtures/wallOpeningHeaderKingStudFixtureLines.js";
import {
  candidatesForSubjectProperty,
  kingStudMaterialForOpening,
  memberMaterialForObject,
  openingById,
  plateMaterialForSegment,
  semanticEvidenceDifferences,
  snapshotLiveFramingPipeline,
  studMaterialForSegment,
  type LiveFramingPipelineSnapshot,
} from "./liveFramingProofHelpers.js";

const RUN_LIVE = process.env.TAKEOFF_LIVE_CLAUDE === "1";

const FIXTURE_DEFAULT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/wall-w001-o001-hdr001-text-layer.pdf",
);
const FIXTURE_KING2 = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/wall-w001-o001-hdr001-king2-text-layer.pdf",
);
const FIXTURE_KING3 = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/wall-w001-o001-hdr001-king3-text-layer.pdf",
);

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
  return snapshotLiveFramingPipeline(pageText, result);
}

function assertBaselineMaterials(snapshot: LiveFramingPipelineSnapshot) {
  assert.equal(studMaterialForSegment(snapshot.calculations, "WS-001")?.quantity, 16);
  assert.equal(plateMaterialForSegment(snapshot.calculations, "WS-001")?.quantity, 60);
  assert.equal(memberMaterialForObject(snapshot.calculations, "SM-HDR-001")?.quantity, 6);
}

function assertExplicitKingStudRun(
  snapshot: LiveFramingPipelineSnapshot,
  expectedCount: 2 | 3,
) {
  const opening = openingById(snapshot.openings, "O-001");
  assert.ok(opening);
  assert.equal(opening.quantity, 1);
  assert.equal(opening.kingStudCount, expectedCount);

  const kingCandidates = candidatesForSubjectProperty(
    snapshot.evidence,
    "O-001",
    "kingStudCount",
  ).filter((value): value is number => typeof value === "number");
  assert.ok(kingCandidates.includes(expectedCount));

  const trace = opening.resolutionTraces.find(
    (entry) => entry.propertyPath === "kingStudCount",
  );
  assert.equal(trace?.method, "explicit-project-value");
  assert.ok((trace?.evidenceIds.length ?? 0) > 0);

  const kings = kingStudMaterialForOpening(snapshot.calculations, "O-001");
  assert.equal(kings?.quantity, expectedCount);
  assert.equal(kings?.unit, "each");
  assert.equal(snapshot.calculations.assumptions.length, 0);
  assert.equal(
    snapshot.validation.reviewItems.some((item) =>
      item.title.includes("Confirm king stud count"),
    ),
    false,
  );
  assert.equal(
    snapshot.validation.validationIssues.some(
      (issue) => issue.ruleId === OPENINGS_RULE_IDS.kingStudCountDefault,
    ),
    false,
  );
  assert.equal(kings?.assumptionIds.length, 0);
  assert.equal(
    kings?.assumptionIds.includes(
      createOpeningKingStudCountAssumptionId("O-001"),
    ),
    false,
  );

  assertBaselineMaterials(snapshot);
}

describe("live Claude explicit opening kingStudCount proof", { skip: !RUN_LIVE }, () => {
  it(
    "retains industry-default king path when no explicit kingStudCount Evidence exists",
    { timeout: 300_000 },
    async () => {
      assert.equal(
        isAnthropicConfigured(),
        true,
        "TAKEOFF_LIVE_CLAUDE=1 requires ANTHROPIC_API_KEY.",
      );

      const artifactRoot = await mkdtemp(
        path.join(tmpdir(), "takeoff-bot-live-king-default-"),
      );

      try {
        const snapshot = await runLivePipeline(
          FIXTURE_DEFAULT,
          "live-proof-king-default-regression",
          artifactRoot,
        );

        assert.equal(snapshot.pageText, WALL_O001_HDR001_MIXED_TEXT);
        assert.equal(
          candidatesForSubjectProperty(
            snapshot.evidence,
            "O-001",
            "kingStudCount",
          ).length,
          0,
        );

        const opening = openingById(snapshot.openings, "O-001");
        assert.ok(opening);
        assert.equal(opening.kingStudCount, null);

        const kings = kingStudMaterialForOpening(snapshot.calculations, "O-001");
        assert.equal(kings?.quantity, 2);
        assert.equal(snapshot.calculations.assumptions.length, 1);
        assert.ok(
          snapshot.validation.reviewItems.some((item) =>
            item.title.includes("Confirm king stud count"),
          ),
        );
        assert.ok(
          kings?.assumptionIds.includes(
            createOpeningKingStudCountAssumptionId("O-001"),
          ),
        );

        assertBaselineMaterials(snapshot);
      } finally {
        await rm(artifactRoot, { recursive: true, force: true });
      }
    },
  );

  it(
    "proves king-stud causality from explicit 2 to explicit 3 without changing wall or header quantities",
    { timeout: 360_000 },
    async () => {
      assert.equal(
        isAnthropicConfigured(),
        true,
        "TAKEOFF_LIVE_CLAUDE=1 requires ANTHROPIC_API_KEY.",
      );

      const artifactRoot = await mkdtemp(
        path.join(tmpdir(), "takeoff-bot-live-king-causality-"),
      );

      try {
        const controlIndex = await indexPlan(FIXTURE_KING2);
        const mutationIndex = await indexPlan(FIXTURE_KING3);
        const controlText = controlIndex.pages[0]?.textContent ?? "";
        const mutationText = mutationIndex.pages[0]?.textContent ?? "";

        assert.equal(controlText, WALL_O001_HDR001_KING2_TEXT);
        assert.equal(mutationText, WALL_O001_HDR001_KING3_TEXT);
        assert.notEqual(controlText, mutationText);

        const kingLineIndex = wallOpeningHeaderKingStudFixtureLines(2).findIndex(
          (line) => line.startsWith("King studs:"),
        );
        assert.deepEqual(
          openingKingStudCountLineIndexes(controlText, mutationText),
          [kingLineIndex],
        );

        const control = await runLivePipeline(
          FIXTURE_KING2,
          "live-proof-king-stud-2",
          artifactRoot,
        );
        const mutation = await runLivePipeline(
          FIXTURE_KING3,
          "live-proof-king-stud-3",
          artifactRoot,
        );

        assertExplicitKingStudRun(control, 2);
        assertExplicitKingStudRun(mutation, 3);

        const unexpectedSemanticDifferences = semanticEvidenceDifferences(
          control.evidence,
          mutation.evidence,
          ["opening:O-001:kingStudCount"],
        );
        assert.deepEqual(unexpectedSemanticDifferences, []);

        assert.equal(
          control.wallFraming.segments[0]?.lengthFeet,
          mutation.wallFraming.segments[0]?.lengthFeet,
        );
        assert.equal(
          control.structuralMembers.structuralMembers[0]?.lengthFeet,
          mutation.structuralMembers.structuralMembers[0]?.lengthFeet,
        );
        assert.equal(
          kingStudMaterialForOpening(control.calculations, "O-001")?.quantity,
          2,
        );
        assert.equal(
          kingStudMaterialForOpening(mutation.calculations, "O-001")?.quantity,
          3,
        );
      } finally {
        await rm(artifactRoot, { recursive: true, force: true });
      }
    },
  );
});
