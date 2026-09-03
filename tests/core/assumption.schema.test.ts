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
    reviewRequired: true,
  } as const;
}

describe("assumptionSchema", () => {
  it("accepts a governed default assumption", () => {
    const result = assumptionSchema.parse(createValidAssumption());

    assert.equal(result.id, "A-014");
    assert.equal(result.target.propertyPath, "assembly.studSize");
    assert.equal(result.reviewRequired, true);
  });

  it("rejects duplicate quantity-impact keys", () => {
    const result = assumptionSchema.safeParse({
      ...createValidAssumption(),
      materialImpact: {
        ...createValidAssumption().materialImpact,
        affectedQuantityKeys: ["wall.studs", "wall.studs"],
      },
    });

    assert.equal(result.success, false);

    if (!result.success) {
      assert.equal(result.error.issues.length, 1);
    }
  });
});
