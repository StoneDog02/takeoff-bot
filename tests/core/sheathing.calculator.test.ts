import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { calculateSheathing } from "../../src/scopes/framing/calculators/calculateSheathing.js";
import type {
  SheathingPayload,
  ValidationPayload,
} from "../../src/scopes/framing/schemas/framing-artifacts.schema.js";
import { framingMaterialLineItemSchema } from "../../src/scopes/framing/schemas/material.schema.js";
import type {
  SheathingArea,
  SheathingSystem,
} from "../../src/scopes/framing/schemas/sheathing.schema.js";
import { createValidationIssue } from "../../src/scopes/framing/validators/createValidationIssue.js";
import { createObjectTarget } from "../../src/scopes/framing/validators/ids.js";
import { SHEATHING_QUANTITY_KEYS } from "../../src/scopes/framing/validators/rule-ids.js";

const complete = {
  status: "complete",
  percentage: 100,
  completedItems: 1,
  totalItems: 1,
} as const;

function resolvedTrace(
  propertyPath: string,
  assumptionIds: string[] = [],
  reviewItemIds: string[] = [],
) {
  return {
    propertyPath,
    method: "explicit-project-value" as const,
    explanation: `${propertyPath} is explicit on the plans.`,
    evidenceIds: ["E-SHS-001"],
    assumptionIds,
    validationIssueIds: [],
    reviewItemIds,
  };
}

function buildSystem(
  overrides: Partial<SheathingSystem> = {},
): SheathingSystem {
  return {
    id: "SHS-001",
    objectType: "sheathing-system",
    completion: complete,
    reviewStatus: "no-review-required",
    blockingStatus: "not-blocked",
    evidenceIds: ["E-SHS-001"],
    assumptionIds: ["A-SYSTEM"],
    validationIssueIds: [],
    reviewItemIds: ["RI-SYSTEM"],
    resolutionTraces: [
      resolvedTrace("application"),
      resolvedTrace("panelSpecification.panelType"),
      resolvedTrace("panelSpecification.thickness", ["A-THICKNESS"], ["RI-THICKNESS"]),
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
    },
    areaIds: ["SHA-001"],
    ...overrides,
  };
}

function buildArea(overrides: Partial<SheathingArea> = {}): SheathingArea {
  return {
    id: "SHA-001",
    objectType: "sheathing-area",
    completion: complete,
    reviewStatus: "no-review-required",
    blockingStatus: "not-blocked",
    evidenceIds: ["E-SHA-001"],
    assumptionIds: ["A-AREA"],
    validationIssueIds: [],
    reviewItemIds: ["RI-AREA"],
    resolutionTraces: [
      resolvedTrace("areaSquareFeet", ["A-COVERAGE"], ["RI-COVERAGE"]),
    ],
    parentSystemId: "SHS-001",
    layout: "horizontal",
    areaSquareFeet: 320,
    coveredObjectIds: ["W-001"],
    openingIds: [],
    ...overrides,
  };
}

function buildPayload(
  systems: SheathingSystem[] = [buildSystem()],
  areas: SheathingArea[] = [buildArea()],
): SheathingPayload {
  return { systems, areas };
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

  it("suppresses only the area Validation marks as non-calculable", () => {
    const blocked = buildArea({ id: "SHA-001" });
    const open = buildArea({ id: "SHA-002", areaSquareFeet: 80 });
    const validation = emptyValidation([
      createValidationIssue({
        ruleId: "sheathing.area.areaSquareFeet.resolved",
        level: "object",
        severity: "critical",
        ruleViolated: "Sheathing area cannot be calculated.",
        explanation: "Validation blocked one area.",
        target: createObjectTarget(blocked.id, blocked.objectType),
        quantityImpacts: [
          {
            quantityKey: SHEATHING_QUANTITY_KEYS.area,
            description: "This area cannot be calculated.",
            canCalculate: false,
          },
        ],
      }),
    ]);
    const materials = calculateSheathing(
      buildPayload(
        [buildSystem({ areaIds: ["SHA-001", "SHA-002"] })],
        [blocked, open],
      ),
      validation,
    );

    assert.equal(materials.length, 1);
    assert.equal(materials[0]?.quantity, 80);
  });

  it("suppresses material output when Validation blocks sheathing.material", () => {
    const system = buildSystem();
    const validation = emptyValidation([
      createValidationIssue({
        ruleId: "sheathing.system.panelType.resolved",
        level: "object",
        severity: "critical",
        ruleViolated: "Panel type cannot be calculated.",
        explanation: "Validation blocked material identity.",
        target: createObjectTarget(system.id, system.objectType),
        quantityImpacts: [
          {
            quantityKey: SHEATHING_QUANTITY_KEYS.material,
            description: "Material takeoff cannot proceed.",
            canCalculate: false,
          },
          {
            quantityKey: SHEATHING_QUANTITY_KEYS.area,
            description: "Area geometry may still be known.",
            canCalculate: true,
          },
        ],
      }),
    ]);

    assert.equal(
      calculateSheathing(buildPayload([system]), validation).length,
      0,
    );
  });

  it("does not emit a generic SF line when application is unknown even if areaSquareFeet is resolved", () => {
    // Brain: coverage arithmetic is valid; material-line emission requires identity.
    const payload = buildPayload([buildSystem({ application: "unknown" })]);
    assert.equal(payload.areas[0]?.areaSquareFeet, 320);
    assert.equal(calculateSheathing(payload).length, 0);
  });

  it("does not suppress output for unrelated Validation", () => {
    const area = buildArea({ openingIds: ["O-014"] });
    const validation = emptyValidation([
      createValidationIssue({
        ruleId: "sheathing.area.openings.resolved",
        level: "relationship",
        severity: "warning",
        ruleViolated: "Opening references are unrelated to coverage SF.",
        explanation: "Unrelated opening review.",
        target: createObjectTarget(area.id, area.objectType),
        quantityImpacts: [
          {
            quantityKey: SHEATHING_QUANTITY_KEYS.area,
            description: "Coverage SF may still proceed from explicit geometry.",
            canCalculate: true,
          },
        ],
      }),
    ]);
    const [item] = calculateSheathing(
      buildPayload([buildSystem()], [area]),
      validation,
    );

    assert.equal(item?.quantity, 320);
  });

  it("preserves source object, assumption, and review provenance", () => {
    const [item] = calculateSheathing(buildPayload());

    assert.deepEqual(item?.sourceObjectIds, ["SHS-001", "SHA-001"]);
    assert.deepEqual(item?.assumptionIds, [
      "A-AREA",
      "A-COVERAGE",
      "A-SYSTEM",
      "A-THICKNESS",
    ]);
    assert.deepEqual(item?.reviewItemIds, [
      "RI-AREA",
      "RI-COVERAGE",
      "RI-SYSTEM",
      "RI-THICKNESS",
    ]);
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
