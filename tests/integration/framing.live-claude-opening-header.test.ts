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
import { WALL_O001_HDR001_MIXED_TEXT } from "../fixtures/wallOpeningHeaderFixtureLines.js";
import {
  kingStudMaterialForOpening,
  evidenceForSubjectKind,
  evidenceIdsForSubject,
  hasCandidateForSubject,
  isGroundedInPageText,
  memberMaterialForObject,
  openingById,
  plateMaterialForSegment,
  snapshotLiveFramingPipeline,
  studMaterialForSegment,
  type LiveFramingPipelineSnapshot,
  validationResultsForObject,
} from "./liveFramingProofHelpers.js";

const RUN_LIVE = process.env.TAKEOFF_LIVE_CLAUDE === "1";
const FIXTURE_PDF = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/wall-w001-o001-hdr001-text-layer.pdf",
);

async function runLivePipeline(projectId: string, artifactRoot: string) {
  const planIndex = await indexPlan(FIXTURE_PDF);
  const pageText = planIndex.pages.map((page) => page.textContent).join("\n");
  const runner = new PipelineRunner(new ArtifactStore(artifactRoot));
  const result = await runner.run({
    projectId,
    pdfPath: FIXTURE_PDF,
    scopeName: "framing",
    planIndex,
    useMockAi: false,
    stages: createFramingStages(),
  });

  assert.equal(result.success, true, result.errors.join("\n"));
  return snapshotLiveFramingPipeline(pageText, result);
}

function assertLiveEvidence(snapshot: LiveFramingPipelineSnapshot) {
  for (const record of snapshot.evidence) {
    assert.ok(
      isGroundedInPageText(record.originalText, snapshot.pageText),
      `Evidence ${record.id} originalText is not grounded: ${record.originalText}`,
    );
  }

  assert.ok(evidenceForSubjectKind(snapshot.evidence, "wall", "W-001").length > 0);
  assert.ok(evidenceForSubjectKind(snapshot.evidence, "opening", "O-001").length > 0);
  assert.ok(
    evidenceForSubjectKind(snapshot.evidence, "structural-member", "HDR-001").length > 0,
  );

  assert.equal(
    hasCandidateForSubject(snapshot.evidence, "O-001", "parentWallTag", "W-001"),
    true,
  );
  assert.equal(
    hasCandidateForSubject(snapshot.evidence, "HDR-001", "supportedOpeningTag", "O-001") ||
      hasCandidateForSubject(snapshot.evidence, "O-001", "headerMemberTag", "HDR-001"),
    true,
  );
}

function assertLiveGraph(snapshot: LiveFramingPipelineSnapshot) {
  assert.equal(snapshot.wallFraming.walls[0]?.id, "W-001");
  assert.equal(snapshot.wallFraming.segments[0]?.id, "WS-001");
  assert.deepEqual(snapshot.wallFraming.segments[0]?.openingIds, ["O-001"]);

  const opening = openingById(snapshot.openings, "O-001");
  assert.ok(opening);
  assert.equal(opening.parentWallId, "W-001");
  assert.equal(opening.parentObjectId, "WS-001");
  assert.equal(opening.headerMemberId, "SM-HDR-001");

  const member = snapshot.structuralMembers.structuralMembers[0];
  assert.ok(member);
  assert.equal(member.id, "SM-HDR-001");
  assert.deepEqual(member.supportedObjectIds, ["O-001"]);
}

describe("live Claude wall+opening+header relationship proof", { skip: !RUN_LIVE }, () => {
  it(
    "extracts and resolves explicit W-001, O-001, and HDR-001 relationships through live Claude",
    { timeout: 300_000 },
    async () => {
      assert.equal(
        isAnthropicConfigured(),
        true,
        "TAKEOFF_LIVE_CLAUDE=1 requires ANTHROPIC_API_KEY.",
      );

      const artifactRoot = await mkdtemp(
        path.join(tmpdir(), "takeoff-bot-live-opening-header-"),
      );

      try {
        const snapshot = await runLivePipeline(
          "live-proof-w001-o001-hdr001-relationship",
          artifactRoot,
        );

        assert.equal(snapshot.pageText, WALL_O001_HDR001_MIXED_TEXT);
        assert.match(snapshot.pageText, /Header HDR-001 at Opening O-001/);

        assertLiveEvidence(snapshot);
        assertLiveGraph(snapshot);

        const wallEvidenceIds = evidenceIdsForSubject(snapshot.evidence, "W-001");
        const openingEvidenceIds = evidenceIdsForSubject(snapshot.evidence, "O-001");
        const memberEvidenceIds = evidenceIdsForSubject(snapshot.evidence, "HDR-001");
        assert.ok(wallEvidenceIds.length > 0);
        assert.ok(openingEvidenceIds.length > 0);
        assert.ok(memberEvidenceIds.length > 0);

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
              entry.ruleId === OPENINGS_RULE_IDS.headerReferenceResolved &&
              entry.outcome === "passed",
          ),
        );
        assert.ok(
          validationResultsForObject(snapshot.validation, "WS-001").some(
            (entry) =>
              entry.ruleId === WALL_FRAMING_RULE_IDS.geometryLengthResolved &&
              entry.outcome === "passed",
          ),
        );

        const studs = studMaterialForSegment(snapshot.calculations, "WS-001");
        const plates = plateMaterialForSegment(snapshot.calculations, "WS-001");
        const header = memberMaterialForObject(snapshot.calculations, "SM-HDR-001");
        assert.equal(studs?.quantity, 16);
        assert.equal(plates?.quantity, 60);
        assert.equal(header?.quantity, 6);
        assert.equal(kingStudMaterialForOpening(snapshot.calculations, "O-001")?.quantity, 2);
        assert.equal(snapshot.takeoff.summary.materialLineItemCount, 7);
      } finally {
        await rm(artifactRoot, { recursive: true, force: true });
      }
    },
  );
});
