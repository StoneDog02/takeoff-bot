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
  STRUCTURAL_MEMBER_RULE_IDS,
  WALL_FRAMING_RULE_IDS,
} from "../../src/scopes/framing/validators/rule-ids.js";
import {
  mixedHeaderLengthLineIndexes,
  WALL_HDR001_MIXED_8FT_TEXT,
  WALL_HDR001_MIXED_TEXT,
} from "../fixtures/wallHeaderMixedFixtureLines.js";
import {
  assertNoCrossDomainTraceContamination,
  evidenceForSubject,
  evidenceIdsForSubject,
  hasCandidateForSubject,
  isGroundedInPageText,
  lengthFeetCandidatesForSubject,
  memberMaterialForObject,
  plateMaterialForSegment,
  semanticEvidenceDifferences,
  snapshotLiveFramingPipeline,
  studMaterialForSegment,
  type LiveFramingPipelineSnapshot,
  validationResultsForObject,
  validationRuleOutcomes,
} from "./liveFramingProofHelpers.js";

const RUN_LIVE = process.env.TAKEOFF_LIVE_CLAUDE === "1";
const FIXTURE_CONTROL = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/wall-w001-hdr001-text-layer.pdf",
);
const FIXTURE_MUTATION = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/wall-w001-hdr001-8ft-text-layer.pdf",
);

const WALL_PROPERTIES = [
  "wallType",
  "lengthFeet",
  "assembly.studSize",
  "assembly.studSpacingInches",
  "assembly.heightFeet",
  "assembly.plateCount",
] as const;

const MEMBER_PROPERTIES = [
  "category",
  "materialType",
  "size",
  "lengthFeet",
  "quantity",
  "location",
] as const;

async function runLiveMixedPipeline(
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
  assert.equal(result.stageResults.length, 12);

  return snapshotLiveFramingPipeline(pageText, result);
}

function assertMixedDomainEvidence(
  snapshot: LiveFramingPipelineSnapshot,
  expectedHeaderLengthFeet: number,
) {
  for (const record of snapshot.evidence) {
    assert.ok(
      isGroundedInPageText(record.originalText, snapshot.pageText),
      `Evidence ${record.id} originalText is not grounded: ${record.originalText}`,
    );
  }

  const wallEvidence = evidenceForSubject(snapshot.evidence, "W-001");
  const memberEvidence = evidenceForSubject(snapshot.evidence, "HDR-001");
  assert.ok(wallEvidence.length > 0);
  assert.ok(memberEvidence.length > 0);
  assert.equal(
    wallEvidence.every((record) => record.subjectKind === "wall"),
    true,
  );
  assert.equal(
    memberEvidence.every((record) => record.subjectKind === "structural-member"),
    true,
  );

  for (const propertyPath of WALL_PROPERTIES) {
    assert.ok(
      wallEvidence.some((record) => record.propertyPath === propertyPath),
      `Missing live wall Evidence for ${propertyPath}`,
    );
  }

  assert.equal(
    hasCandidateForSubject(snapshot.evidence, "W-001", "wallType", "wood stud wall"),
    true,
  );
  assert.equal(
    hasCandidateForSubject(snapshot.evidence, "W-001", "lengthFeet", 20),
    true,
  );
  assert.equal(
    hasCandidateForSubject(snapshot.evidence, "HDR-001", "category", "header"),
    true,
  );
  assert.equal(
    hasCandidateForSubject(snapshot.evidence, "HDR-001", "materialType", "lvl"),
    true,
  );
  assert.equal(
    hasCandidateForSubject(snapshot.evidence, "HDR-001", "size", "1.75x11.875"),
    true,
  );
  assert.equal(
    hasCandidateForSubject(
      snapshot.evidence,
      "HDR-001",
      "lengthFeet",
      expectedHeaderLengthFeet,
    ),
    true,
  );
  assert.equal(
    hasCandidateForSubject(snapshot.evidence, "HDR-001", "quantity", 1),
    true,
  );

  for (const propertyPath of MEMBER_PROPERTIES) {
    assert.ok(
      memberEvidence.some((record) => record.propertyPath === propertyPath),
      `Missing live member Evidence for ${propertyPath}`,
    );
  }

  assert.deepEqual(
    lengthFeetCandidatesForSubject(
      snapshot.evidence,
      "structural-member",
      "HDR-001",
    ),
    [expectedHeaderLengthFeet],
  );
}

