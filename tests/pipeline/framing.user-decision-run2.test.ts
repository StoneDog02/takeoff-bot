import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { ArtifactStore } from "../../src/core/artifacts/ArtifactStore.js";
import { PipelineRunner } from "../../src/core/pipeline/PipelineRunner.js";
import type {
  PipelineStage,
  UserDecisionRunInput,
} from "../../src/core/pipeline/types.js";
import { evidenceSchema } from "../../src/core/schemas/evidence.schema.js";
import type { ReviewItemId } from "../../src/core/schemas/identity.schema.js";
import type { ReviewItem } from "../../src/core/schemas/review-item.schema.js";
import type { UserDecision } from "../../src/core/schemas/user-decision.schema.js";
import { generateArtifactId } from "../../src/core/utils/ids.js";
import { indexPlan } from "../../src/plans/indexPlan.js";
import { createMaterialLineItemId } from "../../src/scopes/framing/calculators/ids.js";
import {
  confidenceArtifactSchema,
  extractedFramingEvidenceArtifactSchema,
  finalFramingTakeoffArtifactSchema,
  userDecisionArtifactSchema,
  validationArtifactSchema,
  wallFramingArtifactSchema,
  type ValidationPayload,
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

const source = {
  page: {
    documentId: null,
    pageNumber: 1,
    sheetId: null,
    sheetTitle: null,
    pageLabel: null,
    revision: null,
  },
  region: null,
  elementLabel: "W-001",
  detailNumber: null,
  sectionNumber: null,
  scheduleName: null,
  noteReference: null,
};

function evidenceForSubject(
  subjectKey: string,
  overrides: Record<string, unknown>,
) {
  return evidenceSchema.parse({
    id: "E-PROP",
    type: "note",
    relationship: "supports",
    description: "Extracted candidate.",
    source: {
      ...source,
      elementLabel: subjectKey,
    },
    originalText: `${subjectKey} fixture line`,
    references: [],
    subjectKind: "wall" as const,
    subjectKey,
    propertyPath: "wallType",
    candidateValue: "wood stud wall",
    ...overrides,
  });
}

function completeWallEvidenceForSubject(subjectKey: string, prefix: string) {
  const isW002 = subjectKey === "W-002";
  return [
    evidenceForSubject(subjectKey, {
      id: `${prefix}-CLASS`,
      propertyPath: "wallType",
      candidateValue: "wood stud wall",
    }),
    evidenceForSubject(subjectKey, {
      id: `${prefix}-FRAMING`,
      propertyPath: "assembly.studSize",
      candidateValue: isW002 ? "2x6" : "2x4",
    }),
    evidenceForSubject(subjectKey, {
      id: `${prefix}-SPACING`,
      type: "dimension",
      propertyPath: "assembly.studSpacingInches",
      candidateValue: isW002 ? 24 : 16,
    }),
    evidenceForSubject(subjectKey, {
      id: `${prefix}-HEIGHT`,
      type: "dimension",
      propertyPath: "assembly.heightFeet",
      candidateValue: isW002 ? 9 : 8,
    }),
    evidenceForSubject(subjectKey, {
      id: `${prefix}-PLATES`,
      propertyPath: "assembly.plateCount",
      candidateValue: isW002 ? 2 : 3,
    }),
  ];
}

function twoWallConflictEvidence() {
  return [
    ...completeWallEvidenceForSubject("W-001", "E-W001"),
    evidenceForSubject("W-001", {
      id: "E-W001-GEOMETRY",
      type: "dimension",
      propertyPath: "lengthFeet",
      candidateValue: 20,
    }),
    ...completeWallEvidenceForSubject("W-002", "E-W002"),
    evidenceForSubject("W-002", {
      id: "E-W002-LENGTH-A",
      type: "dimension",
      propertyPath: "lengthFeet",
      candidateValue: 12,
    }),
    evidenceForSubject("W-002", {
      id: "E-W002-LENGTH-B",
      type: "dimension",
      propertyPath: "lengthFeet",
      candidateValue: 14,
    }),
  ];
}

function replaceStage(
  stages: PipelineStage[],
  name: string,
  run: PipelineStage["run"],
): PipelineStage[] {
  return stages.map((stage) => (stage.name === name ? { ...stage, run } : stage));
}

function withTwoWallConflictEvidence(stages: PipelineStage[]): PipelineStage[] {
  const original = stages.find((stage) => stage.name === "extractedEvidence");
  assert.ok(original, "Expected extractedEvidence stage");

  return replaceStage(stages, "extractedEvidence", async (context) => {
    const artifact = await original.run(context);
    return createFramingStageArtifact(
      context,
      6,
      extractedFramingEvidenceArtifactSchema,
      "extracted-framing-evidence",
      { evidence: twoWallConflictEvidence() },
      artifact.producer,
    );
  });
}

async function runFramingPipeline(
  stages: PipelineStage[],
  options: {
    artifactRoot?: string;
    userDecisionRunInput?: UserDecisionRunInput;
  } = {},
) {
  const artifactRoot =
    options.artifactRoot ??
    (await mkdtemp(path.join(tmpdir(), "takeoff-bot-run2-test-")));
  const planIndex = await indexPlan(WALL_FIXTURE_PDF);
  const runner = new PipelineRunner(new ArtifactStore(artifactRoot));
  const result = await runner.run({
    projectId: "run2-user-decision-project",
    pdfPath: WALL_FIXTURE_PDF,
    scopeName: "framing",
    planIndex,
    useMockAi: true,
    stages,
    userDecisionRunInput: options.userDecisionRunInput,
  });

  return { artifactRoot, result, artifactStore: new ArtifactStore(artifactRoot) };
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

function ws002LengthReviewItem(validation: ValidationPayload): ReviewItem {
  const reviewItem = validation.reviewItems.find(
    (item) =>
      item.affectedObjects.length === 1 &&
      item.affectedObjects[0]?.objectId === "WS-002" &&
      item.action.targetProperty === "lengthFeet",
  );
  if (!reviewItem) {
    throw new Error("Expected WS-002 geometry-length Review Item.");
  }
  return reviewItem;
}

function createUserDecisionArtifact(input: {
  projectId: string;
  pipelineRunId: string;
  validationArtifactId: string;
  decision: UserDecision;
}) {
  const now = new Date().toISOString();
  return userDecisionArtifactSchema.parse({
    artifactId: generateArtifactId(91),
    artifactType: "user-decision",
    schemaVersion: "1.0.0",
    artifactVersion: 1,
    engineVersion: "0.1.0",
    pipelineRunId: input.pipelineRunId,
    projectId: input.projectId,
    createdAt: now,
    lastModifiedAt: now,
    producer: { type: "user", identifier: "run2-integration-test" },
    inputArtifactIds: [input.validationArtifactId],
    parentArtifactIds: [input.validationArtifactId],
    payload: input.decision,
  });
}

function expectedMaterialLines() {
  return [
    {
      id: createMaterialLineItemId(WALL_QUANTITY_KEYS.studs, "WS-001"),
      quantity: 16,
      unit: "each",
    },
    {
      id: createMaterialLineItemId(WALL_QUANTITY_KEYS.plates, "WS-001"),
      quantity: 60,
      unit: "linear-foot",
    },
    {
      id: createMaterialLineItemId(WALL_QUANTITY_KEYS.studs, "WS-002"),
      quantity: 8,
      unit: "each",
    },
    {
      id: createMaterialLineItemId(WALL_QUANTITY_KEYS.plates, "WS-002"),
      quantity: 28,
      unit: "linear-foot",
    },
  ];
}

describe("framing pipeline Run-2 user decision replay", () => {
  it("replays Run 2 with a persisted conflict-resolved User Decision", async () => {
    const stages = withTwoWallConflictEvidence(createFramingStages());
    const run1Root = await mkdtemp(path.join(tmpdir(), "takeoff-bot-run1-"));
    const run2Root = await mkdtemp(path.join(tmpdir(), "takeoff-bot-run2-"));

    try {
      const run1 = await runFramingPipeline(stages, { artifactRoot: run1Root });
      assert.equal(run1.result.success, true);

      const run1EvidenceArtifact = await readArtifact(
        stageByName(run1.result, "extractedEvidence").artifactPath,
      );
      const run1EvidenceSnapshot = structuredClone(run1EvidenceArtifact);

      const run1ValidationStage = stageByName(run1.result, "validation");
      const run1ValidationArtifact = validationArtifactSchema.parse(
        await readArtifact(run1ValidationStage.artifactPath),
      );
      const run1ValidationSnapshot = structuredClone(run1ValidationArtifact);

      const run1WallArtifact = wallFramingArtifactSchema.parse(
        await readArtifact(stageByName(run1.result, "wallFraming").artifactPath),
      );
      const segment002Run1 = run1WallArtifact.payload.segments.find(
        (segment) => segment.id === "WS-002",
      );
      assert.equal(segment002Run1?.lengthFeet, null);
      assert.equal(
        segment002Run1?.resolutionTraces.find(
          (trace) => trace.propertyPath === "lengthFeet",
        )?.method,
        "unresolved",
      );

      const lengthReviewItem = ws002LengthReviewItem(run1ValidationArtifact.payload);
      assert.equal(
        run1ValidationArtifact.payload.validationResults.find(
          (entry) =>
            entry.ruleId === WALL_FRAMING_RULE_IDS.geometryLengthResolved &&
            entry.target.kind === "object" &&
            entry.target.objectId === "WS-002",
        )?.outcome,
        "failed",
      );

      const run1Report = finalFramingTakeoffArtifactSchema.parse(
        JSON.parse(await readFile(run1.result.reportPath!, "utf8")),
      );
      assert.equal(run1Report.payload.materials.length, 2);
      assert.ok(
        run1Report.payload.materials.every((item) => item.id.includes("WS-001")),
      );
      assert.ok(
        run1Report.payload.materials.every((item) => !item.id.includes("WS-002")),
      );

      const decision: UserDecision = {
        id: "UD-WS002-LENGTH-001",
        reviewItemId: lengthReviewItem.id,
        result: {
          type: "conflict-resolved",
          value: 14,
          acceptedEvidenceIds: ["E-W002-LENGTH-B"],
          rejectedEvidenceIds: ["E-W002-LENGTH-A"],
          rationale: "Reviewer selected 14 ft from conflicting candidates.",
        },
        supersedesUserDecisionId: null,
      };

      const decisionArtifact = createUserDecisionArtifact({
        projectId: "run2-user-decision-project",
        pipelineRunId: run1.result.pipelineRunId,
        validationArtifactId: run1ValidationStage.artifactId,
        decision,
      });

      const run1Store = new ArtifactStore(run1Root);
      const decisionPath = await run1Store.writeExternal(
        "run2-user-decision-project",
        "framing",
        `${decision.id}.json`,
        decisionArtifact,
      );
      const loadedDecisionArtifact = userDecisionArtifactSchema.parse(
        await run1Store.read(decisionPath),
      );

      const reviewItemsById = new Map<ReviewItemId, ReviewItem>(
        run1ValidationArtifact.payload.reviewItems.map((item) => [item.id, item]),
      );

      const run2 = await runFramingPipeline(stages, {
        artifactRoot: run2Root,
        userDecisionRunInput: {
          userDecisions: [loadedDecisionArtifact.payload],
          reviewItemsById,
          inputArtifactIds: [loadedDecisionArtifact.artifactId],
        },
      });
      assert.equal(run2.result.success, true);

      const run2WallArtifact = wallFramingArtifactSchema.parse(
        await readArtifact(stageByName(run2.result, "wallFraming").artifactPath),
      );
      const segment001 = run2WallArtifact.payload.segments.find(
        (segment) => segment.id === "WS-001",
      );
      const segment002 = run2WallArtifact.payload.segments.find(
        (segment) => segment.id === "WS-002",
      );
      assert.equal(segment001?.lengthFeet, 20);
      assert.equal(segment002?.lengthFeet, 14);

      const trace002 = segment002?.resolutionTraces.find(
        (trace) => trace.propertyPath === "lengthFeet",
      );
      assert.equal(trace002?.method, "user-override");
      assert.deepEqual(trace002?.userDecisionIds, ["UD-WS002-LENGTH-001"]);
      assert.deepEqual(trace002?.reviewItemIds, [lengthReviewItem.id]);
      assert.deepEqual(trace002?.evidenceIds, ["E-W002-LENGTH-A", "E-W002-LENGTH-B"]);

      assert.ok(
        run2WallArtifact.inputArtifactIds.includes(loadedDecisionArtifact.artifactId),
      );

      const run2ValidationArtifact = validationArtifactSchema.parse(
        await readArtifact(stageByName(run2.result, "validation").artifactPath),
      );
      assert.equal(
        run2ValidationArtifact.payload.validationResults.find(
          (entry) =>
            entry.ruleId === WALL_FRAMING_RULE_IDS.geometryLengthResolved &&
            entry.target.kind === "object" &&
            entry.target.objectId === "WS-002",
        )?.outcome,
        "passed",
      );
      assert.equal(
        run2ValidationArtifact.payload.reviewItems.some(
          (item) =>
            item.affectedObjects.some((object) => object.objectId === "WS-002") &&
            item.action.targetProperty === "lengthFeet",
        ),
        false,
      );

      const run2Report = finalFramingTakeoffArtifactSchema.parse(
        JSON.parse(await readFile(run2.result.reportPath!, "utf8")),
      );
      assert.deepEqual(
        run2Report.payload.materials.map((item) => ({
          id: item.id,
          quantity: item.quantity,
          unit: item.unit,
        })),
        expectedMaterialLines(),
      );
      assert.equal(run2Report.payload.status, "completed");

      const run2ConfidenceArtifact = confidenceArtifactSchema.parse(
        await readArtifact(stageByName(run2.result, "confidence").artifactPath),
      );
      const ws002Confidence = run2ConfidenceArtifact.payload.confidenceEvaluations.find(
        (evaluation) =>
          evaluation.target.kind === "object" &&
          evaluation.target.objectId === "WS-002",
      );
      assert.ok(ws002Confidence);
      assert.deepEqual(ws002Confidence.userDecisionIds, ["UD-WS002-LENGTH-001"]);
      assert.equal(ws002Confidence.resolution.label, "high");

      const run1EvidenceAfterRun2 = await readArtifact(
        stageByName(run1.result, "extractedEvidence").artifactPath,
      );
      const run1ValidationAfterRun2 = validationArtifactSchema.parse(
        await readArtifact(run1ValidationStage.artifactPath),
      );
      assert.deepEqual(run1EvidenceAfterRun2, run1EvidenceSnapshot);
      assert.deepEqual(run1ValidationAfterRun2, run1ValidationSnapshot);
      assert.deepEqual(lengthReviewItem, run1ValidationSnapshot.payload.reviewItems.find(
        (item) => item.id === lengthReviewItem.id,
      ));
    } finally {
      await rm(run1Root, { recursive: true, force: true });
      await rm(run2Root, { recursive: true, force: true });
    }
  });

  it("fails Run 2 when a supplied decision references missing current Evidence", async () => {
    const stages = withTwoWallConflictEvidence(createFramingStages());
    const run1Root = await mkdtemp(path.join(tmpdir(), "takeoff-bot-run1-stale-"));
    const run2Root = await mkdtemp(path.join(tmpdir(), "takeoff-bot-run2-stale-"));

    try {
      const run1 = await runFramingPipeline(stages, { artifactRoot: run1Root });
      assert.equal(run1.result.success, true);

      const run1ValidationStage = stageByName(run1.result, "validation");
      const run1ValidationArtifact = validationArtifactSchema.parse(
        await readArtifact(run1ValidationStage.artifactPath),
      );
      const lengthReviewItem = ws002LengthReviewItem(run1ValidationArtifact.payload);
      const decisionArtifact = createUserDecisionArtifact({
        projectId: "run2-user-decision-project",
        pipelineRunId: run1.result.pipelineRunId,
        validationArtifactId: run1ValidationStage.artifactId,
        decision: {
          id: "UD-WS002-LENGTH-STALE",
          reviewItemId: lengthReviewItem.id,
          result: {
            type: "conflict-resolved",
            value: 14,
            acceptedEvidenceIds: ["E-W002-LENGTH-B"],
            rejectedEvidenceIds: ["E-W002-LENGTH-A"],
            rationale: "Reviewer selected 14 ft from conflicting candidates.",
          },
          supersedesUserDecisionId: null,
        },
      });

      const staleStages = replaceStage(stages, "extractedEvidence", async (context) =>
        createFramingStageArtifact(
          context,
          6,
          extractedFramingEvidenceArtifactSchema,
          "extracted-framing-evidence",
          {
            evidence: twoWallConflictEvidence().filter(
              (record) => record.id !== "E-W002-LENGTH-B",
            ),
          },
          { type: "system", identifier: "framing-pipeline" },
        ),
      );

      const run2 = await runFramingPipeline(staleStages, {
        artifactRoot: run2Root,
        userDecisionRunInput: {
          userDecisions: [decisionArtifact.payload],
          reviewItemsById: new Map(
            run1ValidationArtifact.payload.reviewItems.map((item) => [item.id, item]),
          ),
          inputArtifactIds: [decisionArtifact.artifactId],
        },
      });

      assert.equal(run2.result.success, false);
      assert.match(run2.result.errors.join("\n"), /missing accepted Evidence E-W002-LENGTH-B/);
    } finally {
      await rm(run1Root, { recursive: true, force: true });
      await rm(run2Root, { recursive: true, force: true });
    }
  });

  it("leaves no-decision pipeline behavior unchanged", async () => {
    const { artifactRoot, result } = await runFramingPipeline(createFramingStages());

    try {
      assert.equal(result.success, true);
      const report = finalFramingTakeoffArtifactSchema.parse(
        JSON.parse(await readFile(result.reportPath!, "utf8")),
      );
      assert.equal(report.payload.summary.wallCount, 1);
      assert.equal(report.payload.summary.materialLineItemCount, 2);
    } finally {
      await rm(artifactRoot, { recursive: true, force: true });
    }
  });
});
