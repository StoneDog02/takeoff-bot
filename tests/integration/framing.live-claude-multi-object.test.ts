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
import { createOpeningRoughSillSizeAssumptionId } from "../../src/scopes/framing/calculators/createOpeningRoughSillSizeAssumption.js";
import { createFramingStages } from "../../src/scopes/framing/stages/createFramingStages.js";
import {
  OPENINGS_RULE_IDS,
  OPENING_QUANTITY_KEYS,
  STRUCTURAL_MEMBER_QUANTITY_KEYS,
  WALL_QUANTITY_KEYS,
} from "../../src/scopes/framing/validators/rule-ids.js";
import {
  MULTI_OBJECT_LIVE_EXPECTED,
  WALL_MULTI_OBJECT_FRAMING_TEXT,
} from "../fixtures/wallMultiObjectFramingFixtureLines.js";
import {
  assertNoCrossWallContamination,
  candidatesForSubjectProperty,
  evidenceForSubjectKind,
  hasCandidateForSubject,
  isGroundedInPageText,
  kingStudMaterialForOpening,
  materialLineItemId,
  memberMaterialForObject,
  openingById,
  plateMaterialForSegment,
  readCanonicalOpeningsFromDisk,
  readCanonicalStructuralMembersFromDisk,
  readCanonicalWallFramingFromDisk,
  roughSillMaterialForOpening,
  segmentById,
  semanticCandidateSets,
  snapshotLiveFramingPipeline,
  studMaterialForSegment,
  TWO_WALL_W001_VALUES,
  TWO_WALL_W002_VALUES,
  type LiveFramingPipelineSnapshot,
  validationResultsForObject,
  wallById,
} from "./liveFramingProofHelpers.js";

const RUN_LIVE = process.env.TAKEOFF_LIVE_CLAUDE === "1";
const FIXTURE_PDF = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/wall-w001-w002-o001-o002-o003-hdr001-hdr002-text-layer.pdf",
);

const EXPECTED_SUBJECT_KEYS = {
  wall: ["W-001", "W-002"],
  opening: ["O-001", "O-002", "O-003"],
  "structural-member": ["HDR-001", "HDR-002"],
} as const;

const W001_REQUIRED = [
  { propertyPath: "wallType", candidateValue: "wood stud wall" },
  { propertyPath: "lengthFeet", candidateValue: 20 },
  { propertyPath: "assembly.studSize", candidateValue: "2x4" },
  { propertyPath: "assembly.studSpacingInches", candidateValue: 16 },
  { propertyPath: "assembly.heightFeet", candidateValue: 8 },
  { propertyPath: "assembly.plateCount", candidateValue: 3 },
] as const;

const W002_REQUIRED = [
  { propertyPath: "wallType", candidateValue: "wood stud wall" },
  { propertyPath: "lengthFeet", candidateValue: 12 },
  { propertyPath: "assembly.studSize", candidateValue: "2x6" },
  { propertyPath: "assembly.studSpacingInches", candidateValue: 24 },
  { propertyPath: "assembly.heightFeet", candidateValue: 9 },
  { propertyPath: "assembly.plateCount", candidateValue: 2 },
] as const;

const OPENING_REQUIRED: Record<
  string,
  readonly { propertyPath: string; candidateValue: string | number }[]
> = {
  "O-001": [
    { propertyPath: "category", candidateValue: "window" },
    { propertyPath: "parentWallTag", candidateValue: "W-001" },
    { propertyPath: "dimensions.nominalWidthFeet", candidateValue: 3 },
    { propertyPath: "dimensions.nominalHeightFeet", candidateValue: 4 },
    { propertyPath: "dimensions.roughWidthFeet", candidateValue: 3.5 },
    { propertyPath: "dimensions.roughHeightFeet", candidateValue: 4.5 },
    { propertyPath: "quantity", candidateValue: 1 },
    { propertyPath: "kingStudCount", candidateValue: 3 },
    { propertyPath: "headerMemberTag", candidateValue: "HDR-001" },
  ],
  "O-002": [
    { propertyPath: "category", candidateValue: "window" },
    { propertyPath: "parentWallTag", candidateValue: "W-001" },
    { propertyPath: "dimensions.nominalWidthFeet", candidateValue: 4 },
    { propertyPath: "dimensions.nominalHeightFeet", candidateValue: 5 },
    { propertyPath: "dimensions.roughWidthFeet", candidateValue: 4 },
    { propertyPath: "dimensions.roughHeightFeet", candidateValue: 5.5 },
    { propertyPath: "quantity", candidateValue: 1 },
  ],
  "O-003": [
    { propertyPath: "category", candidateValue: "door" },
    { propertyPath: "parentWallTag", candidateValue: "W-002" },
    { propertyPath: "dimensions.nominalWidthFeet", candidateValue: 3 },
    { propertyPath: "dimensions.nominalHeightFeet", candidateValue: 7 },
    { propertyPath: "dimensions.roughWidthFeet", candidateValue: 3.25 },
    { propertyPath: "dimensions.roughHeightFeet", candidateValue: 7.5 },
    { propertyPath: "quantity", candidateValue: 1 },
    { propertyPath: "headerMemberTag", candidateValue: "HDR-002" },
  ],
};

