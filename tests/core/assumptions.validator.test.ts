import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { reviewItemSchema } from "../../src/core/schemas/review-item.schema.js";
import {
  validationIssueSchema,
  validationResultSchema,
} from "../../src/core/schemas/validation.schema.js";
import type { Assumption } from "../../src/core/schemas/assumption.schema.js";
import { ASSUMPTION_RULE_IDS } from "../../src/scopes/framing/validators/rule-ids.js";
import { validateAssumptions } from "../../src/scopes/framing/validators/assumptions.validator.js";

function buildAllowedAssumption(
  overrides: Partial<Assumption> = {},
): Assumption {
  return {
    id: "A-014",
    category: "industry-default",
    target: {
      objectId: "W-017",
      objectType: "building-wall",
      propertyPath: "assembly.studSize",
    },
    assumedValue: "2x4",
    source: {
      type: "construction-brain",
      reference: "knowledge/framing/10-assumptions.md",
      explanation: "Approved default for an unresolved wall stud size.",
    },
    reasonUsed:
      "Wall depth could not be resolved from plan linework or schedules.",
    materialImpact: {
      level: "high",
      explanation: "Changes stud and plate material selections.",
      affectedQuantityKeys: ["wall.studs", "wall.plates"],
    },
    riskLevel: "medium",
    userEditable: true,
    reviewRequired: true,
    confidenceImpact: {
      level: "material",
      explanation: "A material-driving property remains assumed.",
    },
    evidenceIds: [],
    reviewItemIds: ["RI-014"],
    status: "active",
    userDecisionId: null,
    ...overrides,
  };
}