function assertMixedDomainResolution(
  snapshot: LiveFramingPipelineSnapshot,
  expectedHeaderLengthFeet: number,
) {
  assert.equal(snapshot.wallFraming.walls.length, 1);
  assert.equal(snapshot.wallFraming.segments.length, 1);
  assert.equal(snapshot.wallFraming.walls[0]?.id, "W-001");
  assert.equal(snapshot.wallFraming.segments[0]?.id, "WS-001");
  assert.equal(snapshot.wallFraming.segments[0]?.lengthFeet, 20);

  assert.equal(snapshot.structuralMembers.structuralMembers.length, 1);
  const member = snapshot.structuralMembers.structuralMembers[0];
  assert.equal(member?.id, "SM-HDR-001");
  assert.equal(member?.category, "header");
  assert.equal(member?.materialType, "lvl");
  assert.equal(member?.size, "1.75x11.875");
  assert.equal(member?.lengthFeet, expectedHeaderLengthFeet);
  assert.equal(member?.quantity, 1);

  assert.equal(
    snapshot.wallFraming.walls.some((wall) => wall.id === "SM-HDR-001"),
    false,
  );
  assert.equal(
    snapshot.structuralMembers.structuralMembers.some(
      (entry) => entry.id === "W-001",
    ),
    false,
  );
}

function assertMixedDomainMaterials(
  snapshot: LiveFramingPipelineSnapshot,
  expectedHeaderLinearFeet: number,
) {
  const studs = studMaterialForSegment(snapshot.calculations, "WS-001");
  const plates = plateMaterialForSegment(snapshot.calculations, "WS-001");
  const header = memberMaterialForObject(snapshot.calculations, "SM-HDR-001");
  assert.ok(studs);
  assert.ok(plates);
  assert.ok(header);
  assert.equal(studs.quantity, 16);
  assert.equal(plates.quantity, 60);
  assert.equal(header.quantity, expectedHeaderLinearFeet);
  assert.equal(header.category, "engineered-wood");
  assert.deepEqual(studs.sourceObjectIds.sort(), ["W-001", "WS-001"]);
  assert.deepEqual(plates.sourceObjectIds.sort(), ["W-001", "WS-001"]);
  assert.deepEqual(header.sourceObjectIds, ["SM-HDR-001"]);

  assert.equal(snapshot.takeoff.summary.materialLineItemCount, 3);
  assert.equal(snapshot.takeoff.summary.wallCount, 1);
  assert.equal(snapshot.takeoff.summary.structuralMemberCount, 1);
}

function assertMixedDomainIsolation(snapshot: LiveFramingPipelineSnapshot) {
  const wallEvidenceIds = evidenceIdsForSubject(snapshot.evidence, "W-001");
  const memberEvidenceIds = evidenceIdsForSubject(snapshot.evidence, "HDR-001");

  assertNoCrossDomainTraceContamination(
    snapshot.wallFraming,
    snapshot.structuralMembers,
    wallEvidenceIds,
    memberEvidenceIds,
  );

  assert.equal(
    snapshot.wallFraming.walls.some((wall) => wall.id.includes("HDR")),
    false,
  );
  assert.equal(
    snapshot.structuralMembers.structuralMembers.some((member) =>
      member.id.startsWith("W-"),
    ),
    false,
  );
}

function assertNoAssumptions(snapshot: LiveFramingPipelineSnapshot) {
  assert.equal(snapshot.wallFraming.walls[0]?.assumptionIds.length, 0);
  assert.equal(snapshot.wallFraming.segments[0]?.assumptionIds.length, 0);
  assert.equal(
    snapshot.structuralMembers.structuralMembers[0]?.assumptionIds.length,
    0,
  );
}