const HEADER_REQUIRED: Record<
  string,
  readonly { propertyPath: string; candidateValue: string | number }[]
> = {
  "HDR-001": [
    { propertyPath: "category", candidateValue: "header" },
    { propertyPath: "materialType", candidateValue: "lvl" },
    { propertyPath: "size", candidateValue: "1.75x11.875" },
    { propertyPath: "lengthFeet", candidateValue: 6 },
    { propertyPath: "quantity", candidateValue: 1 },
    { propertyPath: "supportedOpeningTag", candidateValue: "O-001" },
  ],
  "HDR-002": [
    { propertyPath: "category", candidateValue: "header" },
    { propertyPath: "materialType", candidateValue: "dimensional-lumber" },
    { propertyPath: "size", candidateValue: "2x12" },
    { propertyPath: "lengthFeet", candidateValue: 8 },
    { propertyPath: "quantity", candidateValue: 1 },
    { propertyPath: "supportedOpeningTag", candidateValue: "O-003" },
  ],
};

async function runLiveMultiObjectPipeline(projectId: string, artifactRoot: string) {
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
  assert.equal(result.errors.length, 0);
  assert.equal(result.stageResults.length, 12);

  return snapshotLiveFramingPipeline(pageText, result);
}

function assertNoPhantomSubjects(snapshot: LiveFramingPipelineSnapshot) {
  for (const [subjectKind, allowedKeys] of Object.entries(EXPECTED_SUBJECT_KEYS)) {
    const observed = [
      ...new Set(
        snapshot.evidence
          .filter((record) => record.subjectKind === subjectKind)
          .map((record) => record.subjectKey),
      ),
    ].sort();

    assert.deepEqual(
      observed,
      [...allowedKeys].sort(),
      `Unexpected ${subjectKind} subject keys in live Evidence`,
    );
  }
}

