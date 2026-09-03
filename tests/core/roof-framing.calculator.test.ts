import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  calculateRoofFraming,
  countRegularlySpacedCommonRafters,
} from "../../src/scopes/framing/calculators/calculateRoofFraming.js";
import { createMaterialLineItemId } from "../../src/scopes/framing/calculators/ids.js";
import { isStickCommonRafterFramingType } from "../../src/scopes/framing/resolvers/roofFramingPropertyPaths.js";
import type { RoofFramingPayload } from "../../src/scopes/framing/schemas/framing-artifacts.schema.js";
import { framingMaterialLineItemSchema } from "../../src/scopes/framing/schemas/material.schema.js";
import type {
  RoofFramingSystem,
  RoofPlane,
} from "../../src/scopes/framing/schemas/roof-framing.schema.js";
import { ROOF_QUANTITY_KEYS } from "../../src/scopes/framing/validators/rule-ids.js";

function resolvedTrace(propertyPath: string) {
  return {
    propertyPath,
    method: "explicit-project-value" as const,
    explanation: `${propertyPath} is explicit on the plans.`,
    assumptionIds: [],
  };
}

function buildSystem(
  overrides: Partial<RoofFramingSystem> = {},
): RoofFramingSystem {
  return {
    id: "RFS-001",
    objectType: "roof-framing-system",
    resolutionTraces: [
      resolvedTrace("assembly.framingType"),
      resolvedTrace("assembly.memberSize"),
      resolvedTrace("assembly.memberSpacingInches"),
    ],
    name: "Main roof framing",
    level: "Roof",
    constructionPhase: "new",
    assembly: {
      framingType: "rafter",
      memberSize: "2x8",
      memberSpacingInches: 16,
    },
    planeIds: ["RFP-001"],
    ...overrides,
  };
}

function buildPlane(overrides: Partial<RoofPlane> = {}): RoofPlane {
  return {
    id: "RFP-001",
    objectType: "roof-plane",
    resolutionTraces: [
      resolvedTrace("spanDirection"),
      resolvedTrace("rafterLayoutLengthFeet"),
    ],
    parentSystemId: "RFS-001",
    layout: null,
    framingDirection: null,
    spanDirection: "north-south",
    rafterLayoutLengthFeet: 20,
    pitch: null,
    areaSquareFeet: null,
    boundingWallIds: [],
    openingIds: [],
    structuralMemberIds: [],
    ...overrides,
  };
}

function buildPayload(
  systems: RoofFramingSystem[] = [buildSystem()],
  planes: RoofPlane[] = [buildPlane()],
): RoofFramingPayload {
  return { systems, planes };
}

function commonRafterLine(
  materials: ReturnType<typeof calculateRoofFraming>,
  planeId: string,
) {
  return materials.find(
    (item) =>
      item.id ===
      createMaterialLineItemId(ROOF_QUANTITY_KEYS.commonRafters, planeId),
  );
}

describe("countRegularlySpacedCommonRafters", () => {
  it("matches Brain worked example: 20 ft @ 16 in → 16 rafters", () => {
    assert.equal(countRegularlySpacedCommonRafters(20, 16), 16);
  });

  it("uses ceil for non-even spacing division (19.5 @ 16 → 16)", () => {
    assert.equal(countRegularlySpacedCommonRafters(19.5, 16), 16);
  });
});

describe("isStickCommonRafterFramingType", () => {
  it("allows stick rafter classifications", () => {
    assert.equal(isStickCommonRafterFramingType("rafter"), true);
    assert.equal(isStickCommonRafterFramingType("common-rafter"), true);
    assert.equal(isStickCommonRafterFramingType("stick"), true);
    assert.equal(isStickCommonRafterFramingType("STICK FRAMED"), true);
  });

  it("rejects truss classifications", () => {
    assert.equal(isStickCommonRafterFramingType("roof-truss"), false);
    assert.equal(isStickCommonRafterFramingType("truss"), false);
  });
});

describe("calculateRoofFraming", () => {
  it("emits material line with unit each and 2x8 common rafters without pitch/SF", () => {
    const materials = calculateRoofFraming(buildPayload());
    assert.equal(materials.length, 1);

    const line = framingMaterialLineItemSchema.parse(
      commonRafterLine(materials, "RFP-001"),
    );
    assert.equal(line.quantity, 16);
    assert.equal(line.unit, "each");
    assert.match(line.description, /2x8 common rafters/i);
    assert.deepEqual(line.sourceObjectIds.sort(), ["RFP-001", "RFS-001"]);
  });

  it("skips planes missing layout length", () => {
    const materials = calculateRoofFraming(
      buildPayload([buildSystem()], [
        buildPlane({
          rafterLayoutLengthFeet: null,
          resolutionTraces: [resolvedTrace("spanDirection")],
        }),
      ]),
    );
    assert.equal(materials.length, 0);
    assert.equal(commonRafterLine(materials, "RFP-001"), undefined);
  });

  it("does not emit for truss framingType even with layout length", () => {
    const materials = calculateRoofFraming(
      buildPayload(
        [
          buildSystem({
            assembly: {
              framingType: "roof-truss",
              memberSize: "18",
              memberSpacingInches: 24,
            },
          }),
        ],
        [buildPlane()],
      ),
    );
    assert.equal(materials.length, 0);
  });

  it("does not change count when openingIds are present", () => {
    const materials = calculateRoofFraming(
      buildPayload([buildSystem()], [
        buildPlane({ openingIds: ["O-021"] }),
      ]),
    );
    assert.equal(commonRafterLine(materials, "RFP-001")?.quantity, 16);
  });

  it("calculates independently for multiple planes", () => {
    const materials = calculateRoofFraming(
      buildPayload(
        [
          buildSystem(),
          buildSystem({
            id: "RFS-002",
            planeIds: ["RFP-002"],
            assembly: {
              framingType: "rafter",
              memberSize: "2x8",
              memberSpacingInches: 16,
            },
          }),
        ],
        [
          buildPlane(),
          buildPlane({
            id: "RFP-002",
            parentSystemId: "RFS-002",
            rafterLayoutLengthFeet: 12,
            spanDirection: "east-west",
          }),
        ],
      ),
    );

    assert.equal(commonRafterLine(materials, "RFP-001")?.quantity, 16);
    assert.equal(commonRafterLine(materials, "RFP-002")?.quantity, 10);
  });
});