describe("validateAssumptions", () => {
  it("accepts a valid allowed assumption that requires review", () => {
    const batch = validateAssumptions({
      payload: { assumptions: [buildAllowedAssumption()] },
    });

    assert.equal(batch.validationIssues.length, 0);
    assert.equal(batch.reviewItems.length, 0);
    assert.ok(batch.validationResults.length > 0);
    assert.ok(
      batch.validationResults.every((result) => result.outcome === "passed"),
    );
    assert.ok(
      batch.validationResults.some(
        (result) =>
          result.ruleId === ASSUMPTION_RULE_IDS.reviewRequired &&
          result.outcome === "passed",
      ),
    );
  });

  it("fails an active assumption that is not marked for review", () => {
    const batch = validateAssumptions({
      payload: {
        assumptions: [buildAllowedAssumption({ reviewRequired: false })],
      },
    });

    const issue = batch.validationIssues.find(
      (entry) => entry.ruleId === ASSUMPTION_RULE_IDS.reviewRequired,
    );

    assert.ok(issue);
    assert.equal(issue.severity, "critical");
    assert.equal(issue.quantityImpacts[0]?.canCalculate, false);
  });

  it("fails a forbidden in-use assumption without blocking unrelated quantities", () => {
    const batch = validateAssumptions({
      payload: {
        assumptions: [
          buildAllowedAssumption({
            id: "A-020",
            target: {
              objectId: "SM-008",
              objectType: "structural-member",
              propertyPath: "size",
            },
            assumedValue: "5.25x11.875",
            reasonUsed: "Beam size was not shown on the schedule.",
            materialImpact: {
              level: "high",
              explanation: "Changes beam material selection.",
              affectedQuantityKeys: ["member.material"],
            },
            riskLevel: "high",
          }),
        ],
      },
    });

    const forbidden = batch.validationIssues.find(
      (entry) => entry.ruleId === ASSUMPTION_RULE_IDS.policyForbidden,
    );
    const approval = batch.validationIssues.find(
      (entry) => entry.ruleId === ASSUMPTION_RULE_IDS.approvalRequired,
    );

    assert.ok(forbidden);
    assert.equal(forbidden.severity, "critical");
    assert.deepEqual(
      forbidden.quantityImpacts.map((impact) => impact.quantityKey),
      ["member.material"],
    );
    assert.ok(approval);
    assert.equal(approval.severity, "critical");
  });

  it("fails incomplete assumption state for unknown material impact and missing review items", () => {
    const batch = validateAssumptions({
      payload: {
        assumptions: [
          buildAllowedAssumption({
            materialImpact: {
              level: "unknown",
              explanation: "Impact has not been classified.",
              affectedQuantityKeys: [],
            },
            reviewItemIds: [],
          }),
        ],
      },
    });

    const materialIssue = batch.validationIssues.find(
      (entry) => entry.ruleId === ASSUMPTION_RULE_IDS.materialImpactResolved,
    );
    const reviewIssue = batch.validationIssues.find(
      (entry) => entry.ruleId === ASSUMPTION_RULE_IDS.reviewTraceable,
    );

    assert.ok(materialIssue);
    assert.equal(materialIssue.severity, "warning");
    assert.equal(materialIssue.quantityImpacts.length, 0);
    assert.ok(reviewIssue);
    assert.equal(reviewIssue.severity, "warning");
  });

  it("fails conflicting active assumptions for the same target property", () => {
    const batch = validateAssumptions({
      payload: {
        assumptions: [
          buildAllowedAssumption(),
          buildAllowedAssumption({
            id: "A-015",
            assumedValue: "2x6",
            category: "user-default",
            source: {
              type: "user-configuration",
              reference: null,
              explanation: "Preferred unresolved stud size.",
            },
          }),
        ],
      },
    });

    const conflicts = batch.validationIssues.filter(
      (entry) => entry.ruleId === ASSUMPTION_RULE_IDS.targetConflict,
    );

    assert.equal(conflicts.length, 2);
    assert.ok(
      conflicts.every((issue) => issue.severity === "critical"),
    );
    assert.equal(
      conflicts[0]?.id,
      "VI-assumption-target-conflict-object-A-014",
    );
    assert.equal(
      conflicts[1]?.id,
      "VI-assumption-target-conflict-object-A-015",
    );
  });

  it("fails a source type that conflicts with the assumption precedence category", () => {
    const batch = validateAssumptions({
      payload: {
        assumptions: [
          buildAllowedAssumption({
            source: {
              type: "user-configuration",
              reference: null,
              explanation: "Source type does not match industry-default.",
            },
          }),
        ],
      },
    });

    const issue = batch.validationIssues.find(
      (entry) => entry.ruleId === ASSUMPTION_RULE_IDS.sourceConsistent,
    );

    assert.ok(issue);
    assert.equal(issue.severity, "warning");
    assert.equal(issue.quantityImpacts.length, 0);
  });

  it("produces deterministic IDs and output across identical reruns", () => {
    const batchInput = {
      payload: {
        assumptions: [
          buildAllowedAssumption({
            target: {
              objectId: "SM-008",
              objectType: "structural-member",
              propertyPath: "size",
            },
            assumedValue: "3.5x11.875",
          }),
        ],
      },
    };

    const first = validateAssumptions(batchInput);
    const second = validateAssumptions(batchInput);

    assert.deepEqual(first, second);
    const forbidden = first.validationIssues.find(
      (entry) => entry.ruleId === ASSUMPTION_RULE_IDS.policyForbidden,
    );

    assert.equal(
      forbidden?.id,
      "VI-assumption-policy-forbidden-object-A-014",
    );
  });

  it("parses generated issues, results, and review items through core schemas", () => {
    const batch = validateAssumptions({
      payload: {
        assumptions: [
          buildAllowedAssumption({ reviewRequired: false }),
          buildAllowedAssumption({
            id: "A-015",
            target: {
              objectId: "SM-008",
              objectType: "structural-member",
              propertyPath: "size",
            },
            assumedValue: "5.25x11.875",
            riskLevel: "high",
            materialImpact: {
              level: "unknown",
              explanation: "Impact has not been classified.",
              affectedQuantityKeys: [],
            },
            reviewItemIds: [],
            source: {
              type: "user-configuration",
              reference: null,
              explanation: "Mismatched source type.",
            },
          }),
        ],
      },
    });

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