function assertSemanticEvidence(snapshot: LiveFramingPipelineSnapshot) {
  for (const record of snapshot.evidence) {
    assert.ok(
      isGroundedInPageText(record.originalText, snapshot.pageText),
      `Evidence ${record.id} originalText is not grounded: ${record.originalText}`,
    );
    assert.equal(
      ["wall", "opening", "structural-member"].includes(record.subjectKind),
      true,
      `Unexpected subjectKind ${record.subjectKind} on ${record.id}`,
    );
  }

  assert.ok(evidenceForSubjectKind(snapshot.evidence, "wall", "W-001").length > 0);
  assert.ok(evidenceForSubjectKind(snapshot.evidence, "wall", "W-002").length > 0);
  assert.ok(evidenceForSubjectKind(snapshot.evidence, "opening", "O-001").length > 0);
  assert.ok(evidenceForSubjectKind(snapshot.evidence, "opening", "O-002").length > 0);
  assert.ok(evidenceForSubjectKind(snapshot.evidence, "opening", "O-003").length > 0);
  assert.ok(
    evidenceForSubjectKind(snapshot.evidence, "structural-member", "HDR-001").length > 0,
  );
  assert.ok(
    evidenceForSubjectKind(snapshot.evidence, "structural-member", "HDR-002").length > 0,
  );

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

  for (const [subjectKey, requiredFacts] of Object.entries(OPENING_REQUIRED)) {
    for (const required of requiredFacts) {
      assert.equal(
        hasCandidateForSubject(
          snapshot.evidence,
          subjectKey,
          required.propertyPath,
          required.candidateValue,
        ),
        true,
        `Missing ${subjectKey} ${required.propertyPath}=${required.candidateValue}`,
      );
    }
  }

  for (const [subjectKey, requiredFacts] of Object.entries(HEADER_REQUIRED)) {
    for (const required of requiredFacts) {
      assert.equal(
        hasCandidateForSubject(
          snapshot.evidence,
          subjectKey,
          required.propertyPath,
          required.candidateValue,
        ),
        true,
        `Missing ${subjectKey} ${required.propertyPath}=${required.candidateValue}`,
      );
    }
  }

  assert.equal(
    hasCandidateForSubject(snapshot.evidence, "O-002", "headerMemberTag", "HDR-001"),
    false,
  );
  assert.equal(
    hasCandidateForSubject(snapshot.evidence, "O-002", "headerMemberTag", "HDR-002"),
    false,
  );
  assert.equal(
    hasCandidateForSubject(snapshot.evidence, "HDR-001", "supportedOpeningTag", "O-003"),
    false,
  );
  assert.equal(
    hasCandidateForSubject(snapshot.evidence, "HDR-002", "supportedOpeningTag", "O-001"),
    false,
  );

  assertNoCrossWallContamination(
    snapshot.evidence,
    "W-001",
    "W-002",
    TWO_WALL_W001_VALUES,
    TWO_WALL_W002_VALUES,
  );
  assertNoPhantomSubjects(snapshot);

  const semantic = semanticCandidateSets(snapshot.evidence);
  assert.ok(semantic.has("opening:O-001:kingStudCount"));
  assert.ok(!semantic.has("opening:O-002:kingStudCount"));
}

function assertResolvedGraph(snapshot: LiveFramingPipelineSnapshot) {
  assert.deepEqual(
    snapshot.wallFraming.walls.map((wall) => wall.id),
    ["W-001", "W-002"],
  );
  assert.deepEqual(
    snapshot.wallFraming.segments.map((segment) => segment.id),
    ["WS-001", "WS-002"],
  );
  assert.deepEqual(
    snapshot.openings.openings.map((opening) => opening.id),
    ["O-001", "O-002", "O-003"],
  );
  assert.deepEqual(
    snapshot.structuralMembers.structuralMembers.map((member) => member.id),
    ["SM-HDR-001", "SM-HDR-002"],
  );

  const segment001 = segmentById(snapshot.wallFraming, "WS-001");
  const segment002 = segmentById(snapshot.wallFraming, "WS-002");
  assert.ok(segment001 && segment002);
  assert.deepEqual(segment001.openingIds, ["O-001", "O-002"]);
  assert.deepEqual(segment002.openingIds, ["O-003"]);

  const o001 = openingById(snapshot.openings, "O-001");
  const o002 = openingById(snapshot.openings, "O-002");
  const o003 = openingById(snapshot.openings, "O-003");
  assert.ok(o001 && o002 && o003);

  assert.equal(o001.parentWallId, "W-001");
  assert.equal(o001.parentObjectId, "WS-001");
  assert.equal(o001.headerMemberId, "SM-HDR-001");
  assert.equal(o001.kingStudCount, 3);
  assert.equal(o001.dimensions.roughWidthFeet, 3.5);

  assert.equal(o002.parentWallId, "W-001");
  assert.equal(o002.parentObjectId, "WS-001");
  assert.equal(o002.headerMemberId, null);
  assert.equal(o002.dimensions.roughWidthFeet, 4);

  assert.equal(o003.parentWallId, "W-002");
  assert.equal(o003.parentObjectId, "WS-002");
  assert.equal(o003.headerMemberId, "SM-HDR-002");

  const hdr001 = snapshot.structuralMembers.structuralMembers.find(
    (member) => member.id === "SM-HDR-001",
  );
  const hdr002 = snapshot.structuralMembers.structuralMembers.find(
    (member) => member.id === "SM-HDR-002",
  );
  assert.ok(hdr001 && hdr002);
  assert.deepEqual(hdr001.supportedObjectIds, ["O-001"]);
  assert.deepEqual(hdr002.supportedObjectIds, ["O-003"]);

  assert.equal(wallById(snapshot.wallFraming, "W-001")?.assembly.studSize, "2x4");
  assert.equal(wallById(snapshot.wallFraming, "W-002")?.assembly.studSize, "2x6");
}

