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
import { indexPlan } from "../../src/plans/indexPlan.js";
import {
  extractedFramingEvidenceArtifactSchema,
  finalFramingTakeoffArtifactSchema,
  structuralMembersArtifactSchema,
  wallFramingArtifactSchema,
  type ExtractedFramingEvidencePayload,
  type StructuralMembersPayload,
  type ValidationPayload,
  type WallFramingPayload,
} from "../../src/scopes/framing/schemas/framing-artifacts.schema.js";
import {
  createFramingStageArtifact,
  createFramingStages,
} from "../../src/scopes/framing/stages/createFramingStages.js";
import {
  WALL_FRAMING_RULE_IDS,
  WALL_QUANTITY_KEYS,
} from "../../src/scopes/framing/validators/rule-ids.js";

const WALL_FIXTURE_PDF = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/wall-w001-text-layer.pdf",
);

const complete = {
  status: "complete",
  percentage: 100,
  completedItems: 1,
  totalItems: 1,
} as const;

function resolvedTrace(propertyPath: string) {
  return {
    propertyPath,
    method: "explicit-project-value" as const,
    explanation: `${propertyPath} is explicit on the fixture.`,
    evidenceIds: ["E-W001-FRAMING"],
    assumptionIds: [] as string[],
    validationIssueIds: [] as string[],
    reviewItemIds: [] as string[],
  };
}

function buildFixtureWallFraming(
  overrides: {
    wall?: Partial<WallFramingPayload["walls"][number]>;
    segment?: Partial<WallFramingPayload["segments"][number]>;
  } = {},
): WallFramingPayload {
  return {
    walls: [
      {
        id: "W-001",
        objectType: "building-wall",
        completion: complete,
        reviewStatus: "no-review-required",
        blockingStatus: "not-blocked",
        evidenceIds: ["E-W001-CLASS"],
        assumptionIds: [],
        validationIssueIds: [],
        reviewItemIds: [],
        resolutionTraces: [
          resolvedTrace("assembly.studSpacingInches"),
          resolvedTrace("assembly.studSize"),
          resolvedTrace("assembly.plateCount"),
          resolvedTrace("assembly.heightFeet"),
        ],
        name: "Mock exterior wall W-001",
        level: "Level 1",
        wallType: "exterior-wood-stud-wall",
        location: "exterior",
        bearingStatus: "non-bearing",
        isShearOrBraced: false,
        fireRating: null,
        constructionPhase: "new",
        assembly: {
          material: "dimensional-lumber",
          studSize: "2x4",
          studSpacingInches: 16,
          heightFeet: 8,
          plateCount: 3,
          sheathing: null,
        },
        segmentIds: ["WS-001"],
        ...overrides.wall,
      },
    ],
    segments: [
      {
        id: "WS-001",
        objectType: "wall-segment",
        completion: complete,
        reviewStatus: "no-review-required",
        blockingStatus: "not-blocked",
        evidenceIds: ["E-W001-GEOMETRY"],
        assumptionIds: [],
        validationIssueIds: [],
        reviewItemIds: [],
        resolutionTraces: [resolvedTrace("lengthFeet")],
        parentWallId: "W-001",
        lengthFeet: 20,
        openingIds: [],
        ...overrides.segment,
      },
    ],
  };
}

function buildCalculableMember(): StructuralMembersPayload {
  return {
    structuralMembers: [
      {
        id: "SM-008",
        objectType: "structural-member",
        completion: complete,
        reviewStatus: "no-review-required",
        blockingStatus: "not-blocked",
        evidenceIds: ["E-008"],
        assumptionIds: [],
        validationIssueIds: [],
        reviewItemIds: [],
        resolutionTraces: [
          resolvedTrace("materialType"),
          resolvedTrace("size"),
          resolvedTrace("lengthFeet"),
          resolvedTrace("quantity"),
        ],
        category: "header",
        materialType: "lvl",
        size: "1.75x11.875",
        plyCount: null,
        lengthFeet: 6,
        quantity: 1,
        location: "W-001 window header",
        associatedObjectIds: [],
        supportedObjectIds: [],
        supportingObjectIds: [],
        connectorIds: [],
      },
    ],
  };
}

function replaceStage(
  stages: PipelineStage[],
  name: string,
  run: PipelineStage["run"],
): PipelineStage[] {
  return stages.map((stage) => (stage.name === name ? { ...stage, run } : stage));
}

