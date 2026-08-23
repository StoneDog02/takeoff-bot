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
import {
  OPENINGS_RULE_IDS,
  WALL_FRAMING_RULE_IDS,
} from "../../src/scopes/framing/validators/rule-ids.js";
import { WALL_O001_MIXED_TEXT } from "../fixtures/wallOpeningFixtureLines.js";
import {
  kingStudMaterialForOpening,
  assertNoWallOpeningTraceContamination,
  evidenceForSubjectKind,
  evidenceIdsForSubject,
  hasCandidateForSubject,
  isGroundedInPageText,
  openingById,
  plateMaterialForSegment,
  snapshotLiveFramingPipeline,
  studMaterialForSegment,
  type LiveFramingPipelineSnapshot,
  validationResultsForObject,
} from "./liveFramingProofHelpers.js";

const RUN_LIVE = process.env.TAKEOFF_LIVE_CLAUDE === "1";
const FIXTURE_RELATIONSHIP = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/wall-w001-o001-text-layer.pdf",
);

const WALL_PROPERTIES = [
  "wallType",
  "lengthFeet",
  "assembly.studSize",
  "assembly.studSpacingInches",
  "assembly.heightFeet",
  "assembly.plateCount",
] as const;

const OPENING_CORE_PROPERTIES = [
  "category",
  "dimensions.nominalWidthFeet",
  "dimensions.nominalHeightFeet",
  "dimensions.roughWidthFeet",
  "dimensions.roughHeightFeet",
  "quantity",
] as const;

async function runLiveWallOpeningPipeline(
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
  assert.equal(result.stageResults.length, 16);

  return snapshotLiveFramingPipeline(pageText, result);
}

function assertWallOpeningRelationshipEvidence(snapshot: LiveFramingPipelineSnapshot) {
  for (const record of snapshot.evidence) {
    assert.ok(
      isGroundedInPageText(record.originalText, snapshot.pageText),
      `Evidence ${record.id} originalText is not grounded: ${record.originalText}`,
    );
  }

  const wallEvidence = evidenceForSubjectKind(snapshot.evidence, "wall", "W-001");
  const openingEvidence = evidenceForSubjectKind(
    snapshot.evidence,
    "opening",
    "O-001",
  );
  assert.ok(wallEvidence.length > 0);
  assert.ok(openingEvidence.length > 0);

  for (const propertyPath of WALL_PROPERTIES) {
    assert.ok(
      wallEvidence.some((record) => record.propertyPath === propertyPath),
      `Missing live wall Evidence for ${propertyPath}`,
    );
  }

  for (const propertyPath of OPENING_CORE_PROPERTIES) {
    assert.ok(
      openingEvidence.some((record) => record.propertyPath === propertyPath),
      `Missing live opening Evidence for ${propertyPath}`,
    );
  }

  assert.equal(
    hasCandidateForSubject(snapshot.evidence, "O-001", "parentWallTag", "W-001"),
    true,
  );
}

function assertWallOpeningRelationshipResolution(
  snapshot: LiveFramingPipelineSnapshot,
) {
  assert.equal(snapshot.wallFraming.walls.length, 1);
  assert.equal(snapshot.wallFraming.segments.length, 1);
  assert.equal(snapshot.wallFraming.walls[0]?.id, "W-001");
  assert.equal(snapshot.wallFraming.segments[0]?.id, "WS-001");
  assert.equal(snapshot.wallFraming.segments[0]?.lengthFeet, 20);
  assert.deepEqual(snapshot.wallFraming.segments[0]?.openingIds, ["O-001"]);

  const opening = openingById(snapshot.openings, "O-001");
  assert.ok(opening);
  assert.equal(opening.parentWallId, "W-001");
  assert.equal(opening.parentObjectId, "WS-001");
  assert.equal(opening.headerMemberId, null);
  assert.equal(opening.category, "window");
  assert.equal(opening.dimensions.nominalWidthFeet, 3);
}

function assertWallQuantitiesUnchanged(snapshot: LiveFramingPipelineSnapshot) {
  const studs = studMaterialForSegment(snapshot.calculations, "WS-001");
  const plates = plateMaterialForSegment(snapshot.calculations, "WS-001");
  assert.ok(studs);
  assert.ok(plates);
  assert.equal(studs.quantity, 16);
  assert.equal(plates.quantity, 60);
  assert.equal(kingStudMaterialForOpening(snapshot.calculations, "O-001")?.quantity, 2);
}

describe("live Claude wall+opening relationship proof", { skip: !RUN_LIVE }, () => {
  it(
    "extracts and resolves explicit O-001 in Wall W-001 through live Claude",
    { timeout: 240_000 },
    async () => {
      assert.equal(
        isAnthropicConfigured(),
        true,
        "TAKEOFF_LIVE_CLAUDE=1 requires ANTHROPIC_API_KEY.",
      );

      const artifactRoot = await mkdtemp(
        path.join(tmpdir(), "takeoff-bot-live-opening-relationship-"),
      );

      try {
        const snapshot = await runLiveWallOpeningPipeline(
          FIXTURE_RELATIONSHIP,
          "live-proof-w001-o001-relationship",
          artifactRoot,
        );

        assert.equal(snapshot.pageText, WALL_O001_MIXED_TEXT);
        assert.match(snapshot.pageText, /O-001 in Wall W-001/);

        assertWallOpeningRelationshipEvidence(snapshot);
        assertWallOpeningRelationshipResolution(snapshot);

        const wallEvidenceIds = evidenceIdsForSubject(snapshot.evidence, "W-001");
        const openingEvidenceIds = evidenceIdsForSubject(snapshot.evidence, "O-001");
        assertNoWallOpeningTraceContamination(
          snapshot.wallFraming,
          snapshot.openings,
          wallEvidenceIds,
          openingEvidenceIds,
        );

        assert.ok(
          validationResultsForObject(snapshot.validation, "WS-001").some(
            (entry) =>
              entry.ruleId === WALL_FRAMING_RULE_IDS.geometryLengthResolved &&
              entry.outcome === "passed",
          ),
        );
        assert.ok(
          validationResultsForObject(snapshot.validation, "O-001").some(
            (entry) =>
              entry.ruleId === OPENINGS_RULE_IDS.parentResolved &&
              entry.outcome === "passed",
          ),
        );
        assert.ok(
          validationResultsForObject(snapshot.validation, "O-001").some(
            (entry) =>
              entry.ruleId === OPENINGS_RULE_IDS.parentWallResolved &&
              entry.outcome === "passed",
          ),
        );

        assertWallQuantitiesUnchanged(snapshot);
        assert.deepEqual(snapshot.takeoff.openingIds, ["O-001"]);
        assert.equal(snapshot.takeoff.summary.openingCount, 1);
        assert.equal(snapshot.takeoff.summary.materialLineItemCount, 3);
      } finally {
        await rm(artifactRoot, { recursive: true, force: true });
      }
    },
  );
});
