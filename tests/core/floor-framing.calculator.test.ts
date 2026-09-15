import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  calculateFloorFraming,
  countRegularlySpacedJoists,
  isSimpleAreaJoistLinearFeetTypeSupported,
} from "../../src/framing/calculate/calculateFloorFraming.js";
import { enumerateJoistLayoutPositionsInches } from "../../src/framing/calculate/netStudDeduction.js";
import type { FloorFramingPayload } from "../../src/framing/schemas/framing-artifacts.schema.js";
import { framingMaterialLineItemSchema } from "../../src/framing/schemas/material.schema.js";
import type {
  FloorFramingArea,
  FloorFramingSystem,
} from "../../src/framing/schemas/floor-framing.schema.js";
import { FLOOR_QUANTITY_KEYS } from "../../src/framing/validators/rule-ids.js";
import { createMaterialLineItemId } from "../../src/framing/calculate/ids.js";

function resolvedTrace(propertyPath: string) {
  return {
    propertyPath,
    method: "explicit-project-value" as const,
    explanation: `${propertyPath} is explicit on the plans.`,
    assumptionIds: [],
  };
}

function buildSystem(
  overrides: Partial<FloorFramingSystem> = {},
): FloorFramingSystem {
  return {
    id: "FFS-001",
    objectType: "floor-framing-system",
    resolutionTraces: [
      resolvedTrace("assembly.joistType"),
      resolvedTrace("assembly.joistSize"),
      resolvedTrace("assembly.joistSpacingInches"),
    ],
    name: "Level 2 floor framing",
    level: "Level 2",
    constructionPhase: "new",
    assembly: {
      joistType: "i-joist",
      joistSize: "11-7/8",
      joistSpacingInches: 16,
      rimBoard: null,
    },
    areaIds: ["FFA-001"],
    ...overrides,
  };
}

function buildArea(overrides: Partial<FloorFramingArea> = {}): FloorFramingArea {
  return {
    id: "FFA-001",
    objectType: "floor-framing-area",
    resolutionTraces: [
      resolvedTrace("spanDirection"),
      resolvedTrace("joistLayoutLengthFeet"),
      resolvedTrace("joistMemberLengthFeet"),
    ],
    parentSystemId: "FFS-001",
    layout: null,
    framingDirection: null,
    spanDirection: "north-south",
    joistLayoutLengthFeet: 20,
    joistMemberLengthFeet: 12,
    areaSquareFeet: null,
    boundingWallIds: [],
    openingIds: [],
    structuralMemberIds: [],
    ...overrides,
  };
}

function buildPayload(
  systems: FloorFramingSystem[] = [buildSystem()],
  areas: FloorFramingArea[] = [buildArea()],
): FloorFramingPayload {
  return { systems, areas };
}

function joistCountLine(
  materials: ReturnType<typeof calculateFloorFraming>,
  areaId: string,
) {
  return materials.find(
    (item) =>
      item.id === createMaterialLineItemId(FLOOR_QUANTITY_KEYS.joists, areaId),
  );
}

function joistLfLine(
  materials: ReturnType<typeof calculateFloorFraming>,
  areaId: string,
) {
  return materials.find(
    (item) =>
      item.id ===
      createMaterialLineItemId(FLOOR_QUANTITY_KEYS.joistLinearFeet, areaId),
  );
}

describe("countRegularlySpacedJoists", () => {
  it("matches Brain worked example: 20 ft @ 16 in → 16 joists", () => {
    assert.equal(countRegularlySpacedJoists(20, 16), 16);
  });

  it("uses ceil for non-even spacing division", () => {
    assert.equal(countRegularlySpacedJoists(20, 19), 14);
  });
});

describe("isSimpleAreaJoistLinearFeetTypeSupported", () => {
  it("allows dimensional lumber and I-joists", () => {
    assert.equal(isSimpleAreaJoistLinearFeetTypeSupported("i-joist"), true);
    assert.equal(isSimpleAreaJoistLinearFeetTypeSupported("I-JOISTS"), true);
    assert.equal(
      isSimpleAreaJoistLinearFeetTypeSupported("dimensional-lumber"),
      true,
    );
  });

  it("rejects floor trusses and metal systems", () => {
    assert.equal(isSimpleAreaJoistLinearFeetTypeSupported("floor-truss"), false);
    assert.equal(isSimpleAreaJoistLinearFeetTypeSupported("metal-joist"), false);
  });
});

