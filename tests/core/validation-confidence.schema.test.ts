import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { confidenceEvaluationSchema } from "../../src/core/schemas/confidence.schema.js";
import {
  validationIssueSchema,
  validationResultSchema,
} from "../../src/core/schemas/validation.schema.js";

const objectTarget = {
  kind: "object",
  objectId: "W-017",
  objectType: "wall",
} as const;

describe("validation contracts", () => {
  it("accepts a traceable warning issue", () => {
    const issue = validationIssueSchema.parse({
      id: "VI-001",
      severity: "warning",
      level: "object",
      ruleId: "wall.height.resolved",
      ruleViolated: "Wall height must be resolved or assumed.",
      explanation: "The wall height was filled by an approved default.",
      recommendedUserAction: "Confirm the assumed wall height.",
      target: objectTarget,
      evidenceIds: ["E-001"],
      quantityImpacts: [
        {
          quantityKey: "wall.studs",
          description: "Stud lengths may change.",
          canCalculate: true,
        },
      ],
      reviewItemIds: ["RI-001"],
    });

    assert.equal(issue.severity, "warning");
  });

  it("rejects a blocking issue whose affected quantities are all calculable", () => {
    const result = validationIssueSchema.safeParse({
      id: "VI-002",
      severity: "blocking",
      level: "calculation",
      ruleId: "wall.scale.available",
      ruleViolated: "Measured takeoff requires scale.",
      explanation: "No scale was available.",
      target: objectTarget,
      quantityImpacts: [
        {
          description: "Wall length cannot be measured.",
          canCalculate: true,
        },
      ],
    });

    assert.equal(result.success, false);
  });

  it("requires failed results to reference issues", () => {
    const result = validationResultSchema.safeParse({
      id: "VR-001",
      ruleId: "wall.height.resolved",
      level: "object",
      target: objectTarget,
      outcome: "failed",
      explanation: "Wall height is unresolved.",
    });

    assert.equal(result.success, false);
  });

  it("accepts a passed result without issues", () => {
    const result = validationResultSchema.parse({
      id: "VR-002",
      ruleId: "wall.type.resolved",
      level: "object",
      target: objectTarget,
      outcome: "passed",
      explanation: "Wall type is resolved.",
      evidenceIds: ["E-002"],
    });

    assert.equal(result.outcome, "passed");
  });
});

describe("confidenceEvaluationSchema", () => {
  function validEvaluation() {
    return {
      id: "CE-001",
      target: objectTarget,
      evidence: { label: "high", explanation: "Plan and schedule agree." },
      resolution: {
        label: "high",
        explanation: "Resolved from explicit project values.",
      },
      validation: { label: "high", explanation: "All rules passed." },
      overallLabel: "high",
      completion: { status: "complete", percentage: 100 },
      reviewStatus: "no-review-required",
      blockingStatus: "not-blocked",
      quantityImpactWeight: "high",
      explanation: "The wall is fully resolved and validated.",
      evidenceIds: ["E-001"],
      validationResultIds: ["VR-002"],
    } as const;
  }

  it("keeps confidence, completion, review, and blocking independent", () => {
    const evaluation = confidenceEvaluationSchema.parse({
      ...validEvaluation(),
      reviewStatus: "review-required",
    });

    assert.equal(evaluation.overallLabel, "high");
    assert.equal(evaluation.reviewStatus, "review-required");
  });

  it("requires blocked status and label to agree", () => {
    const result = confidenceEvaluationSchema.safeParse({
      ...validEvaluation(),
      blockingStatus: "blocked",
      overallLabel: "low",
    });

    assert.equal(result.success, false);
  });

  it("rejects duplicate traceability IDs", () => {
    const result = confidenceEvaluationSchema.safeParse({
      ...validEvaluation(),
      evidenceIds: ["E-001", "E-001"],
    });

    assert.equal(result.success, false);
  });
});
