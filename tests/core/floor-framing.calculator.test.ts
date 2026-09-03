import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  calculateFloorFraming,
  countRegularlySpacedJoists,
  isSimpleAreaJoistLinearFeetTypeSupported,
} from "../../src/scopes/framing/calculators/calculateFloorFraming.js";
import type { FloorFramingPayload } from "../../src/scopes/framing/schemas/framing-artifacts.schema.js";
import { framingMaterialLineItemSchema } from "../../src/scopes/framing/schemas/material.schema.js";
import type {
  FloorFramingArea,
  FloorFramingSystem,
} from "../../src/scopes/framing/schemas/floor-framing.schema.js";
import { FLOOR_QUANTITY_KEYS } from "../../src/scopes/framing/validators/rule-ids.js";
import { createMaterialLineItemId } from "../../src/scopes/framing/calculators/ids.js";

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
