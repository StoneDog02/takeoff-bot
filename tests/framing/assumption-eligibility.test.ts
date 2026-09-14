import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  consultAssumptionRegistry,
  lookupAssumptionRegistryEntry,
  WALL_ASSUMPTION_RULE_IDS,
  type AssumptionRegistryContext,
} from "../../src/framing/assumptions/index.js";
import { calculateOpeningFraming } from "../../src/framing/calculate/calculateOpeningFraming.js";
import { createMaterialLineItemId } from "../../src/framing/calculate/ids.js";
import type {
  OpeningsPayload,
  WallFramingPayload,
} from "../../src/framing/schemas/framing-artifacts.schema.js";
import type { Opening } from "../../src/framing/schemas/opening.schema.js";
import {
  HONESTY_RULE_IDS,
  OPENING_QUANTITY_KEYS,
} from "../../src/framing/validators/rule-ids.js";

function resolvedTrace(
  propertyPath: string,
  method:
    | "explicit-project-value"
    | "approved-default"
    | "unresolved" = "explicit-project-value",
) {
  return {
    propertyPath,
    method,
    explanation: `${propertyPath} is resolved.`,
    assumptionIds: [],
  };
}

function buildWallFraming(
  overrides: Partial<WallFramingPayload["walls"][number]> = {},
): WallFramingPayload {
  return {
    walls: [
      {
        id: "W-001",
        objectType: "building-wall",
        resolutionTraces: [
          resolvedTrace("assembly.studSize"),
          resolvedTrace("assembly.heightFeet"),
          resolvedTrace("assembly.studSpacingInches"),
          resolvedTrace("assembly.plateCount"),
        ],
        name: "Exterior wall W-001",
        level: "Level 1",
        wallType: "exterior-wood-stud-wall",
        semanticTypeKey: null,
        bindingAuthorityGrade: null,
        location: "exterior",
        bearingStatus: "non-bearing",
        isShearOrBraced: false,
        fireRating: null,
        constructionPhase: "new",
        assembly: {
          material: "dimensional-lumber",
          studSize: "2x4",
          studSpacingInches: 16,
          heightFeet: 8,
          plateCount: 3,
          sheathing: null,
        },
        segmentIds: ["WS-001"],
        ...overrides,
      },
    ],
    segments: [
      {
        id: "WS-001",
        objectType: "wall-segment",
        resolutionTraces: [resolvedTrace("lengthFeet")],
        parentWallId: "W-001",
        lengthFeet: 20,
        openingIds: ["O-001"],
      },
    ],
  };
}

function buildOpening(overrides: Partial<Opening> = {}): Opening {
  return {
    id: "O-001",
    objectType: "opening",
    resolutionTraces: [
      resolvedTrace("quantity"),
      resolvedTrace("dimensions.nominalWidthFeet"),
      resolvedTrace("dimensions.nominalHeightFeet"),
    ],
    category: "window",
    identityRole: "occurrence",
    absorbedSubjectKeys: [],
    parentObjectId: "WS-001",
    parentWallId: "W-001",
    dimensions: {
      nominalWidthFeet: 3,
      nominalHeightFeet: 4,
      roughWidthFeet: 3.5,
      roughHeightFeet: 4.5,
    },
    quantity: 1,
    scheduleReference: null,
    detailReference: null,
    headerMemberId: "SM-HDR-001",
    fireRating: null,
    kingStudCount: null,
    jackStudCount: null,
    positionOffsetFeetFromSegmentStart: null,
    ...overrides,
  };
}

function buildOpenings(openings: Opening[] = [buildOpening()]): OpeningsPayload {
  return { openings };
}

function kingStudLine(
  result: ReturnType<typeof calculateOpeningFraming>,
  openingId = "O-001",
) {
  return result.materials.find(
    (item) =>
      item.id === createMaterialLineItemId(OPENING_QUANTITY_KEYS.kingStuds, openingId),
  );
}

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

describe("WALL-ASSUME-005 calculator path (S3-DEC-1)", () => {
  it("ordinary wall (unknown class) → king studs eligible via calculator", () => {
    const result = calculateOpeningFraming(
      buildOpenings(),
      buildWallFraming(),
    );

    assert.equal(kingStudLine(result)?.quantity, 2);
    assert.equal(result.assumptions.length, 3);
    assert.ok(
      result.assumptions.some((a) => a.id.includes("WALL-ASSUME-005")),
    );
    assert.equal(
      result.unresolved.filter(
        (u) => u.reasonCode === HONESTY_RULE_IDS.kingStudCountForbidden,
      ).length,
      0,
    );
  });

  it("ordinary wall with explicit kingStudCount → no WALL-ASSUME-005, no king forbidden Unresolved", () => {
    const result = calculateOpeningFraming(
      buildOpenings([
        buildOpening({
          kingStudCount: 3,
          resolutionTraces: [
            resolvedTrace("quantity"),
            resolvedTrace("kingStudCount"),
          ],
        }),
      ]),
      buildWallFraming(),
    );

    assert.equal(kingStudLine(result)?.quantity, 3);
    assert.ok(
      !result.assumptions.some((a) => a.id.includes("WALL-ASSUME-005")),
    );
    assert.equal(
      result.unresolved.filter(
        (u) => u.reasonCode === HONESTY_RULE_IDS.kingStudCountForbidden,
      ).length,
      0,
    );
  });

  it("HEAD wall object has no isIdentifiedSpecial field → isIdentifiedSpecial=false → eligible", () => {
    const result = calculateOpeningFraming(
      buildOpenings(),
      buildWallFraming(),
    );

    assert.equal(kingStudLine(result)?.quantity, 2);
    assert.equal(
      result.unresolved.filter(
        (u) => u.reasonCode === HONESTY_RULE_IDS.kingStudCountForbidden,
      ).length,
      0,
    );
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
