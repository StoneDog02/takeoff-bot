import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { calculateOpeningFraming } from "../../src/scopes/framing/calculators/calculateOpeningFraming.js";
import { coordinateFramingCalculations } from "../../src/scopes/framing/calculators/calculation-coordinator.js";
import { createMaterialLineItemId } from "../../src/scopes/framing/calculators/ids.js";
import { createOpeningKingStudCountAssumptionId } from "../../src/scopes/framing/calculators/createOpeningKingStudCountAssumption.js";
import { createOpeningRoughSillSizeAssumptionId } from "../../src/scopes/framing/calculators/createOpeningRoughSillSizeAssumption.js";
import type {
  OpeningsPayload,
  ValidationPayload,
  WallFramingPayload,
} from "../../src/scopes/framing/schemas/framing-artifacts.schema.js";
import type { Opening } from "../../src/scopes/framing/schemas/opening.schema.js";
import { createValidationIssue } from "../../src/scopes/framing/validators/createValidationIssue.js";
import { createObjectTarget } from "../../src/scopes/framing/validators/ids.js";
import {
  OPENING_QUANTITY_KEYS,
  OPENINGS_RULE_IDS,
  STRUCTURAL_MEMBER_QUANTITY_KEYS,
  WALL_QUANTITY_KEYS,
} from "../../src/scopes/framing/validators/rule-ids.js";
import { validateOpenings } from "../../src/scopes/framing/validators/openings.validator.js";

const complete = {
  status: "complete",
  percentage: 100,
  completedItems: 1,
  totalItems: 1,
} as const;

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
    evidenceIds: ["E-001"],
    assumptionIds: [],
    validationIssueIds: [],
    reviewItemIds: [],
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
        completion: complete,
        reviewStatus: "no-review-required",
        blockingStatus: "not-blocked",
        evidenceIds: ["E-WALL"],
        assumptionIds: [],
        validationIssueIds: [],
        reviewItemIds: [],
        resolutionTraces: [
          resolvedTrace("assembly.studSize"),
          resolvedTrace("assembly.heightFeet"),
          resolvedTrace("assembly.studSpacingInches"),
          resolvedTrace("assembly.plateCount"),
        ],
        name: "Exterior wall W-001",
        level: "Level 1",
        wallType: "exterior-wood-stud-wall",
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
        completion: complete,
        reviewStatus: "no-review-required",
        blockingStatus: "not-blocked",
        evidenceIds: ["E-SEG"],
        assumptionIds: [],
        validationIssueIds: [],
        reviewItemIds: [],
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
    completion: complete,
    reviewStatus: "no-review-required",
    blockingStatus: "not-blocked",
    evidenceIds: ["E-O001"],
    assumptionIds: [],
    validationIssueIds: [],
    reviewItemIds: [],
    resolutionTraces: [
      resolvedTrace("quantity"),
      resolvedTrace("dimensions.nominalWidthFeet"),
      resolvedTrace("dimensions.nominalHeightFeet"),
    ],
    category: "window",
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
    ...overrides,
  };
}

