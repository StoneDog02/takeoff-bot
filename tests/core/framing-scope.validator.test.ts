import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { reviewItemSchema } from "../../src/core/schemas/review-item.schema.js";
import {
  validationIssueSchema,
  validationResultSchema,
} from "../../src/core/schemas/validation.schema.js";
import {
  confidencePayloadSchema,
  framingScopePayloadSchema,
  validationPayloadSchema,
  type ConfidencePayload,
  type FramingScopePayload,
  type ValidationPayload,
} from "../../src/scopes/framing/schemas/framing-artifacts.schema.js";
import { FRAMING_SCOPE_RULE_IDS } from "../../src/scopes/framing/validators/rule-ids.js";
import { validateFramingScope } from "../../src/scopes/framing/validators/framing-scope.validator.js";
import { coordinateFramingValidation } from "../../src/scopes/framing/validators/validation-coordinator.js";

const objectTarget = {
  kind: "object",
  objectId: "W-017",
  objectType: "building-wall",
} as const;

const warningIssue = {
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
} as const;

const failedResult = {
  id: "VR-001",
  ruleId: "wall.height.resolved",
  level: "object",
  target: objectTarget,
  outcome: "failed",
  explanation: "Wall height is unresolved without an approved assumption.",
  validationIssueIds: ["VI-001"],
  evidenceIds: ["E-001"],
} as const;

const reviewItem = {
  id: "RI-001",
  kind: "actionable",
  origin: "validation",
  reason: "missing-information",
  title: "Confirm assumed wall height",
  description: "Wall W-017 height was filled by an approved default.",
  action: {
    type: "confirm",
    instruction: "Confirm the assumed wall height before final takeoff.",
    targetProperty: "geometry.heightFeet",
  },
  reviewStatus: "review-required",
  blockingStatus: "not-blocked",
  affectedObjects: [
    { objectId: "W-017", objectType: "building-wall" },
  ],
  validationIssueIds: ["VI-001"],
} as const;

const extraIssue = {
  ...warningIssue,
  id: "VI-002",
  reviewItemIds: [],
} as const;

function buildValidationPayload(
  overrides: Partial<ValidationPayload> = {},
): ValidationPayload {
  return validationPayloadSchema.parse({
    validationIssues: [warningIssue],
    validationResults: [failedResult],
    reviewItems: [reviewItem],
    ...overrides,
  });
}

function buildConfidencePayload(
  overrides: Partial<ConfidencePayload> = {},
): ConfidencePayload {
  return confidencePayloadSchema.parse({
    confidenceEvaluations: [
      {
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
        reviewStatus: "review-required",
        blockingStatus: "not-blocked",
        quantityImpactWeight: "high",
        explanation:
          "The wall is fully resolved; confirmation is still required.",
        evidenceIds: ["E-001"],
        validationResultIds: ["VR-001"],
        reviewItemIds: ["RI-001"],
      },
    ],
    ...overrides,
  });
}

function buildScope(
  overrides: Record<string, unknown> = {},
): FramingScopePayload {
  return framingScopePayloadSchema.parse({
    scopeName: "framing",
    ...overrides,
  });
}

function findResult(
  batch: ReturnType<typeof validateFramingScope>,
  ruleId: string,
) {
  return batch.validationResults.find((result) => result.ruleId === ruleId);
}