function assertAssumptionPaths(snapshot: LiveFramingPipelineSnapshot) {
  const kingsO001 = kingStudMaterialForOpening(snapshot.calculations, "O-001");
  const kingsO002 = kingStudMaterialForOpening(snapshot.calculations, "O-002");
  const kingsO003 = kingStudMaterialForOpening(snapshot.calculations, "O-003");
  const sillO001 = roughSillMaterialForOpening(snapshot.calculations, "O-001");
  const sillO002 = roughSillMaterialForOpening(snapshot.calculations, "O-002");

  assert.equal(kingsO001?.assumptionIds.length, 0);
  assert.ok(
    kingsO002?.assumptionIds.includes(createOpeningKingStudCountAssumptionId("O-002")),
  );
  assert.ok(
    kingsO003?.assumptionIds.includes(createOpeningKingStudCountAssumptionId("O-003")),
  );
  assert.ok(
    sillO001?.assumptionIds.includes(createOpeningRoughSillSizeAssumptionId("O-001")),
  );
  assert.ok(
    sillO002?.assumptionIds.includes(createOpeningRoughSillSizeAssumptionId("O-002")),
  );

  assert.ok(
    !kingsO002?.assumptionIds.includes(createOpeningKingStudCountAssumptionId("O-001")),
  );
  assert.ok(
    !sillO002?.assumptionIds.includes(createOpeningRoughSillSizeAssumptionId("O-001")),
  );

  const kingCandidatesO001 = candidatesForSubjectProperty(
    snapshot.evidence,
    "O-001",
    "kingStudCount",
  ).filter((value): value is number => typeof value === "number");
  assert.ok(kingCandidatesO001.includes(3));

  const kingCandidatesO002 = candidatesForSubjectProperty(
    snapshot.evidence,
    "O-002",
    "kingStudCount",
  );
  assert.equal(kingCandidatesO002.length, 0);
}

function assertMaterials(snapshot: LiveFramingPipelineSnapshot) {
  const expected = MULTI_OBJECT_LIVE_EXPECTED;

  for (const [segmentId, quantities] of Object.entries(expected.walls)) {
    assert.equal(
      studMaterialForSegment(snapshot.calculations, segmentId)?.quantity,
      quantities.studs,
    );
    assert.equal(
      plateMaterialForSegment(snapshot.calculations, segmentId)?.quantity,
      quantities.plates,
    );
  }

  for (const [openingId, quantities] of Object.entries(expected.openings)) {
    assert.equal(
      kingStudMaterialForOpening(snapshot.calculations, openingId)?.quantity,
      quantities.kingStuds,
    );
    const sill = roughSillMaterialForOpening(snapshot.calculations, openingId);
    if (quantities.roughSill === null) {
      assert.equal(sill, undefined);
    } else {
      assert.equal(sill?.quantity, quantities.roughSill);
    }
  }

  for (const [memberId, linearFeet] of Object.entries(expected.headers)) {
    assert.equal(
      memberMaterialForObject(snapshot.calculations, memberId)?.quantity,
      linearFeet,
    );
  }

  assert.equal(
    snapshot.calculations.materials.some((item) =>
      item.id.includes("jack") || item.description.toLowerCase().includes("cripple"),
    ),
    false,
  );
}

async function assertPersistedCanonicalState(snapshot: LiveFramingPipelineSnapshot) {
  const reloadedWallFraming = await readCanonicalWallFramingFromDisk(
    snapshot.stageResults,
  );
  const reloadedOpenings = await readCanonicalOpeningsFromDisk(snapshot.stageResults);
  const reloadedMembers = await readCanonicalStructuralMembersFromDisk(
    snapshot.stageResults,
  );

  assert.deepEqual(reloadedWallFraming, snapshot.wallFraming);
  assert.deepEqual(reloadedOpenings, snapshot.openings);
  assert.deepEqual(reloadedMembers, snapshot.structuralMembers);
}

