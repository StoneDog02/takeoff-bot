import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { confidenceEvaluationSchema } from "../../src/core/schemas/confidence.schema.js";
import { confidencePayloadSchema } from "../../src/scopes/framing/schemas/framing-artifacts.schema.js";
import { coordinateFramingConfidence } from "../../src/scopes/framing/confidence/confidence-coordinator.js";
import { WALL_FRAMING_RULE_IDS } from "../../src/scopes/framing/validators/rule-ids.js";
import { createValidationResult } from "../../src/scopes/framing/validators/createValidationResult.js";
import { createObjectTarget } from "../../src/scopes/framing/validators/ids.js";

const complete = {
  status: "complete",
  percentage: 100,
  completedItems: 1,
  totalItems: 1,
} as const;

function buildWallInput() {
  return {
    wallFraming: {
      walls: [
        {
          id: "W-001",
          objectType: "building-wall" as const,
          completion: complete,
          reviewStatus: "no-review-required" as const,
          blockingStatus: "not-blocked" as const,
          evidenceIds: ["E-001"],
          assumptionIds: [],
          validationIssueIds: [],
          reviewItemIds: [],
          resolutionTraces: [
            {
              propertyPath: "assembly.heightFeet",
              method: "explicit-project-value" as const,
              explanation: "Height is explicit on the plan.",
              evidenceIds: ["E-001"],
              assumptionIds: [],
              validationIssueIds: [],
              reviewItemIds: [],
            },
          ],
          name: "Exterior wall W-001",
          level: "Level 1",
          wallType: "exterior-wood-stud-wall" as const,
          location: "exterior" as const,
          bearingStatus: "non-bearing" as const,
          isShearOrBraced: false,
          fireRating: null,
          constructionPhase: "new" as const,
          assembly: {
            material: "dimensional-lumber",
            studSize: "2x4",
            studSpacingInches: 16,
            heightFeet: 8,
            plateCount: 3,
            sheathing: null,
          },
          segmentIds: ["WS-001"],
        },
      ],
      segments: [
        {
          id: "WS-001",
          objectType: "wall-segment" as const,
          completion: complete,
          reviewStatus: "no-review-required" as const,
          blockingStatus: "not-blocked" as const,
          evidenceIds: ["E-002"],
          assumptionIds: [],
          validationIssueIds: [],
          reviewItemIds: [],
          resolutionTraces: [
            {
              propertyPath: "lengthFeet",
              method: "explicit-project-value" as const,
              explanation: "Length is explicit on the plan.",
              evidenceIds: ["E-002"],
              assumptionIds: [],
              validationIssueIds: [],
              reviewItemIds: [],
            },
          ],
          parentWallId: "W-001",
          lengthFeet: 24,
          openingIds: [],
        },
      ],
    },
    validation: {
      validationIssues: [],
      validationResults: [
        createValidationResult({
          ruleId: WALL_FRAMING_RULE_IDS.typeResolved,
          level: "object",
          target: createObjectTarget("W-001", "building-wall"),
          outcome: "passed",
          explanation: "Wall type is resolved.",
          evidenceIds: ["E-001"],
        }),
        createValidationResult({
          ruleId: WALL_FRAMING_RULE_IDS.geometryLengthResolved,
          level: "object",
          target: createObjectTarget("WS-001", "wall-segment"),
          outcome: "passed",
          explanation: "Segment length is resolved.",
          evidenceIds: ["E-002"],
        }),
      ],
      reviewItems: [],
    },
  };
}