describe("validateFramingScope", () => {
  it("accepts a valid Framing Scope snapshot with resolved references", () => {
    const batch = validateFramingScope({
      payload: buildScope({
        subsystemArtifactIds: {
          wallFraming: "ART-006",
          validation: "ART-020",
          confidence: "ART-021",
        },
        reviewItemIds: ["RI-001"],
        validationIssueIds: ["VI-001"],
        validationResultIds: ["VR-001"],
        confidenceEvaluationIds: ["CE-001"],
      }),
      validation: buildValidationPayload(),
      confidence: buildConfidencePayload(),
    });

    assert.equal(batch.validationIssues.length, 0);
    assert.equal(batch.reviewItems.length, 0);
    assert.ok(
      batch.validationResults.every((result) => result.outcome === "passed"),
    );
    assert.equal(batch.validationResults.length, 6);
  });

  it("accepts nullable subsystem artifact IDs on an otherwise empty snapshot", () => {
    const batch = validateFramingScope({
      payload: buildScope(),
    });

    assert.equal(batch.validationIssues.length, 0);
    assert.ok(
      batch.validationResults.every((result) => result.outcome === "passed"),
    );
    assert.equal(
      findResult(batch, FRAMING_SCOPE_RULE_IDS.validationArtifactReferenced)
        ?.outcome,
      "passed",
    );
    assert.equal(
      findResult(batch, FRAMING_SCOPE_RULE_IDS.confidenceArtifactReferenced)
        ?.outcome,
      "passed",
    );
  });

  it("accepts valid validation and review item references without requiring unused records", () => {
    const batch = validateFramingScope({
      payload: buildScope({
        subsystemArtifactIds: {
          validation: "ART-020",
        },
        reviewItemIds: ["RI-001"],
        validationIssueIds: ["VI-001"],
        validationResultIds: ["VR-001"],
      }),
      validation: buildValidationPayload({
        validationIssues: [warningIssue, extraIssue],
        validationResults: [failedResult],
        reviewItems: [reviewItem],
      }),
    });

    assert.equal(
      findResult(batch, FRAMING_SCOPE_RULE_IDS.validationIssuesResolved)
        ?.outcome,
      "passed",
    );
    assert.equal(
      findResult(batch, FRAMING_SCOPE_RULE_IDS.validationResultsResolved)
        ?.outcome,
      "passed",
    );
    assert.equal(
      findResult(batch, FRAMING_SCOPE_RULE_IDS.reviewItemsResolved)?.outcome,
      "passed",
    );
    assert.equal(batch.validationIssues.length, 0);
  });

  it("fails a dangling validation issue reference", () => {
    const batch = validateFramingScope({
      payload: buildScope({
        subsystemArtifactIds: { validation: "ART-020" },
        validationIssueIds: ["VI-MISSING"],
      }),
      validation: buildValidationPayload(),
    });

    const result = findResult(
      batch,
      FRAMING_SCOPE_RULE_IDS.validationIssuesResolved,
    );
    const issue = batch.validationIssues.find(
      (item) => item.ruleId === FRAMING_SCOPE_RULE_IDS.validationIssuesResolved,
    );

    assert.equal(result?.outcome, "failed");
    assert.equal(issue?.severity, "warning");
    assert.equal(issue?.quantityImpacts.length, 0);
    assert.match(issue?.explanation ?? "", /VI-MISSING/);
  });

  it("fails a dangling validation result reference", () => {
    const batch = validateFramingScope({
      payload: buildScope({
        subsystemArtifactIds: { validation: "ART-020" },
        validationResultIds: ["VR-MISSING"],
      }),
      validation: buildValidationPayload(),
    });

    const result = findResult(
      batch,
      FRAMING_SCOPE_RULE_IDS.validationResultsResolved,
    );

    assert.equal(result?.outcome, "failed");
    assert.match(result?.explanation ?? "", /VR-MISSING/);
  });

  it("fails a dangling review item reference when Review Items are available", () => {
    const batch = validateFramingScope({
      payload: buildScope({
        subsystemArtifactIds: { validation: "ART-020" },
        reviewItemIds: ["RI-MISSING"],
      }),
      validation: buildValidationPayload(),
    });

    const result = findResult(
      batch,
      FRAMING_SCOPE_RULE_IDS.reviewItemsResolved,
    );

    assert.equal(result?.outcome, "failed");
    assert.match(result?.explanation ?? "", /RI-MISSING/);
  });

  it("accepts valid confidence evaluation references", () => {
    const batch = validateFramingScope({
      payload: buildScope({
        subsystemArtifactIds: { confidence: "ART-021" },
        confidenceEvaluationIds: ["CE-001"],
      }),
      confidence: buildConfidencePayload(),
    });

    assert.equal(
      findResult(batch, FRAMING_SCOPE_RULE_IDS.confidenceEvaluationsResolved)
        ?.outcome,
      "passed",
    );
    assert.equal(
      findResult(batch, FRAMING_SCOPE_RULE_IDS.confidenceArtifactReferenced)
        ?.outcome,
      "passed",
    );
  });

  it("fails a dangling confidence evaluation reference", () => {
    const batch = validateFramingScope({
      payload: buildScope({
        subsystemArtifactIds: { confidence: "ART-021" },
        confidenceEvaluationIds: ["CE-MISSING"],
      }),
      confidence: buildConfidencePayload(),
    });

    const result = findResult(
      batch,
      FRAMING_SCOPE_RULE_IDS.confidenceEvaluationsResolved,
    );

    assert.equal(result?.outcome, "failed");
    assert.match(result?.explanation ?? "", /CE-MISSING/);
  });

  it("skips ID resolution when the prerequisite payload is missing", () => {
    const batch = validateFramingScope({
      payload: buildScope({
        subsystemArtifactIds: {
          validation: "ART-020",
          confidence: "ART-021",
        },
        reviewItemIds: ["RI-001"],
        validationIssueIds: ["VI-001"],
        validationResultIds: ["VR-001"],
        confidenceEvaluationIds: ["CE-001"],
      }),
    });

    assert.equal(
      findResult(batch, FRAMING_SCOPE_RULE_IDS.validationIssuesResolved)
        ?.outcome,
      "skipped",
    );
    assert.equal(
      findResult(batch, FRAMING_SCOPE_RULE_IDS.validationResultsResolved)
        ?.outcome,
      "skipped",
    );
    assert.equal(
      findResult(batch, FRAMING_SCOPE_RULE_IDS.reviewItemsResolved)?.outcome,
      "skipped",
    );
    assert.equal(
      findResult(batch, FRAMING_SCOPE_RULE_IDS.confidenceEvaluationsResolved)
        ?.outcome,
      "skipped",
    );
    assert.equal(batch.validationIssues.length, 0);
  });

  it("fails when aggregated validation IDs lack a validation artifact reference", () => {
    const batch = validateFramingScope({
      payload: buildScope({
        validationIssueIds: ["VI-001"],
      }),
      validation: buildValidationPayload(),
    });

    const result = findResult(
      batch,
      FRAMING_SCOPE_RULE_IDS.validationArtifactReferenced,
    );

    assert.equal(result?.outcome, "failed");
  });

  it("fails when aggregated confidence IDs lack a confidence artifact reference", () => {
    const batch = validateFramingScope({
      payload: buildScope({
        confidenceEvaluationIds: ["CE-001"],
      }),
      confidence: buildConfidencePayload(),
    });

    const result = findResult(
      batch,
      FRAMING_SCOPE_RULE_IDS.confidenceArtifactReferenced,
    );

    assert.equal(result?.outcome, "failed");
  });

  it("produces deterministic output across identical reruns", () => {
    const input = {
      payload: buildScope({
        subsystemArtifactIds: {
          validation: "ART-020",
          confidence: "ART-021",
        },
        reviewItemIds: ["RI-001"],
        validationIssueIds: ["VI-001"],
        validationResultIds: ["VR-001"],
        confidenceEvaluationIds: ["CE-001"],
      }),
      validation: buildValidationPayload(),
      confidence: buildConfidencePayload(),
    };

    const first = validateFramingScope(input);
    const second = validateFramingScope(input);

    assert.deepEqual(first, second);
  });

  it("parses generated Validation Issues, Results, and Review Items", () => {
    const batch = validateFramingScope({
      payload: buildScope({
        validationIssueIds: ["VI-MISSING"],
        validationResultIds: ["VR-MISSING"],
        reviewItemIds: ["RI-MISSING"],
        confidenceEvaluationIds: ["CE-MISSING"],
      }),
      validation: buildValidationPayload(),
      confidence: buildConfidencePayload(),
    });

    assert.ok(batch.validationIssues.length > 0);
    assert.ok(batch.reviewItems.length > 0);

    for (const issue of batch.validationIssues) {
      validationIssueSchema.parse(issue);
    }
    for (const result of batch.validationResults) {
      validationResultSchema.parse(result);
    }
    for (const item of batch.reviewItems) {
      reviewItemSchema.parse(item);
    }
  });
});

describe("coordinateFramingValidation Framing Scope wiring", () => {
  it("runs the Framing Scope validator when a Framing Scope payload is supplied", () => {
    const payload = coordinateFramingValidation({
      framingScope: buildScope({
        subsystemArtifactIds: { validation: "ART-020" },
        validationIssueIds: ["VI-001"],
      }),
      validation: buildValidationPayload(),
    });

    assert.ok(
      payload.validationResults.some(
        (result) =>
          result.ruleId === FRAMING_SCOPE_RULE_IDS.validationIssuesResolved &&
          result.outcome === "passed",
      ),
    );
    validationPayloadSchema.parse(payload);
  });
});
