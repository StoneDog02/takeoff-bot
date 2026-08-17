import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assumptionSchema } from "../../src/core/schemas/assumption.schema.js";

function createValidAssumption() {
  return {
    id: "A-014",
    category: "industry-default",
    target: {
      objectId: "W-017",
      objectType: "wall",
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
  } as const;
}

describe("assumptionSchema", () => {
  it("accepts a traceable active assumption", () => {
    const result = assumptionSchema.parse(createValidAssumption());

    assert.equal(result.id, "A-014");
    assert.equal(result.target.propertyPath, "assembly.studSize");
    assert.equal(result.userDecisionId, null);
  });

  it("requires a User Decision for confirmed assumptions", () => {
    const result = assumptionSchema.safeParse({
      ...createValidAssumption(),
      status: "confirmed",
    });

    assert.equal(result.success, false);
  });

  it("accepts a replaced assumption without embedding its replacement value", () => {
    const result = assumptionSchema.parse({
      ...createValidAssumption(),
      status: "replaced",
      userDecisionId: "UD-009",
    });

    assert.equal(result.status, "replaced");
    assert.equal(result.userDecisionId, "UD-009");
    assert.equal("replacementValue" in result, false);
  });

  it("rejects a resolving User Decision on an active assumption", () => {
    const result = assumptionSchema.safeParse({
      ...createValidAssumption(),
      userDecisionId: "UD-009",
    });

    assert.equal(result.success, false);
  });

  it("rejects replacement of a non-editable assumption", () => {
    const result = assumptionSchema.safeParse({
      ...createValidAssumption(),
      userEditable: false,
      status: "replaced",
      userDecisionId: "UD-009",
    });

    assert.equal(result.success, false);
  });

  it("rejects duplicate relationship and quantity-impact IDs", () => {
    const result = assumptionSchema.safeParse({
      ...createValidAssumption(),
      evidenceIds: ["E-001", "E-001"],
      reviewItemIds: ["RI-014", "RI-014"],
      materialImpact: {
        ...createValidAssumption().materialImpact,
        affectedQuantityKeys: ["wall.studs", "wall.studs"],
      },
    });

    assert.equal(result.success, false);

    if (!result.success) {
      assert.equal(result.error.issues.length, 3);
    }
  });
});