function mapExtractedEvidence(
  stages: PipelineStage[],
  mapEvidence: (evidence: Evidence[]) => Evidence[],
): PipelineStage[] {
  const original = stages.find((stage) => stage.name === "extractedEvidence");
  assert.ok(original, "Expected extractedEvidence stage");

  return replaceStage(stages, "extractedEvidence", async (context) => {
    const artifact = await original.run(context);
    const payload = artifact.payload as ExtractedFramingEvidencePayload;
    return createFramingStageArtifact(
      context,
      5,
      extractedFramingEvidenceArtifactSchema,
      "extracted-framing-evidence",
      { evidence: mapEvidence(payload.evidence) },
      artifact.producer,
    );
  });
}

function withCalculableMember(stages: PipelineStage[]): PipelineStage[] {
  return replaceStage(stages, "structuralMembers", async (context) =>
    createFramingStageArtifact(
      context,
      8,
      structuralMembersArtifactSchema,
      "structural-members",
      buildCalculableMember(),
    ),
  );
}

async function runFramingPipeline(stages: PipelineStage[]) {
  const artifactRoot = await mkdtemp(path.join(tmpdir(), "takeoff-bot-test-"));
  const planIndex = await indexPlan(WALL_FIXTURE_PDF);
  const runner = new PipelineRunner(new ArtifactStore(artifactRoot));
  const result = await runner.run({
    projectId: "test-project",
    pdfPath: WALL_FIXTURE_PDF,
    scopeName: "framing",
    planIndex,
    useMockAi: true,
    stages,
  });

  return { artifactRoot, result };
}

function stageByName(
  result: Awaited<ReturnType<typeof runFramingPipeline>>["result"],
  name: string,
) {
  const stage = result.stageResults.find((entry) => entry.name === name);
  assert.ok(stage, `Expected stage ${name}`);
  return stage;
}

async function readArtifact(stagePath: string) {
  return JSON.parse(await readFile(stagePath, "utf8"));
}

function hasResolvedTrace(
  traces: Array<{ propertyPath: string; method: string }>,
  propertyPath: string,
) {
  return traces.some(
    (trace) =>
      trace.propertyPath === propertyPath &&
      trace.method === "explicit-project-value",
  );
}