function buildOpenings(openings: Opening[] = [buildOpening()]): OpeningsPayload {
  return { openings };
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

function kingStudLine(
  result: ReturnType<typeof calculateOpeningFraming>,
  openingId = "O-001",
) {
  return result.materials.find(
    (item) =>
      item.id === createMaterialLineItemId(OPENING_QUANTITY_KEYS.kingStuds, openingId),
  );
}

function roughSillLine(
  result: ReturnType<typeof calculateOpeningFraming>,
  openingId = "O-001",
) {
  return result.materials.find(
    (item) =>
      item.id === createMaterialLineItemId(OPENING_QUANTITY_KEYS.roughSill, openingId),
  );
}

describe("calculateOpeningFraming king stud slice", () => {
  it("calculates king studs for an eligible window opening", () => {
    const result = calculateOpeningFraming(
      buildOpenings(),
      buildWallFraming(),
    );
    const kings = kingStudLine(result);

    assert.equal(kings?.quantity, 2);
    assert.equal(kings?.unit, "each");
    assert.deepEqual(kings?.sourceObjectIds, ["O-001", "W-001", "WS-001"]);
    assert.equal(result.assumptions.length, 2);
    assert.equal(
      result.assumptions[0]?.id,
      createOpeningKingStudCountAssumptionId("O-001"),
    );
    assert.ok(kings?.assumptionIds.includes(result.assumptions[0]!.id));
    assert.equal(roughSillLine(result)?.quantity, 3.5);
    assert.equal(roughSillLine(result)?.unit, "linear-foot");
  });

  it("calculates king studs for an eligible door opening", () => {
    const result = calculateOpeningFraming(
      buildOpenings([buildOpening({ category: "door" })]),
      buildWallFraming(),
    );

    assert.equal(kingStudLine(result)?.quantity, 2);
    assert.equal(roughSillLine(result), undefined);
  });

  it("calculates king studs for an eligible cased opening without rough sill", () => {
    const result = calculateOpeningFraming(
      buildOpenings([buildOpening({ category: "cased" })]),
      buildWallFraming(),
    );

    assert.equal(kingStudLine(result)?.quantity, 2);
    assert.equal(roughSillLine(result), undefined);
  });

  it("doubles king studs when opening.quantity is 2", () => {
    const result = calculateOpeningFraming(
      buildOpenings([buildOpening({ quantity: 2 })]),
      buildWallFraming(),
    );

    assert.equal(kingStudLine(result)?.quantity, 4);
    assert.equal(roughSillLine(result)?.quantity, 7);
  });

  it("does not emit king studs when opening.quantity is null", () => {
    const result = calculateOpeningFraming(
      buildOpenings([buildOpening({ quantity: null, resolutionTraces: [] })]),
      buildWallFraming(),
    );

    assert.equal(result.materials.length, 0);
    assert.equal(result.assumptions.length, 0);
  });

  it("does not emit king studs when quantity is conflicted/unresolved", () => {
    const result = calculateOpeningFraming(
      buildOpenings([
        buildOpening({
          quantity: null,
          resolutionTraces: [resolvedTrace("quantity", "unresolved")],
        }),
      ]),
      buildWallFraming(),
      emptyValidation([
        createValidationIssue({
          ruleId: OPENINGS_RULE_IDS.quantityResolved,
          level: "object",
          severity: "critical",
          ruleViolated: "Opening quantity must be resolved.",
          explanation: "Quantity unresolved.",
          target: createObjectTarget("O-001", "opening"),
          recommendedUserAction: "Resolve quantity.",
          evidenceIds: [],
          quantityImpacts: [
            {
              quantityKey: OPENING_QUANTITY_KEYS.kingStuds,
              description: "Blocked.",
              canCalculate: false,
            },
          ],
        }),
      ]),
    );

    assert.equal(result.materials.length, 0);
  });

  it("does not calculate when parent relationship is missing", () => {
    const result = calculateOpeningFraming(
      buildOpenings([buildOpening({ parentObjectId: null })]),
      buildWallFraming(),
    );

    assert.equal(result.materials.length, 0);
  });

  it("does not calculate for non-wood walls", () => {
    const result = calculateOpeningFraming(
      buildOpenings(),
      buildWallFraming({
        wallType: "light-gauge-metal-stud-wall",
        assembly: {
          material: "light-gauge-metal",
          studSize: "6-in",
          studSpacingInches: 16,
          heightFeet: 8,
          plateCount: 2,
          sheathing: null,
        },
      }),
    );

    assert.equal(result.materials.length, 0);
  });

  it("does not calculate for garage door openings", () => {
    const result = calculateOpeningFraming(
      buildOpenings([buildOpening({ category: "garage-door" })]),
      buildWallFraming(),
    );

    assert.equal(result.materials.length, 0);
  });

  it("uses explicit kingStudCount without creating the default assumption", () => {
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
    const kings = kingStudLine(result);

    assert.equal(kings?.quantity, 3);
    assert.equal(result.assumptions.length, 1);
    assert.equal(
      result.assumptions[0]?.id,
      createOpeningRoughSillSizeAssumptionId("O-001"),
    );
    assert.equal(kings?.assumptionIds.length, 0);
    assert.equal(roughSillLine(result)?.quantity, 3.5);
  });

  it("does not apply default and explicit king counts simultaneously", () => {
    const result = calculateOpeningFraming(
      buildOpenings([
        buildOpening({
          kingStudCount: 4,
          resolutionTraces: [
            resolvedTrace("quantity"),
            resolvedTrace("kingStudCount"),
          ],
        }),
      ]),
      buildWallFraming(),
    );

    assert.equal(kingStudLine(result)?.quantity, 4);
    assert.equal(result.assumptions.length, 1);
    assert.equal(roughSillLine(result)?.quantity, 3.5);
  });

  it("keeps calculations object-scoped for multiple openings", () => {
    const result = calculateOpeningFraming(
      buildOpenings([
        buildOpening({ id: "O-001", quantity: 1 }),
        buildOpening({
          id: "O-002",
          quantity: 2,
          parentObjectId: "WS-001",
          resolutionTraces: [resolvedTrace("quantity")],
        }),
      ]),
      buildWallFraming(),
    );

    assert.equal(kingStudLine(result, "O-001")?.quantity, 2);
    assert.equal(kingStudLine(result, "O-002")?.quantity, 4);
    assert.equal(roughSillLine(result, "O-001")?.quantity, 3.5);
    assert.equal(roughSillLine(result, "O-002")?.quantity, 7);
    assert.equal(result.materials.length, 4);
  });

  it("is deterministic regardless of input order", () => {
    const wallFraming = buildWallFraming();
    const openings = buildOpenings([
      buildOpening({ id: "O-002", quantity: 2 }),
      buildOpening({ id: "O-001", quantity: 1 }),
    ]);

    const first = calculateOpeningFraming(openings, wallFraming);
    const second = calculateOpeningFraming(
      { openings: [...openings.openings].reverse() },
      wallFraming,
    );

    assert.deepEqual(first.materials, second.materials);
    assert.deepEqual(first.assumptions, second.assumptions);
  });

  it("does not emit jack studs, cripples, or header material", () => {
    const result = calculateOpeningFraming(
      buildOpenings(),
      buildWallFraming(),
    );

    assert.equal(result.materials.length, 2);
    assert.ok(result.materials.some((item) => /king studs/i.test(item.description)));
    assert.ok(result.materials.some((item) => /rough sill/i.test(item.description)));
    assert.ok(result.materials.every((item) => !/jack stud/i.test(item.description)));
    assert.ok(result.materials.every((item) => !/cripple/i.test(item.description)));
    assert.ok(result.materials.every((item) => !/header/i.test(item.description)));
  });
});

describe("calculateOpeningFraming rough sill slice", () => {
  it("calculates rough sill LF for a window with resolved rough width and quantity", () => {
    const result = calculateOpeningFraming(buildOpenings(), buildWallFraming());
    const sill = roughSillLine(result);

    assert.equal(sill?.quantity, 3.5);
    assert.equal(sill?.unit, "linear-foot");
    assert.match(sill?.description ?? "", /2x4 rough sill/i);
    assert.deepEqual(sill?.sourceObjectIds, ["O-001", "W-001", "WS-001"]);
    assert.ok(
      sill?.assumptionIds.includes(createOpeningRoughSillSizeAssumptionId("O-001")),
    );
  });

  it("doubles rough sill LF when opening.quantity is 2", () => {
    const result = calculateOpeningFraming(
      buildOpenings([buildOpening({ quantity: 2 })]),
      buildWallFraming(),
    );

    assert.equal(roughSillLine(result)?.quantity, 7);
  });

  it("does not emit rough sill when roughWidthFeet is null", () => {
    const result = calculateOpeningFraming(
      buildOpenings([
        buildOpening({
          dimensions: {
            nominalWidthFeet: 3,
            nominalHeightFeet: 4,
            roughWidthFeet: null,
            roughHeightFeet: 4.5,
          },
        }),
      ]),
      buildWallFraming(),
    );

    assert.equal(roughSillLine(result), undefined);
    assert.equal(kingStudLine(result)?.quantity, 2);
  });

  it("does not emit rough sill when roughWidthFeet is conflicted", () => {
    const result = calculateOpeningFraming(
      buildOpenings([
        buildOpening({
          dimensions: {
            nominalWidthFeet: 3,
            nominalHeightFeet: 4,
            roughWidthFeet: null,
            roughHeightFeet: 4.5,
          },
          resolutionTraces: [
            resolvedTrace("quantity"),
            resolvedTrace("dimensions.nominalWidthFeet"),
            resolvedTrace("dimensions.nominalHeightFeet"),
            resolvedTrace("dimensions.roughWidthFeet", "unresolved"),
          ],
        }),
      ]),
      buildWallFraming(),
    );

    assert.equal(roughSillLine(result), undefined);
    assert.equal(kingStudLine(result)?.quantity, 2);
  });

  it("does not emit rough sill when quantity is null", () => {
    const result = calculateOpeningFraming(
      buildOpenings([buildOpening({ quantity: null, resolutionTraces: [] })]),
      buildWallFraming(),
    );

    assert.equal(roughSillLine(result), undefined);
    assert.equal(kingStudLine(result), undefined);
  });

  it("does not emit rough sill when quantity is conflicted", () => {
    const result = calculateOpeningFraming(
      buildOpenings([
        buildOpening({
          quantity: null,
          resolutionTraces: [resolvedTrace("quantity", "unresolved")],
        }),
      ]),
      buildWallFraming(),
      emptyValidation([
        createValidationIssue({
          ruleId: OPENINGS_RULE_IDS.quantityResolved,
          level: "object",
          severity: "critical",
          ruleViolated: "Opening quantity must be resolved.",
          explanation: "Quantity unresolved.",
          target: createObjectTarget("O-001", "opening"),
          recommendedUserAction: "Resolve quantity.",
          evidenceIds: [],
          quantityImpacts: [
            {
              quantityKey: OPENING_QUANTITY_KEYS.roughSill,
              description: "Blocked.",
              canCalculate: false,
            },
          ],
        }),
      ]),
    );

    assert.equal(roughSillLine(result), undefined);
    assert.equal(kingStudLine(result), undefined);
  });

  it("does not emit rough sill for door openings", () => {
    const result = calculateOpeningFraming(
      buildOpenings([buildOpening({ category: "door" })]),
      buildWallFraming(),
    );

    assert.equal(roughSillLine(result), undefined);
    assert.equal(kingStudLine(result)?.quantity, 2);
  });

  it("does not emit rough sill for cased openings", () => {
    const result = calculateOpeningFraming(
      buildOpenings([buildOpening({ category: "cased" })]),
      buildWallFraming(),
    );

    assert.equal(roughSillLine(result), undefined);
    assert.equal(kingStudLine(result)?.quantity, 2);
  });

  it("does not emit rough sill for garage-door openings", () => {
    const result = calculateOpeningFraming(
      buildOpenings([buildOpening({ category: "garage-door" })]),
      buildWallFraming(),
    );

    assert.equal(roughSillLine(result), undefined);
    assert.equal(kingStudLine(result), undefined);
  });

  it("does not emit rough sill when parent relationship is missing", () => {
    const result = calculateOpeningFraming(
      buildOpenings([buildOpening({ parentObjectId: null })]),
      buildWallFraming(),
    );

    assert.equal(roughSillLine(result), undefined);
    assert.equal(kingStudLine(result), undefined);
  });

  it("does not emit rough sill for non-wood walls", () => {
    const result = calculateOpeningFraming(
      buildOpenings(),
      buildWallFraming({
        wallType: "light-gauge-metal-stud-wall",
        assembly: {
          material: "light-gauge-metal",
          studSize: "6-in",
          studSpacingInches: 16,
          heightFeet: 8,
          plateCount: 2,
          sheathing: null,
        },
      }),
    );

    assert.equal(roughSillLine(result), undefined);
    assert.equal(kingStudLine(result), undefined);
  });

  it("does not change rough sill LF when kingStudCount changes", () => {
    const defaultKings = calculateOpeningFraming(buildOpenings(), buildWallFraming());
    const explicitKings = calculateOpeningFraming(
      buildOpenings([
        buildOpening({
          kingStudCount: 5,
          resolutionTraces: [
            resolvedTrace("quantity"),
            resolvedTrace("kingStudCount"),
          ],
        }),
      ]),
      buildWallFraming(),
    );

    assert.equal(defaultKings.materials.find((item) => item.unit === "linear-foot")?.quantity, 3.5);
    assert.equal(explicitKings.materials.find((item) => item.unit === "linear-foot")?.quantity, 3.5);
    assert.equal(kingStudLine(explicitKings)?.quantity, 5);
  });

  it("blocks only the affected opening rough sill in a multi-opening segment", () => {
    const result = calculateOpeningFraming(
      buildOpenings([
        buildOpening({
          id: "O-001",
          dimensions: {
            nominalWidthFeet: 3,
            nominalHeightFeet: 4,
            roughWidthFeet: null,
            roughHeightFeet: 4.5,
          },
        }),
        buildOpening({
          id: "O-002",
          quantity: 1,
          dimensions: {
            nominalWidthFeet: 4,
            nominalHeightFeet: 5,
            roughWidthFeet: 4,
            roughHeightFeet: 5.5,
          },
          resolutionTraces: [
            resolvedTrace("quantity"),
            resolvedTrace("dimensions.nominalWidthFeet"),
            resolvedTrace("dimensions.nominalHeightFeet"),
            resolvedTrace("dimensions.roughWidthFeet"),
            resolvedTrace("dimensions.roughHeightFeet"),
          ],
        }),
      ]),
      buildWallFraming(),
    );

    assert.equal(roughSillLine(result, "O-001"), undefined);
    assert.equal(roughSillLine(result, "O-002")?.quantity, 4);
    assert.equal(kingStudLine(result, "O-001")?.quantity, 2);
    assert.equal(kingStudLine(result, "O-002")?.quantity, 2);
    assert.notEqual(
      roughSillLine(result, "O-002")?.sourceObjectIds.join(","),
      kingStudLine(result, "O-001")?.sourceObjectIds.join(","),
    );
  });

  it("orders materials deterministically by opening id then quantity key", () => {
    const result = calculateOpeningFraming(
      buildOpenings([
        buildOpening({ id: "O-002", quantity: 1 }),
        buildOpening({ id: "O-001", quantity: 1 }),
      ]),
      buildWallFraming(),
    );

    assert.deepEqual(
      result.materials.map((item) => item.id),
      [
        createMaterialLineItemId(OPENING_QUANTITY_KEYS.kingStuds, "O-001"),
        createMaterialLineItemId(OPENING_QUANTITY_KEYS.roughSill, "O-001"),
        createMaterialLineItemId(OPENING_QUANTITY_KEYS.kingStuds, "O-002"),
        createMaterialLineItemId(OPENING_QUANTITY_KEYS.roughSill, "O-002"),
      ],
    );
  });
});

describe("coordinateFramingCalculations opening quantities", () => {
  it("preserves baseline wall studs and header while adding opening materials", () => {
    const wallFraming = buildWallFraming();
    const openings = buildOpenings();
    const payload = coordinateFramingCalculations({
      wallFraming,
      openings,
      structuralMembers: {
        structuralMembers: [
          {
            id: "SM-HDR-001",
            objectType: "structural-member",
            completion: complete,
            reviewStatus: "no-review-required",
            blockingStatus: "not-blocked",
            evidenceIds: ["E-HDR"],
            assumptionIds: [],
            validationIssueIds: [],
            reviewItemIds: [],
            resolutionTraces: [
              resolvedTrace("category"),
              resolvedTrace("materialType"),
              resolvedTrace("size"),
              resolvedTrace("lengthFeet"),
              resolvedTrace("quantity"),
            ],
            category: "header",
            materialType: "dimensional-lumber",
            size: "2x10",
            plyCount: null,
            lengthFeet: 6,
            quantity: 1,
            location: null,
            associatedObjectIds: [],
            supportedObjectIds: ["O-001"],
            supportingObjectIds: [],
            connectorIds: [],
          },
        ],
      },
    });

    const studs = payload.materials.find(
      (item) =>
        item.id === createMaterialLineItemId(WALL_QUANTITY_KEYS.studs, "WS-001"),
    );
    const plates = payload.materials.find(
      (item) =>
        item.id === createMaterialLineItemId(WALL_QUANTITY_KEYS.plates, "WS-001"),
    );
    const header = payload.materials.find(
      (item) =>
        item.id ===
        createMaterialLineItemId(
          STRUCTURAL_MEMBER_QUANTITY_KEYS.material,
          "SM-HDR-001",
        ),
    );
    const kings = payload.materials.find(
      (item) =>
        item.id ===
        createMaterialLineItemId(OPENING_QUANTITY_KEYS.kingStuds, "O-001"),
    );
    const sill = payload.materials.find(
      (item) =>
        item.id ===
        createMaterialLineItemId(OPENING_QUANTITY_KEYS.roughSill, "O-001"),
    );

    assert.equal(studs?.quantity, 16);
    assert.equal(plates?.quantity, 60);
    assert.equal(header?.quantity, 6);
    assert.equal(kings?.quantity, 2);
    assert.equal(sill?.quantity, 3.5);
    assert.equal(payload.assumptions.length, 2);
  });
});

describe("validateOpenings quantity and king default", () => {
  it("blocks opening-framing quantities when quantity is unresolved", () => {
    const batch = validateOpenings({
      payload: {
        openings: [
          buildOpening({
            quantity: null,
            resolutionTraces: [],
          }),
        ],
      },
      parentObjectsById: new Map([
        ["WS-001", { objectId: "WS-001", objectType: "wall-segment" }],
        ["W-001", { objectId: "W-001", objectType: "building-wall" }],
      ]),
    });

    const issue = batch.validationIssues.find(
      (entry) => entry.ruleId === OPENINGS_RULE_IDS.quantityResolved,
    );
    assert.ok(issue);
    assert.ok(
      issue?.quantityImpacts.some(
        (impact) =>
          impact.quantityKey === OPENING_QUANTITY_KEYS.roughSill &&
          impact.canCalculate === false,
      ),
    );
  });

  it("blocks rough sill but not king studs when rough width is unresolved", () => {
    const batch = validateOpenings({
      payload: {
        openings: [
          buildOpening({
            dimensions: {
              nominalWidthFeet: 3,
              nominalHeightFeet: 4,
              roughWidthFeet: null,
              roughHeightFeet: null,
            },
            resolutionTraces: [
              resolvedTrace("quantity"),
              resolvedTrace("dimensions.nominalWidthFeet"),
              resolvedTrace("dimensions.nominalHeightFeet"),
            ],
          }),
        ],
      },
      parentObjectsById: new Map([
        ["WS-001", { objectId: "WS-001", objectType: "wall-segment" }],
        ["W-001", { objectId: "W-001", objectType: "building-wall" }],
      ]),
    });

    const issue = batch.validationIssues.find(
      (entry) => entry.ruleId === OPENINGS_RULE_IDS.roughDimensionsResolved,
    );
    assert.ok(issue);
    assert.equal(
      issue?.quantityImpacts.find(
        (impact) => impact.quantityKey === OPENING_QUANTITY_KEYS.framing,
      )?.canCalculate,
      true,
    );
    assert.equal(
      issue?.quantityImpacts.find(
        (impact) => impact.quantityKey === OPENING_QUANTITY_KEYS.roughSill,
      )?.canCalculate,
      false,
    );
  });

  it("creates review for industry-default rough sill size when explicit size is absent", () => {
    const batch = validateOpenings({
      payload: { openings: [buildOpening()] },
      parentObjectsById: new Map([
        ["WS-001", { objectId: "WS-001", objectType: "wall-segment" }],
        ["W-001", { objectId: "W-001", objectType: "building-wall" }],
      ]),
    });

    const reviewItem = batch.reviewItems.find(
      (entry) => entry.title.includes("Confirm rough sill size"),
    );
    assert.ok(reviewItem);
    assert.equal(reviewItem?.blockingStatus, "not-blocked");
  });

  it("creates review for industry-default king count when explicit count is absent", () => {
    const batch = validateOpenings({
      payload: { openings: [buildOpening()] },
      parentObjectsById: new Map([
        ["WS-001", { objectId: "WS-001", objectType: "wall-segment" }],
        ["W-001", { objectId: "W-001", objectType: "building-wall" }],
      ]),
    });

    const reviewItem = batch.reviewItems.find(
      (entry) => entry.title.includes("Confirm king stud count"),
    );
    assert.ok(reviewItem);
    assert.equal(reviewItem?.blockingStatus, "not-blocked");
  });
});
