import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { reviewItemSchema } from "../../src/core/schemas/review-item.schema.js";
import {
  validationIssueSchema,
  validationResultSchema,
} from "../../src/core/schemas/validation.schema.js";
import type { BlockingPayload } from "../../src/scopes/framing/schemas/framing-artifacts.schema.js";
import {
  BLOCKING_QUANTITY_KEYS,
  BLOCKING_RULE_IDS,
} from "../../src/scopes/framing/validators/rule-ids.js";
import { validateBlocking } from "../../src/scopes/framing/validators/blocking.validator.js";

const complete = {
  status: "complete",
  percentage: 100,
  completedItems: 1,
  totalItems: 1,
} as const;

function buildCompleteBlocking(
  overrides: Partial<BlockingPayload["blocking"][number]> = {},
): BlockingPayload["blocking"][number] {
  return {
    id: "BLK-001",
    objectType: "blocking",
    completion: complete,
    reviewStatus: "no-review-required",
    blockingStatus: "not-blocked",
    evidenceIds: ["E-BLK-001"],
    assumptionIds: [],
    validationIssueIds: [],
    reviewItemIds: [],
    resolutionTraces: [
      {
        propertyPath: "blockingType",
        method: "explicit-project-value",
        explanation: "Blocking type is explicit on the detail.",
        evidenceIds: ["E-BLK-001"],
        assumptionIds: [],
        validationIssueIds: [],
        reviewItemIds: [],
      },
      {
        propertyPath: "material",
        method: "explicit-project-value",
        explanation: "Material is explicit on the detail.",
        evidenceIds: ["E-BLK-001"],
        assumptionIds: [],
        validationIssueIds: [],
        reviewItemIds: [],
      },
      {
        propertyPath: "size",
        method: "explicit-project-value",
        explanation: "Size is explicit on the detail.",
        evidenceIds: ["E-BLK-001"],
        assumptionIds: [],
        validationIssueIds: [],
        reviewItemIds: [],
      },
      {
        propertyPath: "location",
        method: "explicit-project-value",
        explanation: "Location is explicit on the framing plan.",
        evidenceIds: ["E-BLK-001"],
        assumptionIds: [],
        validationIssueIds: [],
        reviewItemIds: [],
      },
    ],
    blockingType: "solid blocking",
    purpose: "sheathing edge support",
    structuralRole: "structural",
    material: "dimensional-lumber",
    size: "2x10",
    spacingInches: 48,
    location: "Level 2 floor bay between W-001 and W-002",
    detailReference: "S3.1/3",
    associatedObjectIds: ["FFA-001", "SHA-001"],
    ...overrides,
  };
}

function buildRelatedMaps() {
  return {
    relatedObjectsById: new Map([
      ["FFA-001", { objectId: "FFA-001", objectType: "floor-framing-area" }],
      ["SHA-001", { objectId: "SHA-001", objectType: "sheathing-area" }],
    ]),
  };
}