describe("coordinateFramingConfidence", () => {
  it("evaluates object-level and takeoff-level confidence", () => {
    const payload = coordinateFramingConfidence({
      pipelineRunId: "RUN-001",
      scopeName: "framing",
      evidenceIds: ["E-001", "E-002"],
      useExplicitFixture: true,
      ...buildWallInput(),
    });

    assert.equal(payload.confidenceEvaluations.length, 3);
    assert.ok(
      payload.confidenceEvaluations.some(
        (evaluation) =>
          evaluation.target.kind === "object" &&
          evaluation.target.objectId === "W-001",
      ),
    );
    assert.ok(
      payload.confidenceEvaluations.some(
        (evaluation) => evaluation.target.kind === "takeoff",
      ),
    );
  });

  it("keeps completion, review, and blocking independent on object evaluations", () => {
    const payload = coordinateFramingConfidence({
      pipelineRunId: "RUN-001",
      scopeName: "framing",
      useExplicitFixture: true,
      ...buildWallInput(),
    });

    const wallEvaluation = payload.confidenceEvaluations.find(
      (evaluation) =>
        evaluation.target.kind === "object" &&
        evaluation.target.objectId === "W-001",
    );

    assert.ok(wallEvaluation);
    assert.equal(wallEvaluation.overallLabel, "high");
    assert.equal(wallEvaluation.reviewStatus, "no-review-required");
    assert.equal(wallEvaluation.blockingStatus, "not-blocked");
    confidenceEvaluationSchema.parse(wallEvaluation);
  });

  it("marks takeoff confidence blocked when high-impact object validation blocks", () => {
    const input = buildWallInput();
    const payload = coordinateFramingConfidence({
      pipelineRunId: "RUN-001",
      scopeName: "framing",
      ...input,
      validation: {
        ...input.validation,
        validationIssues: [
          {
            id: "VI-wall-height-resolved-object-W-001",
            severity: "critical",
            level: "object",
            ruleId: WALL_FRAMING_RULE_IDS.heightResolved,
            ruleViolated: "Wall height must be resolved.",
            explanation: "Wall height is missing.",
            recommendedUserAction: "Confirm wall height.",
            target: createObjectTarget("W-001", "building-wall"),
            evidenceIds: ["E-001"],
            quantityImpacts: [
              {
                quantityKey: "wall.sheathing",
                description: "Sheathing requires height.",
                canCalculate: false,
              },
            ],
            reviewItemIds: ["RI-wall-height-resolved-object-W-001"],
          },
        ],
        validationResults: [
          createValidationResult({
            ruleId: WALL_FRAMING_RULE_IDS.heightResolved,
            level: "object",
            target: createObjectTarget("W-001", "building-wall"),
            outcome: "failed",
            explanation: "Wall height is missing.",
            validationIssueIds: ["VI-wall-height-resolved-object-W-001"],
            evidenceIds: ["E-001"],
          }),
        ],
        reviewItems: [
          {
            id: "RI-wall-height-resolved-object-W-001",
            kind: "actionable",
            origin: "validation",
            reason: "calculation-blocked",
            title: "Resolve wall height",
            description: "Wall height is missing.",
            action: {
              type: "provide-value",
              instruction: "Provide wall height.",
              targetProperty: "assembly.heightFeet",
            },
            reviewStatus: "review-required",
            blockingStatus: "blocked",
            affectedObjects: [
              { objectId: "W-001", objectType: "building-wall" },
            ],
            quantityImpacts: [],
            evidenceIds: ["E-001"],
            assumptionIds: [],
            validationIssueIds: ["VI-wall-height-resolved-object-W-001"],
          },
        ],
      },
    });

    const wallEvaluation = payload.confidenceEvaluations.find(
      (evaluation) =>
        evaluation.target.kind === "object" &&
        evaluation.target.objectId === "W-001",
    );
    const takeoffEvaluation = payload.confidenceEvaluations.find(
      (evaluation) => evaluation.target.kind === "takeoff",
    );

    assert.equal(wallEvaluation?.overallLabel, "blocked");
    assert.equal(takeoffEvaluation?.overallLabel, "blocked");
  });

  it("produces deterministic output across identical reruns", () => {
    const input = {
      pipelineRunId: "RUN-001",
      scopeName: "framing",
      useExplicitFixture: true,
      ...buildWallInput(),
    };

    assert.deepEqual(
      coordinateFramingConfidence(input),
      coordinateFramingConfidence(input),
    );
  });

  it("parses merged output through the confidence payload schema", () => {
    const payload = coordinateFramingConfidence({
      pipelineRunId: "RUN-001",
      scopeName: "framing",
      useExplicitFixture: true,
      ...buildWallInput(),
    });

    confidencePayloadSchema.parse(payload);
  });
});