describe("framing pipeline", () => {
  it("resolves Stage 6 from Evidence and calculates Evidence-driven quantities", async () => {
    const { artifactRoot, result } = await runFramingPipeline(
      createFramingStages(),
    );

    try {
      assert.equal(result.success, true);
      assert.equal(result.errors.length, 0);
      assert.equal(result.stageResults.length, 15);
      assert.deepEqual(
        result.stageResults.map((stage) => [stage.order, stage.name]),
        [
          [1, "verifiedPlanSet"],
          [2, "pageClassification"],
          [3, "planReadingOrder"],
          [4, "buildingAssemblies"],
          [5, "extractedEvidence"],
          [6, "wallFraming"],
          [7, "openings"],
          [8, "structuralMembers"],
          [9, "sheathing"],
          [10, "floorFraming"],
          [11, "roofFraming"],
          [12, "validation"],
          [13, "calculations"],
          [14, "confidence"],
          [15, "report"],
        ],
      );

      const extractedStage = stageByName(result, "extractedEvidence");
      const wallStage = stageByName(result, "wallFraming");
      const wallArtifact = await readArtifact(wallStage.artifactPath);
      const wall = wallArtifact.payload.walls[0];
      const segment = wallArtifact.payload.segments[0];

      assert.ok(wallArtifact.inputArtifactIds.includes(extractedStage.artifactId));
      assert.deepEqual(wallArtifact.parentArtifactIds, [
        extractedStage.artifactId,
      ]);
      assert.equal(wall.id, "W-001");
      assert.equal(segment.id, "WS-001");
      assert.equal(wall.name, "W-001");
      assert.equal(wall.wallType, "wood stud wall");
      assert.equal(wall.level, null);
      assert.equal(wall.assembly.material, null);
      assert.equal(wall.isShearOrBraced, null);
      assert.equal(wall.constructionPhase, "unknown");
      assert.equal(wall.assembly.studSize, "2x4");
      assert.equal(wall.assembly.studSpacingInches, 16);
      assert.equal(wall.assembly.heightFeet, 8);
      assert.equal(wall.assembly.plateCount, 3);
      assert.equal(segment.lengthFeet, 20);
      assert.equal(segment.parentWallId, wall.id);
      assert.deepEqual(wall.segmentIds, [segment.id]);
      assert.ok(hasResolvedTrace(wall.resolutionTraces, "assembly.studSize"));
      assert.ok(
        hasResolvedTrace(wall.resolutionTraces, "assembly.studSpacingInches"),
      );
      assert.ok(hasResolvedTrace(wall.resolutionTraces, "assembly.plateCount"));
      assert.ok(hasResolvedTrace(segment.resolutionTraces, "lengthFeet"));
      assert.equal(
        wall.resolutionTraces.some((trace: { propertyPath: string }) =>
          trace.propertyPath === "assembly",
        ),
        false,
      );

      const validationStage = stageByName(result, "validation");
      const calculationsStage = stageByName(result, "calculations");
      assert.equal(validationStage.order, 12);
      assert.equal(calculationsStage.order, 13);
      assert.ok(validationStage.order < calculationsStage.order);

      const validationArtifact = await readArtifact(validationStage.artifactPath);
      assert.ok(
        validationArtifact.payload.validationResults.some(
          (entry: { ruleId: string; outcome: string }) =>
            entry.ruleId === WALL_FRAMING_RULE_IDS.typeResolved &&
            entry.outcome === "passed",
        ),
      );
      assert.equal(validationArtifact.payload.validationIssues.length, 0);

      const calculationsArtifact = await readArtifact(
        calculationsStage.artifactPath,
      );
      assert.ok(
        calculationsArtifact.inputArtifactIds.includes(
          validationStage.artifactId,
        ),
      );
      assert.deepEqual(calculationsArtifact.parentArtifactIds, [
        validationStage.artifactId,
      ]);

      const confidenceStage = stageByName(result, "confidence");
      assert.equal(confidenceStage.artifactType, "confidence");
      assert.ok(result.reportPath);

      const report = finalFramingTakeoffArtifactSchema.parse(
        JSON.parse(await readFile(result.reportPath, "utf8")),
      );
      assert.equal(report.payload.summary.wallCount, 1);
      assert.equal(report.payload.summary.materialLineItemCount, 2);
      assert.deepEqual(
        report.payload.materials.map((item) => ({
          id: item.id,
          quantity: item.quantity,
          unit: item.unit,
        })),
        [
          {
            id: "MAT-wall-studs-object-WS-001",
            quantity: 16,
            unit: "each",
          },
          {
            id: "MAT-wall-plates-object-WS-001",
            quantity: 60,
            unit: "linear-foot",
          },
        ],
      );
      assert.equal(
        report.payload.materials.some((item) => item.id.startsWith("MAT-W001")),
        false,
      );
    } finally {
      await rm(artifactRoot, { recursive: true, force: true });
    }
  });

  it("changes resolved length and calculated quantities when Evidence lengthFeet changes", async () => {
    const stages = mapExtractedEvidence(createFramingStages(), (evidence) =>
      evidence.map((record) =>
        record.propertyPath === "lengthFeet"
          ? { ...record, candidateValue: 24 }
          : record,
      ),
    );
    const { artifactRoot, result } = await runFramingPipeline(stages);

    try {
      assert.equal(result.success, true);
      assert.equal(result.errors.length, 0);

      const wallArtifact = await readArtifact(
        stageByName(result, "wallFraming").artifactPath,
      );
      assert.equal(wallArtifact.payload.segments[0]?.lengthFeet, 24);
      assert.equal(wallArtifact.payload.walls[0]?.assembly.studSpacingInches, 16);
      assert.equal(wallArtifact.payload.walls[0]?.assembly.plateCount, 3);

      const report = finalFramingTakeoffArtifactSchema.parse(
        JSON.parse(await readFile(result.reportPath!, "utf8")),
      );
      assert.deepEqual(
        report.payload.materials.map((item) => ({
          id: item.id,
          quantity: item.quantity,
          unit: item.unit,
        })),
        [
          {
            id: "MAT-wall-studs-object-WS-001",
            quantity: 19,
            unit: "each",
          },
          {
            id: "MAT-wall-plates-object-WS-001",
            quantity: 72,
            unit: "linear-foot",
          },
        ],
      );
    } finally {
      await rm(artifactRoot, { recursive: true, force: true });
    }
  });

  it("omits wall quantities when lengthFeet Evidence is missing and still completes", async () => {
    const stages = withCalculableMember(
      mapExtractedEvidence(createFramingStages(), (evidence) =>
        evidence.filter((record) => record.propertyPath !== "lengthFeet"),
      ),
    );
    const { artifactRoot, result } = await runFramingPipeline(stages);

    try {
      assert.equal(result.success, true);
      assert.equal(result.errors.length, 0);
      assert.ok(result.reportPath);

      const wallArtifact = await readArtifact(
        stageByName(result, "wallFraming").artifactPath,
      );
      assert.equal(wallArtifact.payload.segments[0]?.lengthFeet, null);
      assert.equal(
        hasResolvedTrace(
          wallArtifact.payload.segments[0]?.resolutionTraces ?? [],
          "lengthFeet",
        ),
        false,
      );

      const validationArtifact = (await readArtifact(
        stageByName(result, "validation").artifactPath,
      )) as { payload: ValidationPayload };
      const lengthIssue = validationArtifact.payload.validationIssues.find(
        (issue) =>
          issue.ruleId === WALL_FRAMING_RULE_IDS.geometryLengthResolved,
      );
      assert.ok(lengthIssue);
      assert.equal(
        lengthIssue.quantityImpacts.find(
          (impact) => impact.quantityKey === WALL_QUANTITY_KEYS.studs,
        )?.canCalculate,
        false,
      );
      assert.ok(
        validationArtifact.payload.reviewItems.some(
          (item) =>
            item.validationIssueIds.includes(lengthIssue.id),
        ),
      );

      const report = finalFramingTakeoffArtifactSchema.parse(
        JSON.parse(await readFile(result.reportPath, "utf8")),
      );
      assert.equal(
        report.payload.materials.some((item) =>
          item.id.startsWith("MAT-wall-"),
        ),
        false,
      );
      assert.equal(report.payload.materials.length, 1);
      assert.equal(report.payload.materials[0]?.id, "MAT-member-material-object-SM-008");
      assert.equal(report.payload.materials[0]?.quantity, 6);
    } finally {
      await rm(artifactRoot, { recursive: true, force: true });
    }
  });

  it("honors Validation canCalculate: false without suppressing unrelated member quantity", async () => {
    const wallFraming = buildFixtureWallFraming({
      wall: { wallType: null },
    });
    const stages = replaceStage(
      withCalculableMember(createFramingStages()),
      "wallFraming",
      async (context) =>
        createFramingStageArtifact(
          context,
          6,
          wallFramingArtifactSchema,
          "wall-framing",
          wallFraming,
        ),
    );
    const { artifactRoot, result } = await runFramingPipeline(stages);

    try {
      assert.equal(result.success, true);
      assert.equal(result.errors.length, 0);

      const validationArtifact = await readArtifact(
        stageByName(result, "validation").artifactPath,
      ) as { payload: ValidationPayload };
      const typeIssue = validationArtifact.payload.validationIssues.find(
        (issue) => issue.ruleId === WALL_FRAMING_RULE_IDS.typeResolved,
      );
      assert.ok(typeIssue);
      assert.equal(
        typeIssue.quantityImpacts.find(
          (impact) => impact.quantityKey === WALL_QUANTITY_KEYS.studs,
        )?.canCalculate,
        false,
      );
      assert.equal(
        typeIssue.quantityImpacts.find(
          (impact) => impact.quantityKey === WALL_QUANTITY_KEYS.plates,
        )?.canCalculate,
        false,
      );

      const report = finalFramingTakeoffArtifactSchema.parse(
        JSON.parse(await readFile(result.reportPath!, "utf8")),
      );
      assert.equal(
        report.payload.materials.some((item) => item.id.includes("WS-001")),
        false,
      );
      assert.equal(report.payload.materials.length, 1);
      assert.equal(report.payload.materials[0]?.id, "MAT-member-material-object-SM-008");
      assert.equal(report.payload.materials[0]?.quantity, 6);
      assert.equal(report.payload.materials[0]?.unit, "linear-foot");
    } finally {
      await rm(artifactRoot, { recursive: true, force: true });
    }
  });
});
