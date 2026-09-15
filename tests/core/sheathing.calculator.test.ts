import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  calculateSheathing,
  calculateSheathingWithPieces,
} from "../../src/framing/calculate/calculateSheathing.js";
import type { SheathingPayload } from "../../src/framing/schemas/framing-artifacts.schema.js";
import { framingMaterialLineItemSchema } from "../../src/framing/schemas/material.schema.js";
import type {
  SheathingArea,
  SheathingSystem,
} from "../../src/framing/schemas/sheathing.schema.js";

function resolvedTrace(
  propertyPath: string,
  assumptionIds: string[] = [],
) {
  return {
    propertyPath,
    method: "explicit-project-value" as const,
    explanation: `${propertyPath} is explicit on the plans.`,
    assumptionIds,
  };
}

function buildSystem(
  overrides: Partial<SheathingSystem> = {},
): SheathingSystem {
  return {
    id: "SHS-001",
    objectType: "sheathing-system",
    resolutionTraces: [
      resolvedTrace("application"),
      resolvedTrace("panelSpecification.panelType"),
      resolvedTrace("panelSpecification.thickness", ["A-THICKNESS"]),
    ],
    name: "Level 1 exterior wall sheathing",
    level: "Level 1",
    application: "wall",
    constructionPhase: "new",
    panelSpecification: {
      panelType: "OSB",
      thickness: '7/16"',
      grade: null,
      spanRating: null,
      exposureRating: null,
      edgeTreatment: null,
      specificationReference: "S1.0 wall sheathing note",
      panelWidthInches: null,
      panelHeightInches: null,
    },
    areaIds: ["SHA-001"],
    ...overrides,
  };
}

function buildArea(overrides: Partial<SheathingArea> = {}): SheathingArea {
  return {
    id: "SHA-001",
    objectType: "sheathing-area",
    resolutionTraces: [
      resolvedTrace("areaSquareFeet", ["A-COVERAGE"]),
    ],
    parentSystemId: "SHS-001",
    layout: "horizontal",
    areaSquareFeet: 320,
    coveredObjectIds: ["W-001"],
    openingIds: [],
    surfaceWidthFeet: null,
    surfaceHeightFeet: null,
    panelPieces: [],
    ...overrides,
  };
}

function buildPayload(
  systems: SheathingSystem[] = [buildSystem()],
  areas: SheathingArea[] = [buildArea()],
): SheathingPayload {
  return { systems, areas };
}