describe("calculateFloorFraming", () => {
  it("emits count and LF for a complete area without areaSquareFeet (16 × 12 = 192)", () => {
    const materials = calculateFloorFraming(buildPayload());
    assert.equal(materials.length, 2);

    const count = framingMaterialLineItemSchema.parse(joistCountLine(materials, "FFA-001"));
    assert.equal(count.quantity, 16);
    assert.equal(count.unit, "each");
    assert.match(count.description, /11-7\/8 i-joist floor joists/i);
    assert.deepEqual(count.sourceObjectIds.sort(), ["FFA-001", "FFS-001"]);

    const lf = framingMaterialLineItemSchema.parse(joistLfLine(materials, "FFA-001"));
    assert.equal(lf.quantity, 192);
    assert.equal(lf.unit, "linear-foot");
    assert.match(lf.description, /11-7\/8 i-joist floor joists/i);
    assert.equal(lf.canonicalClassification, count.canonicalClassification);
    assert.deepEqual(lf.sourceObjectIds.sort(), ["FFA-001", "FFS-001"]);
  });

  it("emits count without LF when member length is missing", () => {
    const materials = calculateFloorFraming(
      buildPayload([buildSystem()], [
        buildArea({
          joistMemberLengthFeet: null,
          resolutionTraces: [
            resolvedTrace("spanDirection"),
            resolvedTrace("joistLayoutLengthFeet"),
          ],
        }),
      ]),
    );

    assert.equal(joistCountLine(materials, "FFA-001")?.quantity, 16);
    assert.equal(joistLfLine(materials, "FFA-001"), undefined);
  });

  it("calculates independently for multiple areas (i-joist LF + dimensional count-only)", () => {
    const materials = calculateFloorFraming(
      buildPayload(
        [
          buildSystem(),
          buildSystem({
            id: "FFS-002",
            areaIds: ["FFA-002"],
            assembly: {
              joistType: "dimensional-lumber",
              joistSize: "2x10",
              joistSpacingInches: 16,
              rimBoard: null,
            },
          }),
        ],
        [
          buildArea(),
          buildArea({
            id: "FFA-002",
            parentSystemId: "FFS-002",
            joistLayoutLengthFeet: 20,
            joistMemberLengthFeet: null,
            spanDirection: "east-west",
            resolutionTraces: [
              resolvedTrace("spanDirection"),
              resolvedTrace("joistLayoutLengthFeet"),
            ],
          }),
        ],
      ),
    );

    assert.equal(joistCountLine(materials, "FFA-001")?.quantity, 16);
    assert.equal(joistLfLine(materials, "FFA-001")?.quantity, 192);
    assert.equal(joistCountLine(materials, "FFA-002")?.quantity, 16);
    assert.equal(joistLfLine(materials, "FFA-002"), undefined);
  });

  it("emits dimensional lumber LF when member length resolves", () => {
    const materials = calculateFloorFraming(
      buildPayload(
        [
          buildSystem({
            assembly: {
              joistType: "dimensional-lumber",
              joistSize: "2x10",
              joistSpacingInches: 16,
              rimBoard: null,
            },
          }),
        ],
        [buildArea({ joistMemberLengthFeet: 14 })],
      ),
    );

    assert.equal(joistCountLine(materials, "FFA-001")?.quantity, 16);
    assert.equal(joistLfLine(materials, "FFA-001")?.quantity, 224);
    assert.equal(joistLfLine(materials, "FFA-001")?.unit, "linear-foot");
  });

  it("does not silently emit LF for floor-truss classification", () => {
    const materials = calculateFloorFraming(
      buildPayload(
        [
          buildSystem({
            assembly: {
              joistType: "floor-truss",
              joistSize: "18",
              joistSpacingInches: 24,
              rimBoard: null,
            },
          }),
        ],
        [buildArea({ joistLayoutLengthFeet: 24, joistMemberLengthFeet: 12 })],
      ),
    );

    assert.equal(joistCountLine(materials, "FFA-001")?.quantity, 13);
    assert.equal(joistLfLine(materials, "FFA-001"), undefined);
  });

  it("skips areas missing layout length, spacing, type, size, or span", () => {
    assert.equal(
      calculateFloorFraming(
        buildPayload([buildSystem()], [
          buildArea({ joistLayoutLengthFeet: null, resolutionTraces: [] }),
        ]),
      ).length,
      0,
    );
    assert.equal(
      calculateFloorFraming(
        buildPayload(
          [
            buildSystem({
              assembly: {
                joistType: "i-joist",
                joistSize: "11-7/8",
                joistSpacingInches: null,
                rimBoard: null,
              },
              resolutionTraces: [
                resolvedTrace("assembly.joistType"),
                resolvedTrace("assembly.joistSize"),
              ],
            }),
          ],
          [buildArea()],
        ),
      ).length,
      0,
    );
  });

  it("does not deduct openings and does not invent structural-member quantities", () => {
    const materials = calculateFloorFraming(
      buildPayload([buildSystem()], [
        buildArea({
          openingIds: ["O-014"],
          structuralMemberIds: ["SM-008"],
        }),
      ]),
    );
    assert.equal(joistCountLine(materials, "FFA-001")?.quantity, 16);
    assert.equal(joistLfLine(materials, "FFA-001")?.quantity, 192);
    assert.equal(
      materials.some((item) => item.sourceObjectIds.includes("SM-008")),
      false,
    );
  });
});

