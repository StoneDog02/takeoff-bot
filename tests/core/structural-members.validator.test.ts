import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { reviewItemSchema } from "../../src/core/schemas/review-item.schema.js";
import {
  validationIssueSchema,
  validationResultSchema,
} from "../../src/core/schemas/validation.schema.js";
import type { StructuralMembersPayload } from "../../src/scopes/framing/schemas/framing-artifacts.schema.js";
import {
  STRUCTURAL_MEMBER_QUANTITY_KEYS,
  STRUCTURAL_MEMBER_RULE_IDS,
} from "../../src/scopes/framing/validators/rule-ids.js";
import { validateStructuralMembers } from "../../src/scopes/framing/validators/structural-members.validator.js";

const complete = {
  status: "complete",
  percentage: 100,
  completedItems: 1,
  totalItems: 1,
} as const;

function buildCompleteMember(
  overrides: Partial<StructuralMembersPayload["structuralMembers"][number]> = {},
): StructuralMembersPayload["structuralMembers"][number] {
  return {
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
      {
        propertyPath: "materialType",
        method: "explicit-project-value",
        explanation: "Material is explicit on the schedule.",
        evidenceIds: ["E-008"],
        assumptionIds: [],
        validationIssueIds: [],
        reviewItemIds: [],
      },
      {
        propertyPath: "size",
        method: "explicit-project-value",
        explanation: "Size is explicit on the schedule.",
        evidenceIds: ["E-008"],
        assumptionIds: [],
        validationIssueIds: [],
        reviewItemIds: [],
      },
      {
        propertyPath: "lengthFeet",
        method: "explicit-project-value",
        explanation: "Length is explicit on the plan.",
        evidenceIds: ["E-008"],
        assumptionIds: [],
        validationIssueIds: [],
        reviewItemIds: [],
      },
    ],
    category: "header",
    materialType: "lvl",
    size: "1.75x11.875",
    plyCount: 2,
    lengthFeet: 6,
    quantity: 1,
    location: "W-001 window header",
    associatedObjectIds: ["O-014", "W-001"],
    supportedObjectIds: [],
    supportingObjectIds: ["W-001"],
    connectorIds: ["CN-001"],
    ...overrides,
  };
}

function buildRelatedMaps() {
  return {
    relatedObjectsById: new Map([
      ["O-014", { objectId: "O-014", objectType: "opening" }],
      ["W-001", { objectId: "W-001", objectType: "building-wall" }],
    ]),
    connectorsById: new Map([
      ["CN-001", { objectId: "CN-001", objectType: "connector" }],
    ]),
  };
}