describe("live Claude multi-object framing system proof", { skip: !RUN_LIVE }, () => {
  it(
    "extracts and composes a realistic multi-object framing slice through Stage 12 without Evidence injection",
    { timeout: 420_000 },
    async () => {
      assert.equal(
        isAnthropicConfigured(),
        true,
        "TAKEOFF_LIVE_CLAUDE=1 requires ANTHROPIC_API_KEY.",
      );

      const artifactRoot = await mkdtemp(
        path.join(tmpdir(), "takeoff-bot-live-multi-object-"),
      );

      try {
        const indexed = await indexPlan(FIXTURE_PDF);
        assert.equal(indexed.totalPages, 2);
        assert.equal(
          indexed.pages.map((page) => page.textContent).join("\n"),
          WALL_MULTI_OBJECT_FRAMING_TEXT,
        );

        const snapshot = await runLiveMultiObjectPipeline(
          "live-proof-multi-object-framing",
          artifactRoot,
        );

        assert.equal(snapshot.pageText, WALL_MULTI_OBJECT_FRAMING_TEXT);
        assertSemanticEvidence(snapshot);
        assertResolvedGraph(snapshot);
        await assertPersistedCanonicalState(snapshot);

        assert.ok(
          validationResultsForObject(snapshot.validation, "O-001").some(
            (entry) =>
              entry.ruleId === OPENINGS_RULE_IDS.headerReferenceResolved &&
              entry.outcome === "passed",
          ),
        );
        assert.ok(
          validationResultsForObject(snapshot.validation, "O-003").some(
            (entry) =>
              entry.ruleId === OPENINGS_RULE_IDS.headerReferenceResolved &&
              entry.outcome === "passed",
          ),
        );
        assert.ok(
          validationResultsForObject(snapshot.validation, "O-002").some(
            (entry) =>
              entry.ruleId === OPENINGS_RULE_IDS.kingStudCountDefault &&
              entry.outcome === "failed",
          ),
        );

        assertAssumptionPaths(snapshot);
        assertMaterials(snapshot);

        const summary = MULTI_OBJECT_LIVE_EXPECTED.summary;
        assert.deepEqual(snapshot.takeoff.summary.wallCount, summary.wallCount);
        assert.deepEqual(snapshot.takeoff.summary.openingCount, summary.openingCount);
        assert.deepEqual(
          snapshot.takeoff.summary.structuralMemberCount,
          summary.structuralMemberCount,
        );
        assert.deepEqual(
          snapshot.takeoff.summary.materialLineItemCount,
          summary.materialLineItemCount,
        );
        assert.deepEqual(snapshot.takeoff.summary.reviewItemCount, summary.reviewItemCount);
        assert.deepEqual(
          snapshot.takeoff.summary.validationIssueCount,
          summary.validationIssueCount,
        );
        assert.equal(snapshot.calculations.assumptions.length, summary.assumptionCount);

        assert.deepEqual(
          snapshot.takeoff.materials.map((item) => item.id).sort(),
          snapshot.calculations.materials.map((item) => item.id).sort(),
        );

        const materialIds = snapshot.calculations.materials.map((item) => item.id).sort();
        assert.deepEqual(materialIds, [
          materialLineItemId(OPENING_QUANTITY_KEYS.kingStuds, "O-001"),
          materialLineItemId(OPENING_QUANTITY_KEYS.kingStuds, "O-002"),
          materialLineItemId(OPENING_QUANTITY_KEYS.kingStuds, "O-003"),
          materialLineItemId(OPENING_QUANTITY_KEYS.roughSill, "O-001"),
          materialLineItemId(OPENING_QUANTITY_KEYS.roughSill, "O-002"),
          materialLineItemId(STRUCTURAL_MEMBER_QUANTITY_KEYS.material, "SM-HDR-001"),
          materialLineItemId(STRUCTURAL_MEMBER_QUANTITY_KEYS.material, "SM-HDR-002"),
          materialLineItemId(WALL_QUANTITY_KEYS.plates, "WS-001"),
          materialLineItemId(WALL_QUANTITY_KEYS.plates, "WS-002"),
          materialLineItemId(WALL_QUANTITY_KEYS.studs, "WS-001"),
          materialLineItemId(WALL_QUANTITY_KEYS.studs, "WS-002"),
        ].sort());
      } finally {
        await rm(artifactRoot, { recursive: true, force: true });
      }
    },
  );
});