describe("live Claude mixed-domain framing proof", { skip: !RUN_LIVE }, () => {
  it(
    "extracts wall and header Evidence from the 6-ft control PDF",
    { timeout: 240_000 },
    async () => {
      assert.equal(
        isAnthropicConfigured(),
        true,
        "TAKEOFF_LIVE_CLAUDE=1 requires ANTHROPIC_API_KEY.",
      );

      const artifactRoot = await mkdtemp(
        path.join(tmpdir(), "takeoff-bot-live-mixed-control-"),
      );

      try {
        const snapshot = await runLiveMixedPipeline(
          FIXTURE_CONTROL,
          "live-proof-w001-hdr001-6ft",
          artifactRoot,
        );

        assert.equal(snapshot.pageText, WALL_HDR001_MIXED_TEXT);
        assertMixedDomainEvidence(snapshot, 6);
        assertMixedDomainResolution(snapshot, 6);
        assertMixedDomainIsolation(snapshot);
        assertNoAssumptions(snapshot);

        assert.ok(
          validationResultsForObject(snapshot.validation, "WS-001").some(
            (entry) =>
              entry.ruleId === WALL_FRAMING_RULE_IDS.geometryLengthResolved &&
              entry.outcome === "passed",
          ),
        );
        assert.ok(
          validationResultsForObject(snapshot.validation, "SM-HDR-001").some(
            (entry) =>
              entry.ruleId === STRUCTURAL_MEMBER_RULE_IDS.quantityResolved &&
              entry.outcome === "passed",
          ),
        );

        assertMixedDomainMaterials(snapshot, 6);

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
              evaluation.target.objectId === "SM-HDR-001",
          ),
        );
        assert.ok(
          snapshot.confidence.confidenceEvaluations.some(
            (evaluation) => evaluation.target.kind === "takeoff",
          ),
        );
      } finally {
        await rm(artifactRoot, { recursive: true, force: true });
      }
    },
  );

  it(
    "proves header length causality from 6 ft to 8 ft without changing wall quantities",
    { timeout: 360_000 },
    async () => {
      assert.equal(
        isAnthropicConfigured(),
        true,
        "TAKEOFF_LIVE_CLAUDE=1 requires ANTHROPIC_API_KEY.",
      );

      const artifactRoot = await mkdtemp(
        path.join(tmpdir(), "takeoff-bot-live-mixed-causality-"),
      );

      try {
        const controlIndex = await indexPlan(FIXTURE_CONTROL);
        const mutationIndex = await indexPlan(FIXTURE_MUTATION);
        const controlText = controlIndex.pages[0]?.textContent ?? "";
        const mutationText = mutationIndex.pages[0]?.textContent ?? "";

        assert.equal(controlText, WALL_HDR001_MIXED_TEXT);
        assert.equal(mutationText, WALL_HDR001_MIXED_8FT_TEXT);
        assert.notEqual(controlText, mutationText);
        assert.deepEqual(
          mixedHeaderLengthLineIndexes(controlText, mutationText),
          [11],
        );
        assert.equal(controlText.split("\n")[11], "Length: 6 ft");
        assert.equal(mutationText.split("\n")[11], "Length: 8 ft");

        const control = await runLiveMixedPipeline(
          FIXTURE_CONTROL,
          "live-proof-w001-hdr001-6ft-causality",
          artifactRoot,
        );
        const mutation = await runLiveMixedPipeline(
          FIXTURE_MUTATION,
          "live-proof-w001-hdr001-8ft-causality",
          artifactRoot,
        );

        assertMixedDomainEvidence(control, 6);
        assertMixedDomainEvidence(mutation, 8);

        const unexpectedSemanticDifferences = semanticEvidenceDifferences(
          control.evidence,
          mutation.evidence,
          ["structural-member:HDR-001:lengthFeet"],
        );
        assert.deepEqual(unexpectedSemanticDifferences, []);

        assertMixedDomainResolution(control, 6);
        assertMixedDomainResolution(mutation, 8);

        assert.equal(control.wallFraming.walls[0]?.id, mutation.wallFraming.walls[0]?.id);
        assert.equal(
          control.wallFraming.segments[0]?.id,
          mutation.wallFraming.segments[0]?.id,
        );
        assert.equal(
          control.wallFraming.walls[0]?.wallType,
          mutation.wallFraming.walls[0]?.wallType,
        );
        assert.equal(
          control.wallFraming.segments[0]?.lengthFeet,
          mutation.wallFraming.segments[0]?.lengthFeet,
        );
        assert.equal(
          control.structuralMembers.structuralMembers[0]?.id,
          mutation.structuralMembers.structuralMembers[0]?.id,
        );
        assert.equal(
          control.structuralMembers.structuralMembers[0]?.category,
          mutation.structuralMembers.structuralMembers[0]?.category,
        );
        assert.equal(
          control.structuralMembers.structuralMembers[0]?.materialType,
          mutation.structuralMembers.structuralMembers[0]?.materialType,
        );
        assert.equal(
          control.structuralMembers.structuralMembers[0]?.size,
          mutation.structuralMembers.structuralMembers[0]?.size,
        );
        assert.equal(
          control.structuralMembers.structuralMembers[0]?.quantity,
          mutation.structuralMembers.structuralMembers[0]?.quantity,
        );

        assertMixedDomainIsolation(control);
        assertMixedDomainIsolation(mutation);
        assertNoAssumptions(control);
        assertNoAssumptions(mutation);

        assert.deepEqual(
          validationRuleOutcomes(control.validation),
          validationRuleOutcomes(mutation.validation),
        );

        assertMixedDomainMaterials(control, 6);
        assertMixedDomainMaterials(mutation, 8);

        const controlHeader = memberMaterialForObject(
          control.calculations,
          "SM-HDR-001",
        );
        const mutationHeader = memberMaterialForObject(
          mutation.calculations,
          "SM-HDR-001",
        );
        assert.ok(controlHeader && mutationHeader);
        assert.equal(controlHeader.quantity, 6);
        assert.equal(mutationHeader.quantity, 8);
        assert.equal(
          controlHeader.canonicalClassification,
          mutationHeader.canonicalClassification,
        );

        assert.equal(
          studMaterialForSegment(control.calculations, "WS-001")?.quantity,
          studMaterialForSegment(mutation.calculations, "WS-001")?.quantity,
        );
        assert.equal(
          plateMaterialForSegment(control.calculations, "WS-001")?.quantity,
          plateMaterialForSegment(mutation.calculations, "WS-001")?.quantity,
        );
      } finally {
        await rm(artifactRoot, { recursive: true, force: true });
      }
    },
  );
});
