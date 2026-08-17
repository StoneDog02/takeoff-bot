import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  userDecisionSchema,
  userDecisionValueSchema,
} from "../../src/core/schemas/user-decision.schema.js";

describe("userDecisionValueSchema", () => {
  it("accepts nested JSON-safe decision values", () => {
    const result = userDecisionValueSchema.parse({
      nominalSize: "2x6",
      spacingInches: 16,
      flags: [true, null],
    });

    assert.deepEqual(result, {
      nominalSize: "2x6",
      spacingInches: 16,
      flags: [true, null],
    });
  });

  it("rejects non-finite numbers", () => {
    assert.equal(userDecisionValueSchema.safeParse(Number.NaN).success, false);
    assert.equal(
      userDecisionValueSchema.safeParse(Number.POSITIVE_INFINITY).success,
      false,
    );
  });
});

describe("userDecisionSchema", () => {
  it("accepts confirmation of one Review Item", () => {
    const result = userDecisionSchema.parse({
      id: "UD-001",
      reviewItemId: "RI-014",
      result: {
        type: "confirmed",
        rationale: "The displayed default is correct for this project.",
      },
    });

    assert.equal(result.result.type, "confirmed");
    assert.equal(result.supersedesUserDecisionId, null);
  });

  it("accepts a traceable user-provided replacement value", () => {
    const result = userDecisionSchema.parse({
      id: "UD-002",
      reviewItemId: "RI-014",
      result: {
        type: "value-provided",
        value: "2x6",
        rationale: "Confirmed from the approved addendum.",
      },
    });

    assert.equal(result.result.type, "value-provided");

    if (result.result.type === "value-provided") {
      assert.equal(result.result.value, "2x6");
    }
  });

  it("accepts a revision that supersedes a prior decision", () => {
    const result = userDecisionSchema.parse({
      id: "UD-003",
      reviewItemId: "RI-014",
      result: {
        type: "option-selected",
        optionId: "wall-type-2x6",
        value: { studSize: "2x6", spacingInches: 16 },
      },
      supersedesUserDecisionId: "UD-002",
    });

    assert.equal(result.supersedesUserDecisionId, "UD-002");
  });

  it("rejects a decision that supersedes itself", () => {
    const result = userDecisionSchema.safeParse({
      id: "UD-003",
      reviewItemId: "RI-014",
      result: { type: "confirmed" },
      supersedesUserDecisionId: "UD-003",
    });

    assert.equal(result.success, false);
  });

  it("rejects conflict evidence that is both accepted and rejected", () => {
    const result = userDecisionSchema.safeParse({
      id: "UD-004",
      reviewItemId: "RI-020",
      result: {
        type: "conflict-resolved",
        value: "2x6",
        acceptedEvidenceIds: ["E-001", "E-001"],
        rejectedEvidenceIds: ["E-001", "E-002", "E-002"],
        rationale: "The revised wall schedule governs.",
      },
    });

    assert.equal(result.success, false);

    if (!result.success) {
      assert.equal(result.error.issues.length, 3);
    }
  });

  it("requires rationale for provided values and rejections", () => {
    const providedValueResult = userDecisionSchema.safeParse({
      id: "UD-005",
      reviewItemId: "RI-021",
      result: {
        type: "value-provided",
        value: "2x4",
        rationale: "",
      },
    });
    const rejectedResult = userDecisionSchema.safeParse({
      id: "UD-006",
      reviewItemId: "RI-022",
      result: {
        type: "rejected",
        rationale: "",
      },
    });

    assert.equal(providedValueResult.success, false);
    assert.equal(rejectedResult.success, false);
  });

  it("does not persist inspect-source as a decision result", () => {
    const result = userDecisionSchema.safeParse({
      id: "UD-007",
      reviewItemId: "RI-023",
      result: { type: "inspect-source" },
    });

    assert.equal(result.success, false);
  });
});