describe("calculateSheathing", () => {
  it("emits coverage SF for resolved wall sheathing", () => {
    const [item] = calculateSheathing(buildPayload());

    assert.equal(item?.quantity, 320);
    assert.equal(item?.unit, "square-foot");
    assert.equal(item?.category, "structural-panel");
    assert.equal(item?.canonicalClassification, 'wall-OSB-7/16"');
    assert.match(item?.description ?? "", /wall sheathing/);
  });

  it("emits coverage SF for resolved floor sheathing", () => {
    const [item] = calculateSheathing(
      buildPayload(
        [
          buildSystem({
            application: "floor",
            name: "Level 1 floor sheathing",
          }),
        ],
        [buildArea({ areaSquareFeet: 480 })],
      ),
    );

    assert.equal(item?.quantity, 480);
    assert.equal(item?.canonicalClassification, 'floor-OSB-7/16"');
  });

  it("emits coverage SF for resolved roof sheathing", () => {
    const [item] = calculateSheathing(
      buildPayload(
        [
          buildSystem({
            application: "roof",
            name: "Roof sheathing",
          }),
        ],
        [buildArea({ areaSquareFeet: 210 })],
      ),
    );

    assert.equal(item?.quantity, 210);
    assert.equal(item?.canonicalClassification, 'roof-OSB-7/16"');
  });

  it("emits one line per sheathing area in stable order", () => {
    const materials = calculateSheathing(
      buildPayload(
        [
          buildSystem({
            areaIds: ["SHA-002", "SHA-001"],
          }),
        ],
        [
          buildArea({ id: "SHA-002", areaSquareFeet: 80 }),
          buildArea({ id: "SHA-001", areaSquareFeet: 320 }),
        ],
      ),
    );

    assert.deepEqual(
      materials.map((item) => item.quantity),
      [320, 80],
    );
    assert.equal(materials.length, 2);
  });

  it("skips when areaSquareFeet is unresolved", () => {
    const materials = calculateSheathing(
      buildPayload([buildSystem()], [buildArea({ areaSquareFeet: null })]),
    );

    assert.equal(materials.length, 0);
  });

  it("skips material output when application is unresolved", () => {
    const materials = calculateSheathing(
      buildPayload([buildSystem({ application: "unknown" })]),
    );

    assert.equal(materials.length, 0);
  });

  it("skips when panel type is missing", () => {
    const materials = calculateSheathing(
      buildPayload([
        buildSystem({
          panelSpecification: {
            ...buildSystem().panelSpecification,
            panelType: null,
          },
        }),
      ]),
    );

    assert.equal(materials.length, 0);
  });

  it("skips when thickness is missing", () => {
    const materials = calculateSheathing(
      buildPayload([
        buildSystem({
          panelSpecification: {
            ...buildSystem().panelSpecification,
            thickness: null,
          },
        }),
      ]),
    );

    assert.equal(materials.length, 0);
  });

  it("emits when optional grade, span, exposure, and edge fields are absent", () => {
    const [item] = calculateSheathing(buildPayload());

    assert.equal(item?.quantity, 320);
    assert.doesNotMatch(item?.description ?? "", /span|exposure|grade|edge/i);
  });

  it("does not change quantity when openingIds are present", () => {
    const withoutOpenings = calculateSheathing(buildPayload());
    const withOpenings = calculateSheathing(
      buildPayload(
        [buildSystem()],
        [buildArea({ openingIds: ["O-014", "O-015"] })],
      ),
    );

    assert.equal(withoutOpenings[0]?.quantity, withOpenings[0]?.quantity);
    assert.equal(withOpenings[0]?.quantity, 320);
  });

  it("does not emit a generic SF line when application is unknown even if areaSquareFeet is resolved", () => {
    // Brain: coverage arithmetic is valid; material-line emission requires identity.
    const payload = buildPayload([buildSystem({ application: "unknown" })]);
    assert.equal(payload.areas[0]?.areaSquareFeet, 320);
    assert.equal(calculateSheathing(payload).length, 0);
  });

  it("preserves source object and assumption provenance from used traces", () => {
    const [item] = calculateSheathing(buildPayload());

    assert.deepEqual(item?.sourceObjectIds, ["SHS-001", "SHA-001"]);
    assert.deepEqual(item?.assumptionIds, ["A-COVERAGE", "A-THICKNESS"]);
  });

  it("is deterministic across reruns", () => {
    const payload = buildPayload();

    assert.deepEqual(
      calculateSheathing(payload),
      calculateSheathing(payload),
    );
  });

  it("emits line items that parse through FramingMaterialLineItem", () => {
    const materials = calculateSheathing(
      buildPayload(
        [buildSystem({ areaIds: ["SHA-001", "SHA-002"] })],
        [
          buildArea(),
          buildArea({ id: "SHA-002", areaSquareFeet: 80 }),
        ],
      ),
    );

    assert.equal(materials.length, 2);
    for (const item of materials) {
      assert.deepEqual(framingMaterialLineItemSchema.parse(item), item);
    }
  });
});