/**
 * S4-LY-1: Joist position-census fixture.
 *
 * Per V1 spec §16.2 / §18: purchased regularly spaced joist count = enumerated layout positions.
 * The formula `ceil((L*12)/spacing)+1` is a sanity check, not authority.
 */
describe("joist position-census (S4-LY-1)", () => {
  it("count equals position array length for 20 ft @ 16 in OC (Brain worked example)", () => {
    const positions = enumerateJoistLayoutPositionsInches(20, 16);
    const count = countRegularlySpacedJoists(20, 16);
    assert.equal(count, positions.length, "count must equal enumerated positions");
    assert.equal(count, 16);
    assert.equal(positions[0], 0);
    assert.equal(positions[positions.length - 1], 240);
  });

  it("count equals position array length for 40 ft @ 16 in OC (W4-C crawl case)", () => {
    const positions = enumerateJoistLayoutPositionsInches(40, 16);
    const count = countRegularlySpacedJoists(40, 16);
    assert.equal(count, positions.length, "count must equal enumerated positions");
    assert.equal(count, 31);
    assert.equal(positions[0], 0);
    assert.equal(positions[positions.length - 1], 480);
  });

  it("count equals position array length for 12 ft @ 16 in OC (short final bay)", () => {
    const positions = enumerateJoistLayoutPositionsInches(12, 16);
    const count = countRegularlySpacedJoists(12, 16);
    assert.equal(count, positions.length, "count must equal enumerated positions");
    assert.equal(count, 10);
  });

  it("count equals position array length for 19.5 ft @ 16 in OC (non-integer spaces)", () => {
    const positions = enumerateJoistLayoutPositionsInches(19.5, 16);
    const count = countRegularlySpacedJoists(19.5, 16);
    assert.equal(count, positions.length, "count must equal enumerated positions");
    assert.equal(count, 16);
  });

  it("count equals position array length for 24 in OC spacing", () => {
    const positions = enumerateJoistLayoutPositionsInches(24, 24);
    const count = countRegularlySpacedJoists(24, 24);
    assert.equal(count, positions.length, "count must equal enumerated positions");
    assert.equal(count, 13);
  });

  it("W4-C 31 joists: positions are [0, 16, 32, ... 480] with 31 elements", () => {
    const positions = enumerateJoistLayoutPositionsInches(40, 16);
    assert.equal(positions.length, 31, "W4-C crawl must have 31 joist positions");
    const expectedPositions = Array.from({ length: 31 }, (_, i) => i * 16);
    expectedPositions[30] = 480;
    assert.deepEqual(positions, expectedPositions);
  });
});