describe("validateBlocking", () => {
  it("accepts a fully resolved blocking object with passing results", () => {
    const batch = validateBlocking({
      payload: { blocking: [buildCompleteBlocking()] },
      ...buildRelatedMaps(),
    });

    assert.equal(batch.validationIssues.length, 0);
    assert.equal(batch.reviewItems.length, 0);
    assert.ok(batch.validationResults.length > 0);
    assert.ok(
      batch.validationResults.every((result) => result.outcome === "passed"),
    );
  });

  it("fails unresolved blocking type without blocking quantity takeoff", () => {
    const batch = validateBlocking({
      payload: {
        blocking: [
          buildCompleteBlocking({
            blockingType: null,
            resolutionTraces: [],
          }),
        ],
      },
    });

    const issue = batch.validationIssues.find(
      (entry) => entry.ruleId === BLOCKING_RULE_IDS.typeResolved,
    );

    assert.ok(issue);
    assert.equal(issue.severity, "critical");
    assert.equal(
      issue.quantityImpacts.find(
        (impact) => impact.quantityKey === BLOCKING_QUANTITY_KEYS.material,
      )?.canCalculate,
      false,
    );
    assert.equal(
      issue.quantityImpacts.find(
        (impact) => impact.quantityKey === BLOCKING_QUANTITY_KEYS.quantity,
      )?.canCalculate,
      true,
    );
  });

  it("warns on unresolved structural role without blocking takeoff quantities", () => {
    const batch = validateBlocking({
      payload: {
        blocking: [buildCompleteBlocking({ structuralRole: "unknown" })],
      },
    });

    const issue = batch.validationIssues.find(
      (entry) => entry.ruleId === BLOCKING_RULE_IDS.structuralRoleResolved,
    );

    assert.ok(issue);
    assert.equal(issue.severity, "warning");
    assert.ok(
      issue.quantityImpacts.every((impact) => impact.canCalculate === true),
    );
  });

  it("fails missing location as quantity-driving information", () => {
    const batch = validateBlocking({
      payload: {
        blocking: [
          buildCompleteBlocking({
            location: null,
            resolutionTraces: [
              {
                propertyPath: "blockingType",
                method: "explicit-project-value",
                explanation: "Blocking type is explicit on the detail.",
                evidenceIds: ["E-BLK-001"],
                assumptionIds: [],
                validationIssueIds: [],
                reviewItemIds: [],
              },
              {
                propertyPath: "material",
                method: "explicit-project-value",
                explanation: "Material is explicit on the detail.",
                evidenceIds: ["E-BLK-001"],
                assumptionIds: [],
                validationIssueIds: [],
                reviewItemIds: [],
              },
              {
                propertyPath: "size",
                method: "explicit-project-value",
                explanation: "Size is explicit on the detail.",
                evidenceIds: ["E-BLK-001"],
                assumptionIds: [],
                validationIssueIds: [],
                reviewItemIds: [],
              },
            ],
          }),
        ],
      },
    });

    const issue = batch.validationIssues.find(
      (entry) => entry.ruleId === BLOCKING_RULE_IDS.locationResolved,
    );

    assert.ok(issue);
    assert.equal(issue.severity, "critical");
    assert.equal(
      issue.quantityImpacts.find(
        (impact) => impact.quantityKey === BLOCKING_QUANTITY_KEYS.quantity,
      )?.canCalculate,
      false,
    );
    assert.equal(
      issue.quantityImpacts.find(
        (impact) => impact.quantityKey === BLOCKING_QUANTITY_KEYS.material,
      )?.canCalculate,
      true,
    );
  });

  it("fails missing material and size without blocking quantity takeoff", () => {
    const batch = validateBlocking({
      payload: {
        blocking: [
          buildCompleteBlocking({
            material: null,
            size: null,
            resolutionTraces: [
              {
                propertyPath: "blockingType",
                method: "explicit-project-value",
                explanation: "Blocking type is explicit on the detail.",
                evidenceIds: ["E-BLK-001"],
                assumptionIds: [],
                validationIssueIds: [],
                reviewItemIds: [],
              },
              {
                propertyPath: "location",
                method: "explicit-project-value",
                explanation: "Location is explicit on the framing plan.",
                evidenceIds: ["E-BLK-001"],
                assumptionIds: [],
                validationIssueIds: [],
                reviewItemIds: [],
              },
            ],
          }),
        ],
      },
    });

    const materialIssue = batch.validationIssues.find(
      (entry) => entry.ruleId === BLOCKING_RULE_IDS.materialResolved,
    );
    const sizeIssue = batch.validationIssues.find(
      (entry) => entry.ruleId === BLOCKING_RULE_IDS.sizeResolved,
    );

    assert.ok(materialIssue);
    assert.ok(sizeIssue);
    assert.equal(materialIssue.severity, "critical");
    assert.equal(sizeIssue.severity, "critical");
    assert.equal(
      sizeIssue.quantityImpacts.find(
        (impact) => impact.quantityKey === BLOCKING_QUANTITY_KEYS.material,
      )?.canCalculate,
      false,
    );
    assert.equal(
      sizeIssue.quantityImpacts.find(
        (impact) => impact.quantityKey === BLOCKING_QUANTITY_KEYS.quantity,
      )?.canCalculate,
      true,
    );
  });

  it("warns on dangling associated object references", () => {
    const batch = validateBlocking({
      payload: {
        blocking: [
          buildCompleteBlocking({ associatedObjectIds: ["FFA-MISSING"] }),
        ],
      },
      relatedObjectsById: buildRelatedMaps().relatedObjectsById,
    });

    const issue = batch.validationIssues.find(
      (entry) => entry.ruleId === BLOCKING_RULE_IDS.associatedObjectsResolved,
    );

    assert.ok(issue);
    assert.equal(issue.severity, "warning");
    assert.equal(issue.quantityImpacts[0]?.canCalculate, true);
  });

  it("skips associated-object validation when related artifacts are not provided", () => {
    const batch = validateBlocking({
      payload: { blocking: [buildCompleteBlocking()] },
    });

    const associatedResult = batch.validationResults.find(
      (entry) => entry.ruleId === BLOCKING_RULE_IDS.associatedObjectsResolved,
    );

    assert.equal(associatedResult?.outcome, "skipped");
  });

  it("passes empty associated-object arrays without requiring related artifacts", () => {
    const batch = validateBlocking({
      payload: {
        blocking: [buildCompleteBlocking({ associatedObjectIds: [] })],
      },
    });

    const associatedResult = batch.validationResults.find(
      (entry) => entry.ruleId === BLOCKING_RULE_IDS.associatedObjectsResolved,
    );

    assert.equal(associatedResult?.outcome, "passed");
  });

  it("produces deterministic IDs and output across identical reruns", () => {
    const batchInput = {
      payload: {
        blocking: [
          buildCompleteBlocking({
            blockingType: null,
            resolutionTraces: [],
          }),
        ],
      },
    };

    const first = validateBlocking(batchInput);
    const second = validateBlocking(batchInput);

    assert.deepEqual(first, second);
    const typeIssue = first.validationIssues.find(
      (entry) => entry.ruleId === BLOCKING_RULE_IDS.typeResolved,
    );

    assert.equal(
      typeIssue?.id,
      "VI-blocking-type-resolved-object-BLK-001",
    );
  });

  it("parses generated issues, results, and review items through core schemas", () => {
    const batch = validateBlocking({
      payload: {
        blocking: [
          buildCompleteBlocking({
            blockingType: null,
            structuralRole: "unknown",
            material: null,
            size: null,
            location: null,
            associatedObjectIds: ["FFA-MISSING"],
            resolutionTraces: [],
          }),
        ],
      },
      ...buildRelatedMaps(),
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