describe("calculateSheathingWithPieces (S4-PN-1 production path)", () => {
  it("materializes two panels for 8×8 wall with explicit 4×8 panel dimensions", () => {
    const system = buildSystem({
      id: "SHS-8x8",
      resolutionTraces: [
        resolvedTrace("application"),
        resolvedTrace("panelSpecification.panelType"),
        resolvedTrace("panelSpecification.thickness"),
        resolvedTrace("panelSpecification.panelWidthInches"),
        resolvedTrace("panelSpecification.panelHeightInches"),
      ],
      panelSpecification: {
        panelType: "OSB",
        thickness: '7/16"',
        grade: null,
        spanRating: null,
        exposureRating: null,
        edgeTreatment: null,
        specificationReference: null,
        panelWidthInches: 48,
        panelHeightInches: 96,
      },
      areaIds: ["SHA-8x8"],
    });

    const area = buildArea({
      id: "SHA-8x8",
      parentSystemId: "SHS-8x8",
      areaSquareFeet: 64,
      resolutionTraces: [
        resolvedTrace("areaSquareFeet"),
        resolvedTrace("surfaceWidthFeet"),
        resolvedTrace("surfaceHeightFeet"),
      ],
      surfaceWidthFeet: 8,
      surfaceHeightFeet: 8,
      panelPieces: [],
    });

    const result = calculateSheathingWithPieces({ systems: [system], areas: [area] });

    assert.equal(result.materials.length, 1);
    assert.equal(result.materials[0]?.quantity, 64);
    assert.equal(result.materials[0]?.unit, "square-foot");

    const updatedArea = result.areasWithPieces.find((a) => a.id === "SHA-8x8");
    assert.ok(updatedArea);
    assert.equal(updatedArea.panelPieces.length, 2, "Should have exactly 2 panels for 8ft×8ft with 4×8 panels");

    const firstPiece = updatedArea.panelPieces[0]!;
    assert.equal(firstPiece.originXInches, 0);
    assert.equal(firstPiece.widthInches, 48);
    assert.equal(firstPiece.heightInches, 96);
    assert.equal(firstPiece.isCut, false);
    assert.equal(firstPiece.isRemnant, false);

    const secondPiece = updatedArea.panelPieces[1]!;
    assert.equal(secondPiece.originXInches, 48);
    assert.equal(secondPiece.widthInches, 48);
    assert.equal(secondPiece.heightInches, 96);
  });

  it("does NOT invent 4×8 when panel dimensions are missing", () => {
    const system = buildSystem({
      id: "SHS-NO-DIM",
      panelSpecification: {
        panelType: "OSB",
        thickness: '7/16"',
        grade: null,
        spanRating: null,
        exposureRating: null,
        edgeTreatment: null,
        specificationReference: null,
        panelWidthInches: null,
        panelHeightInches: null,
      },
      areaIds: ["SHA-NO-DIM"],
    });

    const area = buildArea({
      id: "SHA-NO-DIM",
      parentSystemId: "SHS-NO-DIM",
      areaSquareFeet: 64,
      resolutionTraces: [
        resolvedTrace("areaSquareFeet"),
        resolvedTrace("surfaceWidthFeet"),
        resolvedTrace("surfaceHeightFeet"),
      ],
      surfaceWidthFeet: 8,
      surfaceHeightFeet: 8,
      panelPieces: [],
    });

    const result = calculateSheathingWithPieces({ systems: [system], areas: [area] });

    assert.equal(result.materials.length, 1);

    const updatedArea = result.areasWithPieces.find((a) => a.id === "SHA-NO-DIM");
    assert.ok(updatedArea);
    assert.equal(
      updatedArea.panelPieces.length,
      0,
      "Should NOT materialize panels when dimensions missing (do NOT invent 4×8)",
    );
  });

  it("does NOT materialize panels when surface dimensions are missing", () => {
    const system = buildSystem({
      id: "SHS-NO-SURF",
      resolutionTraces: [
        resolvedTrace("application"),
        resolvedTrace("panelSpecification.panelType"),
        resolvedTrace("panelSpecification.thickness"),
        resolvedTrace("panelSpecification.panelWidthInches"),
        resolvedTrace("panelSpecification.panelHeightInches"),
      ],
      panelSpecification: {
        panelType: "OSB",
        thickness: '7/16"',
        grade: null,
        spanRating: null,
        exposureRating: null,
        edgeTreatment: null,
        specificationReference: null,
        panelWidthInches: 48,
        panelHeightInches: 96,
      },
      areaIds: ["SHA-NO-SURF"],
    });

    const area = buildArea({
      id: "SHA-NO-SURF",
      parentSystemId: "SHS-NO-SURF",
      areaSquareFeet: 64,
      surfaceWidthFeet: null,
      surfaceHeightFeet: null,
      panelPieces: [],
    });

    const result = calculateSheathingWithPieces({ systems: [system], areas: [area] });

    const updatedArea = result.areasWithPieces.find((a) => a.id === "SHA-NO-SURF");
    assert.ok(updatedArea);
    assert.equal(
      updatedArea.panelPieces.length,
      0,
      "Should NOT materialize panels when surface dimensions missing",
    );
  });

  it("materializes panels for floor sheathing with explicit dimensions", () => {
    const system = buildSystem({
      id: "SHS-FLOOR-8x8",
      application: "floor",
      resolutionTraces: [
        resolvedTrace("application"),
        resolvedTrace("panelSpecification.panelType"),
        resolvedTrace("panelSpecification.thickness"),
        resolvedTrace("panelSpecification.panelWidthInches"),
        resolvedTrace("panelSpecification.panelHeightInches"),
      ],
      panelSpecification: {
        panelType: "OSB",
        thickness: '23/32"',
        grade: null,
        spanRating: null,
        exposureRating: null,
        edgeTreatment: "T&G",
        specificationReference: null,
        panelWidthInches: 48,
        panelHeightInches: 96,
      },
      areaIds: ["SHA-FLOOR-8x8"],
    });

    const area = buildArea({
      id: "SHA-FLOOR-8x8",
      parentSystemId: "SHS-FLOOR-8x8",
      areaSquareFeet: 64,
      resolutionTraces: [
        resolvedTrace("areaSquareFeet"),
        resolvedTrace("surfaceWidthFeet"),
        resolvedTrace("surfaceHeightFeet"),
      ],
      surfaceWidthFeet: 8,
      surfaceHeightFeet: 8,
      panelPieces: [],
    });

    const result = calculateSheathingWithPieces({ systems: [system], areas: [area] });

    const updatedArea = result.areasWithPieces.find((a) => a.id === "SHA-FLOOR-8x8");
    assert.ok(updatedArea);
    assert.equal(updatedArea.panelPieces.length, 2, "Should materialize 2 panels for floor");
  });

  it("does NOT materialize panels for roof sheathing (3D roof out of scope)", () => {
    const system = buildSystem({
      id: "SHS-ROOF",
      application: "roof",
      resolutionTraces: [
        resolvedTrace("application"),
        resolvedTrace("panelSpecification.panelType"),
        resolvedTrace("panelSpecification.thickness"),
        resolvedTrace("panelSpecification.panelWidthInches"),
        resolvedTrace("panelSpecification.panelHeightInches"),
      ],
      panelSpecification: {
        panelType: "OSB",
        thickness: '7/16"',
        grade: null,
        spanRating: null,
        exposureRating: null,
        edgeTreatment: null,
        specificationReference: null,
        panelWidthInches: 48,
        panelHeightInches: 96,
      },
      areaIds: ["SHA-ROOF"],
    });

    const area = buildArea({
      id: "SHA-ROOF",
      parentSystemId: "SHS-ROOF",
      areaSquareFeet: 64,
      resolutionTraces: [
        resolvedTrace("areaSquareFeet"),
        resolvedTrace("surfaceWidthFeet"),
        resolvedTrace("surfaceHeightFeet"),
      ],
      surfaceWidthFeet: 8,
      surfaceHeightFeet: 8,
      panelPieces: [],
    });

    const result = calculateSheathingWithPieces({ systems: [system], areas: [area] });

    const updatedArea = result.areasWithPieces.find((a) => a.id === "SHA-ROOF");
    assert.ok(updatedArea);
    assert.equal(
      updatedArea.panelPieces.length,
      0,
      "Should NOT materialize panels for roof (3D out of scope)",
    );
  });

  it("returns SF coverage even when panel layout is eligible", () => {
    const system = buildSystem({
      id: "SHS-BOTH",
      resolutionTraces: [
        resolvedTrace("application"),
        resolvedTrace("panelSpecification.panelType"),
        resolvedTrace("panelSpecification.thickness"),
        resolvedTrace("panelSpecification.panelWidthInches"),
        resolvedTrace("panelSpecification.panelHeightInches"),
      ],
      panelSpecification: {
        panelType: "OSB",
        thickness: '7/16"',
        grade: null,
        spanRating: null,
        exposureRating: null,
        edgeTreatment: null,
        specificationReference: null,
        panelWidthInches: 48,
        panelHeightInches: 96,
      },
      areaIds: ["SHA-BOTH"],
    });

    const area = buildArea({
      id: "SHA-BOTH",
      parentSystemId: "SHS-BOTH",
      areaSquareFeet: 64,
      resolutionTraces: [
        resolvedTrace("areaSquareFeet"),
        resolvedTrace("surfaceWidthFeet"),
        resolvedTrace("surfaceHeightFeet"),
      ],
      surfaceWidthFeet: 8,
      surfaceHeightFeet: 8,
      panelPieces: [],
    });

    const result = calculateSheathingWithPieces({ systems: [system], areas: [area] });

    assert.equal(result.materials.length, 1);
    assert.equal(result.materials[0]?.quantity, 64);
    assert.equal(result.materials[0]?.unit, "square-foot");

    const updatedArea = result.areasWithPieces.find((a) => a.id === "SHA-BOTH");
    assert.ok(updatedArea);
    assert.equal(updatedArea.panelPieces.length, 2);
  });
});
