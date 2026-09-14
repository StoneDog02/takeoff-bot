import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  consultAssumptionRegistry,
  lookupAssumptionRegistryEntry,
  WALL_ASSUMPTION_RULE_IDS,
  type AssumptionRegistryContext,
} from "../../src/framing/assumptions/index.js";
import { OPENING_QUANTITY_KEYS } from "../../src/framing/validators/rule-ids.js";

/**
 * S3-DEC-1 assumption eligibility tests per V1 Spec §15.5 / §21.
 *
 * WALL-ASSUME-005 is a positive-disqualifier rule (A):
 * - 005 may apply to an ordinary eligible opening unless existing evidence
 *   has identified the host as engineered/tall/special AND structural jamb
 *   design is implicated — then forbidden.
 * - Unknown wall class does NOT by itself make 005 insufficient_resolution
 *   or forbidden.
 * - Do not require affirmative proof the wall is ordinary.
 */
describe("WALL-ASSUME-005 king stud eligibility (rule A)", () => {
  const baseContext: AssumptionRegistryContext = {
    objectId: "O-001",
  };

  it("maps king stud assumption to WALL-ASSUME-005", () => {
    const entry = lookupAssumptionRegistryEntry(
      OPENING_QUANTITY_KEYS.kingStuds,
      "kingStudCount",
    );

    assert.ok(entry);
    assert.equal(entry.ruleId, WALL_ASSUMPTION_RULE_IDS.kingStudFallback);
    assert.equal(entry.ruleId, "WALL-ASSUME-005");
  });

  it("is eligible when wall classification context is absent (unknown class)", () => {
    const result = consultAssumptionRegistry({
      quantityKey: OPENING_QUANTITY_KEYS.kingStuds,
      propertyPath: "kingStudCount",
      context: baseContext,
    });

    assert.equal(result.outcome, "assumed");
    if (result.outcome === "assumed") {
      assert.equal(result.eligibilityState, "eligible");
      assert.equal(result.assumedValue, 2);
    }
  });

  it("is eligible when wall is not identified as special", () => {
    const result = consultAssumptionRegistry({
      quantityKey: OPENING_QUANTITY_KEYS.kingStuds,
      propertyPath: "kingStudCount",
      context: {
        ...baseContext,
        wallClassification: {
          isIdentifiedSpecial: false,
          structuralJambImplicated: false,
        },
      },
    });

    assert.equal(result.outcome, "assumed");
    if (result.outcome === "assumed") {
      assert.equal(result.eligibilityState, "eligible");
    }
  });

  it("is eligible when wall is identified special but structural jamb NOT implicated", () => {
    const result = consultAssumptionRegistry({
      quantityKey: OPENING_QUANTITY_KEYS.kingStuds,
      propertyPath: "kingStudCount",
      context: {
        ...baseContext,
        wallClassification: {
          isIdentifiedSpecial: true,
          structuralJambImplicated: false,
        },
      },
    });

    assert.equal(result.outcome, "assumed");
    if (result.outcome === "assumed") {
      assert.equal(result.eligibilityState, "eligible");
    }
  });

  it("is forbidden when wall is identified special AND structural jamb implicated", () => {
    const result = consultAssumptionRegistry({
      quantityKey: OPENING_QUANTITY_KEYS.kingStuds,
      propertyPath: "kingStudCount",
      context: {
        ...baseContext,
        wallClassification: {
          isIdentifiedSpecial: true,
          structuralJambImplicated: true,
        },
      },
    });

    assert.equal(result.outcome, "forbidden");
    if (result.outcome === "forbidden") {
      assert.equal(result.eligibilityState, "forbidden");
      assert.equal(result.entry.ruleId, "WALL-ASSUME-005");
    }
  });

  it("is NOT insufficient_resolution when wall class is unknown", () => {
    const result = consultAssumptionRegistry({
      quantityKey: OPENING_QUANTITY_KEYS.kingStuds,
      propertyPath: "kingStudCount",
      context: baseContext,
    });

    assert.notEqual(result.outcome, "insufficient-resolution");
    assert.equal(result.outcome, "assumed");
  });
});