describe("validateStructuralMembers", () => {
  it("accepts a complete structural member with passing results", () => {
    const batch = validateStructuralMembers({
      payload: { structuralMembers: [buildCompleteMember()] },
      ...buildRelatedMaps(),
    });

    assert.equal(batch.validationIssues.length, 0);
    assert.equal(batch.reviewItems.length, 0);
    assert.ok(batch.validationResults.length > 0);
    assert.ok(
      batch.validationResults.every((result) => result.outcome === "passed"),
    );
  });

  it("fails unresolved member category", () => {
    const batch = validateStructuralMembers({
      payload: {
        structuralMembers: [buildCompleteMember({ category: "unknown" })],
      },
      ...buildRelatedMaps(),
    });

    const issue = batch.validationIssues.find(
      (entry) => entry.ruleId === STRUCTURAL_MEMBER_RULE_IDS.categoryResolved,
    );

    assert.ok(issue);
    assert.equal(issue.severity, "critical");
    assert.ok(
      issue.quantityImpacts.every((impact) => impact.canCalculate === false),
    );
  });

  it("fails missing material type", () => {
    const batch = validateStructuralMembers({
      payload: {
        structuralMembers: [
          buildCompleteMember({
            materialType: null,
            resolutionTraces: [],
          }),
        ],
      },
      ...buildRelatedMaps(),
    });

    const issue = batch.validationIssues.find(
      (entry) => entry.ruleId === STRUCTURAL_MEMBER_RULE_IDS.materialResolved,
    );

    assert.ok(issue);
    assert.equal(issue.severity, "critical");
    assert.equal(
      issue.quantityImpacts[0]?.quantityKey,
      STRUCTURAL_MEMBER_QUANTITY_KEYS.material,
    );
  });

  it("fails missing member size", () => {
    const batch = validateStructuralMembers({
      payload: {
        structuralMembers: [
          buildCompleteMember({
            size: null,
            resolutionTraces: [],
          }),
        ],
      },
      ...buildRelatedMaps(),
    });

    const issue = batch.validationIssues.find(
      (entry) => entry.ruleId === STRUCTURAL_MEMBER_RULE_IDS.sizeResolved,
    );

    assert.ok(issue);
    assert.equal(issue.severity, "critical");
  });

  it("fails missing quantity", () => {
    const batch = validateStructuralMembers({
      payload: {
        structuralMembers: [
          buildCompleteMember({
            quantity: null,
            resolutionTraces: [],
          }),
        ],
      },
      ...buildRelatedMaps(),
    });

    const issue = batch.validationIssues.find(
      (entry) => entry.ruleId === STRUCTURAL_MEMBER_RULE_IDS.quantityResolved,
    );
    const reviewItem = batch.reviewItems.find((entry) =>
      entry.validationIssueIds.includes(issue!.id),
    );

    assert.ok(issue);
    assert.equal(issue.severity, "critical");
    assert.equal(
      issue.quantityImpacts[0]?.quantityKey,
      STRUCTURAL_MEMBER_QUANTITY_KEYS.material,
    );
    assert.equal(issue.quantityImpacts[0]?.canCalculate, false);
    assert.ok(reviewItem);
    assert.equal(reviewItem.action?.targetProperty, "quantity");
    assert.deepEqual(reviewItem.affectedObjects, [
      { objectId: "SM-008", objectType: "structural-member" },
    ]);
  });

  it("fails conflicting quantity without reinterpreting resolver traces", () => {
    const batch = validateStructuralMembers({
      payload: {
        structuralMembers: [
          buildCompleteMember({
            quantity: null,
            resolutionTraces: [
              ...buildCompleteMember().resolutionTraces,
              {
                propertyPath: "quantity",
                method: "unresolved",
                explanation: "Conflicting candidate values (1, 2).",
                evidenceIds: ["E-QTY-A", "E-QTY-B"],
                assumptionIds: [],
                validationIssueIds: [],
                reviewItemIds: [],
              },
            ],
          }),
        ],
      },
      ...buildRelatedMaps(),
    });

    const issue = batch.validationIssues.find(
      (entry) => entry.ruleId === STRUCTURAL_MEMBER_RULE_IDS.quantityResolved,
    );

    assert.ok(issue);
    assert.equal(issue.quantityImpacts[0]?.canCalculate, false);
  });

  it("passes resolved quantity", () => {
    const batch = validateStructuralMembers({
      payload: {
        structuralMembers: [
          buildCompleteMember({
            quantity: 3,
            resolutionTraces: [
              ...buildCompleteMember().resolutionTraces,
              {
                propertyPath: "quantity",
                method: "explicit-project-value",
                explanation: "Quantity is explicit on the schedule.",
                evidenceIds: ["E-008"],
                assumptionIds: [],
                validationIssueIds: [],
                reviewItemIds: [],
              },
            ],
          }),
        ],
      },
      ...buildRelatedMaps(),
    });

    const result = batch.validationResults.find(
      (entry) => entry.ruleId === STRUCTURAL_MEMBER_RULE_IDS.quantityResolved,
    );

    assert.equal(result?.outcome, "passed");
    assert.equal(
      batch.validationIssues.some(
        (entry) => entry.ruleId === STRUCTURAL_MEMBER_RULE_IDS.quantityResolved,
      ),
      false,
    );
  });

  it("does not block material LF when only location is null", () => {
    const batch = validateStructuralMembers({
      payload: {
        structuralMembers: [buildCompleteMember({ location: null })],
      },
      ...buildRelatedMaps(),
    });

    assert.equal(
      batch.validationIssues.some(
        (entry) => entry.ruleId === STRUCTURAL_MEMBER_RULE_IDS.quantityResolved,
      ),
      false,
    );
    assert.equal(
      batch.validationIssues.some((entry) =>
        entry.ruleId.includes("location"),
      ),
      false,
    );
  });

  it("blocks only the unresolved member in a mixed quantity payload", () => {
    const batch = validateStructuralMembers({
      payload: {
        structuralMembers: [
          buildCompleteMember({
            id: "SM-HDR-001",
            quantity: 1,
            lengthFeet: 6,
          }),
          buildCompleteMember({
            id: "SM-HDR-002",
            quantity: null,
            lengthFeet: 8,
            resolutionTraces: [],
          }),
        ],
      },
      ...buildRelatedMaps(),
    });

    const hdr001Issue = batch.validationIssues.find(
      (entry) =>
        entry.ruleId === STRUCTURAL_MEMBER_RULE_IDS.quantityResolved &&
        entry.target.objectId === "SM-HDR-001",
    );
    const hdr002Issue = batch.validationIssues.find(
      (entry) =>
        entry.ruleId === STRUCTURAL_MEMBER_RULE_IDS.quantityResolved &&
        entry.target.objectId === "SM-HDR-002",
    );

    assert.equal(hdr001Issue, undefined);
    assert.ok(hdr002Issue);
  });

  it("keeps plyCount validation independent from quantity validation", () => {
    const quantityUnresolvedBuiltUp = validateStructuralMembers({
      payload: {
        structuralMembers: [
          buildCompleteMember({
            category: "built-up-member",
            quantity: null,
            plyCount: 2,
            resolutionTraces: [],
          }),
        ],
      },
      ...buildRelatedMaps(),
    });
    const plyCountUnresolvedBuiltUp = validateStructuralMembers({
      payload: {
        structuralMembers: [
          buildCompleteMember({
            category: "built-up-member",
            quantity: 1,
            plyCount: null,
            resolutionTraces: [],
          }),
        ],
      },
      ...buildRelatedMaps(),
    });

    assert.ok(
      quantityUnresolvedBuiltUp.validationIssues.some(
        (entry) => entry.ruleId === STRUCTURAL_MEMBER_RULE_IDS.quantityResolved,
      ),
    );
    assert.equal(
      quantityUnresolvedBuiltUp.validationIssues.some(
        (entry) => entry.ruleId === STRUCTURAL_MEMBER_RULE_IDS.plyCountResolved,
      ),
      false,
    );
    assert.ok(
      plyCountUnresolvedBuiltUp.validationIssues.some(
        (entry) => entry.ruleId === STRUCTURAL_MEMBER_RULE_IDS.plyCountResolved,
      ),
    );
    assert.equal(
      plyCountUnresolvedBuiltUp.validationIssues.some(
        (entry) => entry.ruleId === STRUCTURAL_MEMBER_RULE_IDS.quantityResolved,
      ),
      false,
    );
  });

  it("fails missing member length", () => {
    const batch = validateStructuralMembers({
      payload: {
        structuralMembers: [
          buildCompleteMember({
            lengthFeet: null,
            resolutionTraces: [],
          }),
        ],
      },
      ...buildRelatedMaps(),
    });

    const issue = batch.validationIssues.find(
      (entry) => entry.ruleId === STRUCTURAL_MEMBER_RULE_IDS.lengthResolved,
    );

    assert.ok(issue);
    assert.equal(issue.severity, "critical");
    assert.equal(
      issue.quantityImpacts[0]?.quantityKey,
      STRUCTURAL_MEMBER_QUANTITY_KEYS.length,
    );
  });

  it("fails missing ply count for built-up members", () => {
    const batch = validateStructuralMembers({
      payload: {
        structuralMembers: [
          buildCompleteMember({
            category: "built-up-member",
            plyCount: null,
            resolutionTraces: [],
          }),
        ],
      },
      ...buildRelatedMaps(),
    });

    const issue = batch.validationIssues.find(
      (entry) => entry.ruleId === STRUCTURAL_MEMBER_RULE_IDS.plyCountResolved,
    );

    assert.ok(issue);
    assert.equal(issue.severity, "critical");
  });

  it("passes ply count validation for non-built-up members without ply count", () => {
    const batch = validateStructuralMembers({
      payload: {
        structuralMembers: [
          buildCompleteMember({
            category: "header",
            plyCount: null,
          }),
        ],
      },
      ...buildRelatedMaps(),
    });

    const result = batch.validationResults.find(
      (entry) => entry.ruleId === STRUCTURAL_MEMBER_RULE_IDS.plyCountResolved,
    );

    assert.equal(result?.outcome, "passed");
  });

  it("warns on dangling associated object references", () => {
    const batch = validateStructuralMembers({
      payload: {
        structuralMembers: [
          buildCompleteMember({
            associatedObjectIds: ["O-MISSING"],
          }),
        ],
      },
      relatedObjectsById: buildRelatedMaps().relatedObjectsById,
    });

    const issue = batch.validationIssues.find(
      (entry) =>
        entry.ruleId === STRUCTURAL_MEMBER_RULE_IDS.associatedObjectsResolved,
    );

    assert.ok(issue);
    assert.equal(issue.severity, "warning");
    assert.equal(
      issue.quantityImpacts[0]?.canCalculate,
      true,
    );
  });

  it("fails dangling supported object references", () => {
    const batch = validateStructuralMembers({
      payload: {
        structuralMembers: [
          buildCompleteMember({
            supportedObjectIds: ["SM-MISSING"],
          }),
        ],
      },
      relatedObjectsById: buildRelatedMaps().relatedObjectsById,
    });

    const issue = batch.validationIssues.find(
      (entry) =>
        entry.ruleId === STRUCTURAL_MEMBER_RULE_IDS.supportedObjectsResolved,
    );

    assert.ok(issue);
    assert.equal(issue.severity, "critical");
    assert.equal(
      issue.quantityImpacts[0]?.quantityKey,
      STRUCTURAL_MEMBER_QUANTITY_KEYS.length,
    );
  });

  it("skips relationship validation when related artifacts are not provided", () => {
    const batch = validateStructuralMembers({
      payload: { structuralMembers: [buildCompleteMember()] },
    });

    const associatedResult = batch.validationResults.find(
      (entry) =>
        entry.ruleId === STRUCTURAL_MEMBER_RULE_IDS.associatedObjectsResolved,
    );
    const connectorResult = batch.validationResults.find(
      (entry) =>
        entry.ruleId === STRUCTURAL_MEMBER_RULE_IDS.connectorReferencesResolved,
    );

    assert.equal(associatedResult?.outcome, "skipped");
    assert.equal(connectorResult?.outcome, "skipped");
  });

  it("does not activate associated-object validation when only connector artifacts are provided", () => {
    const batch = validateStructuralMembers({
      payload: { structuralMembers: [buildCompleteMember()] },
      connectorsById: buildRelatedMaps().connectorsById,
    });

    const associatedResult = batch.validationResults.find(
      (entry) =>
        entry.ruleId === STRUCTURAL_MEMBER_RULE_IDS.associatedObjectsResolved,
    );
    const connectorResult = batch.validationResults.find(
      (entry) =>
        entry.ruleId === STRUCTURAL_MEMBER_RULE_IDS.connectorReferencesResolved,
    );

    assert.equal(associatedResult?.outcome, "skipped");
    assert.equal(connectorResult?.outcome, "passed");
  });

  it("produces deterministic IDs and output across identical reruns", () => {
    const batchInput = {
      payload: {
        structuralMembers: [buildCompleteMember({ category: "unknown" })],
      },
      ...buildRelatedMaps(),
    };

    const first = validateStructuralMembers(batchInput);
    const second = validateStructuralMembers(batchInput);

    assert.deepEqual(first, second);
    const categoryIssue = first.validationIssues.find(
      (entry) => entry.ruleId === STRUCTURAL_MEMBER_RULE_IDS.categoryResolved,
    );

    assert.equal(
      categoryIssue?.id,
      "VI-member-category-resolved-object-SM-008",
    );
  });

  it("parses generated issues, results, and review items through core schemas", () => {
    const batch = validateStructuralMembers({
      payload: {
        structuralMembers: [
          buildCompleteMember({
            category: "unknown",
            materialType: null,
            size: null,
            lengthFeet: null,
            associatedObjectIds: ["O-MISSING"],
            supportedObjectIds: ["SM-MISSING"],
            connectorIds: ["CN-MISSING"],
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
