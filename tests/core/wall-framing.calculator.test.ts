import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { calculateWallFraming } from "../../src/scopes/framing/calculators/calculateWallFraming.js";
import type {
  ValidationPayload,
  WallFramingPayload,
} from "../../src/scopes/framing/schemas/framing-artifacts.schema.js";
import { framingMaterialLineItemSchema } from "../../src/scopes/framing/schemas/material.schema.js";
import { createValidationIssue } from "../../src/scopes/framing/validators/createValidationIssue.js";
import { createObjectTarget } from "../../src/scopes/framing/validators/ids.js";
import { WALL_QUANTITY_KEYS } from "../../src/scopes/framing/validators/rule-ids.js";

const complete = {
  status: "complete",
  percentage: 100,
  completedItems: 1,
  totalItems: 1,
} as const;

function buildCompletePayload(
  overrides: Partial<WallFramingPayload> = {},
): WallFramingPayload {
  return {
    walls: [
      {
        id: "W-001",
        objectType: "building-wall",
        completion: complete,
        reviewStatus: "no-review-required",
        blockingStatus: "not-blocked",
        evidenceIds: ["E-001"],
        assumptionIds: ["A-WALL"],
        validationIssueIds: [],
        reviewItemIds: ["RI-WALL"],
        resolutionTraces: [
          {
            propertyPath: "assembly.heightFeet",
            method: "explicit-project-value",
            explanation: "Height is explicit on the plan.",
            evidenceIds: ["E-001"],
            assumptionIds: [],
            validationIssueIds: [],
            reviewItemIds: [],
          },
          {
            propertyPath: "assembly.studSpacingInches",
            method: "explicit-project-value",
            explanation: "Spacing is explicit on the plan.",
            evidenceIds: ["E-001"],
            assumptionIds: ["A-SPACING"],
            validationIssueIds: [],
            reviewItemIds: ["RI-SPACING"],
          },
          {
            propertyPath: "assembly.studSize",
            method: "explicit-project-value",
            explanation: "Stud size is explicit on the plan.",
            evidenceIds: ["E-001"],
            assumptionIds: [],
            validationIssueIds: [],
            reviewItemIds: [],
          },
          {
            propertyPath: "assembly.plateCount",
            method: "explicit-project-value",
            explanation: "Plate count is explicit on the plan.",
            evidenceIds: ["E-001"],
            assumptionIds: ["A-PLATES"],
            validationIssueIds: [],
            reviewItemIds: [],
          },
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
      },
    ],
    segments: [
      {
        id: "WS-001",
        objectType: "wall-segment",
        completion: complete,
        reviewStatus: "no-review-required",
        blockingStatus: "not-blocked",
        evidenceIds: ["E-002"],
        assumptionIds: ["A-SEG"],
        validationIssueIds: [],
        reviewItemIds: ["RI-SEG"],
        resolutionTraces: [
          {
            propertyPath: "lengthFeet",
            method: "explicit-project-value",
            explanation: "Length is explicit on the plan.",
            evidenceIds: ["E-002"],
            assumptionIds: ["A-LENGTH"],
            validationIssueIds: [],
            reviewItemIds: ["RI-LENGTH"],
          },
        ],
        parentWallId: "W-001",
        lengthFeet: 20,
        openingIds: [],
      },
    ],
    ...overrides,
  };
}

function withWallAssembly(
  payload: WallFramingPayload,
  assembly: Partial<WallFramingPayload["walls"][number]["assembly"]>,
  traces?: WallFramingPayload["walls"][number]["resolutionTraces"],
): WallFramingPayload {
  const wall = payload.walls[0]!;
  return {
    ...payload,
    walls: [
      {
        ...wall,
        assembly: {
          ...wall.assembly,
          ...assembly,
        },
        resolutionTraces: traces ?? wall.resolutionTraces,
      },
    ],
  };
}

function withSegment(
  payload: WallFramingPayload,
  segment: Partial<WallFramingPayload["segments"][number]>,
): WallFramingPayload {
  const existing = payload.segments[0]!;
  return {
    ...payload,
    segments: [
      {
        ...existing,
        ...segment,
      },
    ],
  };
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

function lineItemByUnit(
  materials: ReturnType<typeof calculateWallFraming>,
  unit: "each" | "linear-foot",
) {
  return materials.find((item) => item.unit === unit);
}

describe("calculateWallFraming", () => {
  it("calculates regularly spaced stud count for a resolved wall/segment", () => {
    const materials = calculateWallFraming(buildCompletePayload());
    const studs = lineItemByUnit(materials, "each");

    assert.equal(studs?.quantity, 16);
    assert.equal(studs?.unit, "each");
    assert.match(studs?.description ?? "", /regularly spaced studs/);
    assert.equal(studs?.canonicalClassification, "stud-2x4-regular-spacing");
  });

  it("rounds stud count upward to whole pieces", () => {
    const materials = calculateWallFraming(
      withSegment(buildCompletePayload(), { lengthFeet: 10 }),
    );
    const studs = lineItemByUnit(materials, "each");

    assert.equal(studs?.quantity, 9);
    assert.equal(Number.isInteger(studs?.quantity), true);
  });

  it("counts both endpoints when spacing equals segment length", () => {
    const payload = withWallAssembly(
      withSegment(buildCompletePayload(), { lengthFeet: 1 }),
      { studSpacingInches: 12 },
    );
    const studs = lineItemByUnit(calculateWallFraming(payload), "each");

    assert.equal(studs?.quantity, 2);
  });

  it("counts both endpoints when spacing exceeds positive segment length", () => {
    const payload = withWallAssembly(
      withSegment(buildCompletePayload(), { lengthFeet: 1 }),
      { studSpacingInches: 16 },
    );
    const studs = lineItemByUnit(calculateWallFraming(payload), "each");

    assert.equal(studs?.quantity, 2);
  });

  it("calculates unrounded plate linear footage", () => {
    const materials = calculateWallFraming(
      withSegment(buildCompletePayload(), { lengthFeet: 10.5 }),
    );
    const plates = lineItemByUnit(materials, "linear-foot");

    assert.equal(plates?.quantity, 31.5);
    assert.equal(plates?.unit, "linear-foot");
    assert.equal(plates?.canonicalClassification, "plate-2x4");
  });

  it("calculates plate LF for a single plate equal to segment length", () => {
    const materials = calculateWallFraming(
      withWallAssembly(buildCompletePayload(), { plateCount: 1 }),
    );

    assert.equal(lineItemByUnit(materials, "linear-foot")?.quantity, 20);
  });

  it("calculates plate LF for multiple plates", () => {
    const materials = calculateWallFraming(buildCompletePayload());

    assert.equal(lineItemByUnit(materials, "linear-foot")?.quantity, 60);
  });

  it("does not deduct openings from baseline plate LF", () => {
    const withoutOpenings = calculateWallFraming(buildCompletePayload());
    const withOpenings = calculateWallFraming(
      withSegment(buildCompletePayload(), { openingIds: ["O-014", "O-015"] }),
    );

    assert.equal(
      lineItemByUnit(withoutOpenings, "linear-foot")?.quantity,
      lineItemByUnit(withOpenings, "linear-foot")?.quantity,
    );
    assert.equal(lineItemByUnit(withOpenings, "linear-foot")?.quantity, 60);
  });

  it("skips studs and plates when length is null", () => {
    const materials = calculateWallFraming(
      withSegment(buildCompletePayload(), { lengthFeet: null }),
    );

    assert.equal(materials.length, 0);
  });

  it("skips studs and plates when length is explicitly unresolved", () => {
    const payload = withSegment(buildCompletePayload(), {
      lengthFeet: 20,
      resolutionTraces: [
        {
          propertyPath: "lengthFeet",
          method: "unresolved",
          explanation: "Length was not resolved.",
          evidenceIds: [],
          assumptionIds: [],
          validationIssueIds: [],
          reviewItemIds: [],
        },
      ],
    });

    assert.equal(calculateWallFraming(payload).length, 0);
  });

  it("skips studs when spacing is unresolved without blocking plates", () => {
    const payload = withWallAssembly(
      buildCompletePayload(),
      { studSpacingInches: null },
      buildCompletePayload().walls[0]!.resolutionTraces.map((trace) =>
        trace.propertyPath === "assembly.studSpacingInches"
          ? {
              ...trace,
              method: "unresolved" as const,
              explanation: "Stud spacing was not resolved.",
              assumptionIds: [],
              reviewItemIds: [],
            }
          : trace,
      ),
    );
    const materials = calculateWallFraming(payload);

    assert.equal(lineItemByUnit(materials, "each"), undefined);
    assert.equal(lineItemByUnit(materials, "linear-foot")?.quantity, 60);
  });

  it("skips plates when plate count is unresolved without blocking studs", () => {
    const payload = withWallAssembly(
      buildCompletePayload(),
      { plateCount: null },
      buildCompletePayload().walls[0]!.resolutionTraces.map((trace) =>
        trace.propertyPath === "assembly.plateCount"
          ? {
              ...trace,
              method: "unresolved" as const,
              explanation: "Plate count was not resolved.",
              assumptionIds: [],
              reviewItemIds: [],
            }
          : trace,
      ),
    );
    const materials = calculateWallFraming(payload);

    assert.equal(lineItemByUnit(materials, "each")?.quantity, 16);
    assert.equal(lineItemByUnit(materials, "linear-foot"), undefined);
  });

  it("does not require wall height for count-based studs or plate linear footage", () => {
    const payload = withWallAssembly(
      buildCompletePayload(),
      { heightFeet: null },
      buildCompletePayload().walls[0]!.resolutionTraces.map((trace) =>
        trace.propertyPath === "assembly.heightFeet"
          ? {
              ...trace,
              method: "unresolved" as const,
              explanation: "Height was not resolved.",
            }
          : trace,
      ),
    );
    const materials = calculateWallFraming(payload);

    assert.equal(lineItemByUnit(materials, "each")?.quantity, 16);
    assert.equal(lineItemByUnit(materials, "linear-foot")?.quantity, 60);
    assert.doesNotMatch(
      lineItemByUnit(materials, "each")?.description ?? "",
      /8/,
    );
  });

  it("suppresses only the quantity Validation marks as non-calculable", () => {
    const payload = buildCompletePayload();
    const wall = payload.walls[0]!;
    const validation = emptyValidation([
      createValidationIssue({
        ruleId: "wall.geometry.length.resolved",
        level: "calculation",
        severity: "blocking",
        ruleViolated: "Stud quantity cannot be calculated.",
        explanation: "Validation blocked studs only.",
        target: createObjectTarget(wall.id, wall.objectType),
        quantityImpacts: [
          {
            quantityKey: WALL_QUANTITY_KEYS.studs,
            description: "Stud quantities cannot be calculated.",
            canCalculate: false,
          },
          {
            quantityKey: WALL_QUANTITY_KEYS.plates,
            description: "Plate linear feet may still be calculated.",
            canCalculate: true,
          },
        ],
      }),
      createValidationIssue({
        ruleId: "wall.location.resolved",
        level: "object",
        severity: "warning",
        ruleViolated: "Location is unrelated to these quantities.",
        explanation: "Unrelated classification review.",
        target: createObjectTarget(wall.id, wall.objectType),
        quantityImpacts: [
          {
            quantityKey: "wall.location",
            description: "Location classification is unrelated.",
            canCalculate: true,
          },
        ],
      }),
    ]);
    const materials = calculateWallFraming(payload, validation);

    assert.equal(lineItemByUnit(materials, "each"), undefined);
    assert.equal(lineItemByUnit(materials, "linear-foot")?.quantity, 60);
  });

  it("preserves source object, assumption, and review provenance", () => {
    const materials = calculateWallFraming(buildCompletePayload());
    const studs = lineItemByUnit(materials, "each");
    const plates = lineItemByUnit(materials, "linear-foot");

    assert.deepEqual(studs?.sourceObjectIds, ["W-001", "WS-001"]);
    assert.deepEqual(studs?.assumptionIds, [
      "A-LENGTH",
      "A-SEG",
      "A-SPACING",
      "A-WALL",
    ]);
    assert.deepEqual(studs?.reviewItemIds, [
      "RI-LENGTH",
      "RI-SEG",
      "RI-SPACING",
      "RI-WALL",
    ]);

    assert.deepEqual(plates?.sourceObjectIds, ["W-001", "WS-001"]);
    assert.ok(plates?.assumptionIds.includes("A-PLATES"));
    assert.ok(plates?.assumptionIds.includes("A-LENGTH"));
    assert.equal(plates?.assumptionIds.includes("A-SPACING"), false);
  });

  it("is deterministic across reruns", () => {
    const payload = buildCompletePayload();
    const first = calculateWallFraming(payload);
    const second = calculateWallFraming(payload);

    assert.deepEqual(first, second);
  });

  it("emits line items that parse through FramingMaterialLineItem", () => {
    const materials = calculateWallFraming(buildCompletePayload());

    assert.equal(materials.length, 2);
    for (const item of materials) {
      assert.deepEqual(framingMaterialLineItemSchema.parse(item), item);
    }
  });
});