describe("WALL-ASSUME-006 window sill eligibility", () => {
  const baseContext: AssumptionRegistryContext = {
    objectId: "O-001",
    derivationInputs: { wallStudSize: "2x4" },
  };

  it("maps window sill assumption to WALL-ASSUME-006", () => {
    const entry = lookupAssumptionRegistryEntry(
      OPENING_QUANTITY_KEYS.roughSill,
      "roughSillSize",
    );

    assert.ok(entry);
    assert.equal(entry.ruleId, WALL_ASSUMPTION_RULE_IDS.windowSillMaterial);
    assert.equal(entry.ruleId, "WALL-ASSUME-006");
  });

  it("is eligible when wall stud size is available", () => {
    const result = consultAssumptionRegistry({
      quantityKey: OPENING_QUANTITY_KEYS.roughSill,
      propertyPath: "roughSillSize",
      context: baseContext,
    });

    assert.equal(result.outcome, "assumed");
    if (result.outcome === "assumed") {
      assert.equal(result.eligibilityState, "eligible");
      assert.equal(result.assumedValue, "2x4");
    }
  });

  it("is not_eligible when wall stud size is missing", () => {
    const result = consultAssumptionRegistry({
      quantityKey: OPENING_QUANTITY_KEYS.roughSill,
      propertyPath: "roughSillSize",
      context: { objectId: "O-001" },
    });

    assert.equal(result.outcome, "not-eligible");
    if (result.outcome === "not-eligible") {
      assert.equal(result.eligibilityState, "not_eligible");
    }
  });

  it("is not_eligible when wall stud size is empty string", () => {
    const result = consultAssumptionRegistry({
      quantityKey: OPENING_QUANTITY_KEYS.roughSill,
      propertyPath: "roughSillSize",
      context: {
        objectId: "O-001",
        derivationInputs: { wallStudSize: "  " },
      },
    });

    assert.equal(result.outcome, "not-eligible");
  });
});

describe("eligibility state model", () => {
  it("returns not-registered for unknown quantityKey", () => {
    const result = consultAssumptionRegistry({
      quantityKey: "unknown.key",
      propertyPath: "unknownProperty",
      context: { objectId: "O-001" },
    });

    assert.equal(result.outcome, "not-registered");
  });

  it("cripple layout assumptions have no rule ID (not wall assumption)", () => {
    const entry = lookupAssumptionRegistryEntry(
      OPENING_QUANTITY_KEYS.cripplesAbove,
      "crippleStudLayout",
    );

    assert.ok(entry);
    assert.equal(entry.ruleId, null);
  });

  it("cripple layout is always eligible", () => {
    const result = consultAssumptionRegistry({
      quantityKey: OPENING_QUANTITY_KEYS.cripplesAbove,
      propertyPath: "crippleStudLayout",
      context: { objectId: "O-001" },
    });

    assert.equal(result.outcome, "assumed");
    if (result.outcome === "assumed") {
      assert.equal(result.eligibilityState, "eligible");
    }
  });
});

describe("assumption ID format with rule IDs", () => {
  it("king stud assumption ID includes WALL-ASSUME-005", () => {
    const result = consultAssumptionRegistry({
      quantityKey: OPENING_QUANTITY_KEYS.kingStuds,
      propertyPath: "kingStudCount",
      context: { objectId: "O-TEST-123" },
    });

    assert.equal(result.outcome, "assumed");
    if (result.outcome === "assumed") {
      assert.match(result.assumption.id, /WALL-ASSUME-005/);
      assert.equal(result.assumption.id, "A-WALL-ASSUME-005-kingStudCount-object-O-TEST-123");
    }
  });

  it("sill size assumption ID includes WALL-ASSUME-006", () => {
    const result = consultAssumptionRegistry({
      quantityKey: OPENING_QUANTITY_KEYS.roughSill,
      propertyPath: "roughSillSize",
      context: {
        objectId: "O-TEST-456",
        derivationInputs: { wallStudSize: "2x6" },
      },
    });

    assert.equal(result.outcome, "assumed");
    if (result.outcome === "assumed") {
      assert.match(result.assumption.id, /WALL-ASSUME-006/);
      assert.equal(result.assumption.id, "A-WALL-ASSUME-006-roughSillSize-object-O-TEST-456");
    }
  });

  it("king stud assumption source cites WALL-ASSUME-005", () => {
    const result = consultAssumptionRegistry({
      quantityKey: OPENING_QUANTITY_KEYS.kingStuds,
      propertyPath: "kingStudCount",
      context: { objectId: "O-001" },
    });

    assert.equal(result.outcome, "assumed");
    if (result.outcome === "assumed") {
      assert.match(result.assumption.source.reference ?? "", /WALL-ASSUME-005/);
      assert.match(result.assumption.source.explanation, /WALL-ASSUME-005/);
    }
  });

  it("sill size assumption source cites WALL-ASSUME-006", () => {
    const result = consultAssumptionRegistry({
      quantityKey: OPENING_QUANTITY_KEYS.roughSill,
      propertyPath: "roughSillSize",
      context: {
        objectId: "O-001",
        derivationInputs: { wallStudSize: "2x4" },
      },
    });

    assert.equal(result.outcome, "assumed");
    if (result.outcome === "assumed") {
      assert.match(result.assumption.source.reference ?? "", /WALL-ASSUME-006/);
      assert.match(result.assumption.source.explanation, /WALL-ASSUME-006/);
    }
  });
});
