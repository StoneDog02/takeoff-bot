import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { calculateStructuralMembers } from "../../src/scopes/framing/calculators/calculateStructuralMembers.js";
import type {
  StructuralMembersPayload,
  ValidationPayload,
} from "../../src/scopes/framing/schemas/framing-artifacts.schema.js";
import { framingMaterialLineItemSchema } from "../../src/scopes/framing/schemas/material.schema.js";
import type { StructuralMember } from "../../src/scopes/framing/schemas/structural-member.schema.js";
import { createValidationIssue } from "../../src/scopes/framing/validators/createValidationIssue.js";
import { createObjectTarget } from "../../src/scopes/framing/validators/ids.js";
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

function resolvedTrace(propertyPath: string, assumptionIds: string[] = []) {
  return {
    propertyPath,
    method: "explicit-project-value" as const,
    explanation: `${propertyPath} is explicit on the schedule.`,
    evidenceIds: ["E-008"],
    assumptionIds,
    validationIssueIds: [],
    reviewItemIds: assumptionIds.length > 0 ? ["RI-TRACE"] : [],
  };
}

function buildMember(
  overrides: Partial<StructuralMember> = {},
): StructuralMember {
  return {
    id: "SM-008",
    objectType: "structural-member",
    completion: complete,
    reviewStatus: "no-review-required",
    blockingStatus: "not-blocked",
    evidenceIds: ["E-008"],
    assumptionIds: ["A-MEMBER"],
    validationIssueIds: [],
    reviewItemIds: ["RI-MEMBER"],
    resolutionTraces: [
      resolvedTrace("materialType"),
      resolvedTrace("size"),
      resolvedTrace("lengthFeet", ["A-LENGTH"]),
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
    ...overrides,
  };
}

function buildPayload(
  members: StructuralMember[] = [buildMember()],
): StructuralMembersPayload {
  return { structuralMembers: members };
}

function emptyValidation(
  issues: ValidationPayload["validationIssues"] = [],
): ValidationPayload {
  return {
    validationIssues: issues,
    validationResults: [],
    reviewItems: [],
  };
}

describe("calculateStructuralMembers", () => {
  it("calculates net LF for a resolved single-piece member", () => {
    const [item] = calculateStructuralMembers(buildPayload());

    assert.equal(item?.quantity, 6);
    assert.equal(item?.unit, "linear-foot");
    assert.equal(item?.category, "engineered-wood");
    assert.equal(item?.canonicalClassification, "header-lvl-1.75x11.875");
  });

  it("multiplies length by repeated single-piece quantity", () => {
    const [item] = calculateStructuralMembers(
      buildPayload([buildMember({ quantity: 3 })]),
    );

    assert.equal(item?.quantity, 18);
  });

  it("multiplies ply count for an explicitly built-up member", () => {
    const [item] = calculateStructuralMembers(
      buildPayload([
        buildMember({
          category: "built-up-member",
          plyCount: 2,
          resolutionTraces: [
            ...buildMember().resolutionTraces,
            resolvedTrace("plyCount"),
          ],
        }),
      ]),
    );

    assert.equal(item?.quantity, 12);
    assert.match(item?.description ?? "", /2-ply/);
  });

  it("multiplies repeated quantity and ply count for a built-up member", () => {
    const [item] = calculateStructuralMembers(
      buildPayload([
        buildMember({
          category: "built-up-member",
          plyCount: 2,
          quantity: 3,
          resolutionTraces: [
            ...buildMember().resolutionTraces,
            resolvedTrace("plyCount"),
          ],
        }),
      ]),
    );

    assert.equal(item?.quantity, 36);
  });

  it("calculates when plyCount is null on a non-built-up member", () => {
    const materials = calculateStructuralMembers(
      buildPayload([buildMember({ plyCount: null })]),
    );

    assert.equal(materials[0]?.quantity, 6);
  });

  it("skips an explicitly built-up member with null ply count", () => {
    const materials = calculateStructuralMembers(
      buildPayload([
        buildMember({
          category: "built-up-member",
          plyCount: null,
        }),
      ]),
    );

    assert.equal(materials.length, 0);
  });

  it("skips an explicitly built-up member with unresolved ply count", () => {
    const materials = calculateStructuralMembers(
      buildPayload([
        buildMember({
          category: "built-up-member",
          plyCount: 2,
          resolutionTraces: [
            ...buildMember().resolutionTraces,
            {
              propertyPath: "plyCount",
              method: "unresolved",
              explanation: "Ply count was not resolved.",
              evidenceIds: [],
              assumptionIds: [],
              validationIssueIds: [],
              reviewItemIds: [],
            },
          ],
        }),
      ]),
    );

    assert.equal(materials.length, 0);
  });

  it("skips when length is unresolved", () => {
    const materials = calculateStructuralMembers(
      buildPayload([buildMember({ lengthFeet: null })]),
    );

    assert.equal(materials.length, 0);
  });

  it("skips when quantity is explicitly unresolved", () => {
    const materials = calculateStructuralMembers(
      buildPayload([
        buildMember({
          quantity: 2,
          resolutionTraces: [
            resolvedTrace("materialType"),
            resolvedTrace("size"),
            resolvedTrace("lengthFeet"),
            {
              propertyPath: "quantity",
              method: "unresolved",
              explanation: "Quantity was not resolved.",
              evidenceIds: [],
              assumptionIds: [],
              validationIssueIds: [],
              reviewItemIds: [],
            },
          ],
        }),
      ]),
    );

    assert.equal(materials.length, 0);
  });

  it("skips when material identity is unresolved", () => {
    const missingSize = calculateStructuralMembers(
      buildPayload([buildMember({ size: null })]),
    );
    const unknownCategory = calculateStructuralMembers(
      buildPayload([buildMember({ category: "unknown" })]),
    );
    const missingMaterial = calculateStructuralMembers(
      buildPayload([buildMember({ materialType: null })]),
    );

    assert.equal(missingSize.length, 0);
    assert.equal(unknownCategory.length, 0);
    assert.equal(missingMaterial.length, 0);
  });

  it("passes quantity validation and emits 18 LF when quantity is 3", () => {
    const member = buildMember({ quantity: 3 });
    const payload = buildPayload([member]);
    const validation = validateStructuralMembers({ payload });
    const [item] = calculateStructuralMembers(payload, validation);

    assert.equal(
      validation.validationResults.find(
        (entry) => entry.ruleId === STRUCTURAL_MEMBER_RULE_IDS.quantityResolved,
      )?.outcome,
      "passed",
    );
    assert.equal(item?.quantity, 18);
  });

  it("suppresses only when Validation blocks member material or length", () => {
    const member = buildMember();
    const validation = emptyValidation([
      createValidationIssue({
        ruleId: "member.length.resolved",
        level: "object",
        severity: "critical",
        ruleViolated: "Member length cannot be calculated.",
        explanation: "Validation blocked length only.",
        target: createObjectTarget(member.id, member.objectType),
        quantityImpacts: [
          {
            quantityKey: STRUCTURAL_MEMBER_QUANTITY_KEYS.length,
            description: "Member length takeoff cannot proceed.",
            canCalculate: false,
          },
        ],
      }),
    ]);

    assert.equal(
      calculateStructuralMembers(buildPayload([member]), validation).length,
      0,
    );
  });

  it("does not suppress output for unrelated Validation", () => {
    const member = buildMember();
    const validation = emptyValidation([
      createValidationIssue({
        ruleId: "member.connectors.resolved",
        level: "relationship",
        severity: "warning",
        ruleViolated: "Connector review is unrelated to material LF.",
        explanation: "Unrelated connector review.",
        target: createObjectTarget(member.id, member.objectType),
        quantityImpacts: [
          {
            quantityKey: STRUCTURAL_MEMBER_QUANTITY_KEYS.material,
            description: "Material takeoff may still proceed.",
            canCalculate: true,
          },
        ],
      }),
    ]);
    const [item] = calculateStructuralMembers(
      buildPayload([member]),
      validation,
    );

    assert.equal(item?.quantity, 6);
  });

  it("preserves source object, assumption, and review provenance", () => {
    const [item] = calculateStructuralMembers(buildPayload());

    assert.deepEqual(item?.sourceObjectIds, ["SM-008"]);
    assert.deepEqual(item?.assumptionIds, ["A-LENGTH", "A-MEMBER"]);
    assert.deepEqual(item?.reviewItemIds, ["RI-MEMBER", "RI-TRACE"]);
  });

  it("is deterministic across reruns", () => {
    const payload = buildPayload();

    assert.deepEqual(
      calculateStructuralMembers(payload),
      calculateStructuralMembers(payload),
    );
  });

  it("emits line items that parse through FramingMaterialLineItem", () => {
    const materials = calculateStructuralMembers(
      buildPayload([
        buildMember(),
        buildMember({
          id: "SM-009",
          category: "built-up-member",
          plyCount: 3,
          resolutionTraces: [
            ...buildMember().resolutionTraces,
            resolvedTrace("plyCount"),
          ],
        }),
      ]),
    );

    assert.equal(materials.length, 2);
    for (const item of materials) {
      assert.deepEqual(framingMaterialLineItemSchema.parse(item), item);
    }
  });
});
