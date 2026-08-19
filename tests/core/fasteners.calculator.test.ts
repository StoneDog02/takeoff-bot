import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { calculateFasteners } from "../../src/scopes/framing/calculators/calculateFasteners.js";
import type { Fastener } from "../../src/scopes/framing/schemas/connectors-hardware.schema.js";
import type {
  ConnectorsHardwarePayload,
  ValidationPayload,
} from "../../src/scopes/framing/schemas/framing-artifacts.schema.js";
import { framingMaterialLineItemSchema } from "../../src/scopes/framing/schemas/material.schema.js";
import { createValidationIssue } from "../../src/scopes/framing/validators/createValidationIssue.js";
import { createObjectTarget } from "../../src/scopes/framing/validators/ids.js";
import { CONNECTORS_HARDWARE_QUANTITY_KEYS } from "../../src/scopes/framing/validators/rule-ids.js";

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
    explanation: `${propertyPath} is specified on the plans.`,
    evidenceIds: ["E-FS-001"],
    assumptionIds,
    validationIssueIds: [] as string[],
    reviewItemIds,
  };
}

function unresolvedTrace(propertyPath: string) {
  return {
    propertyPath,
    method: "unresolved" as const,
    explanation: `${propertyPath} is unresolved.`,
    evidenceIds: [] as string[],
    assumptionIds: [] as string[],
    validationIssueIds: [] as string[],
    reviewItemIds: [] as string[],
  };
}

function buildFastener(overrides: Partial<Fastener> = {}): Fastener {
  return {
    id: "FS-001",
    objectType: "fastener",
    completion: complete,
    reviewStatus: "no-review-required",
    blockingStatus: "not-blocked",
    evidenceIds: ["E-FS-001"],
    assumptionIds: ["A-FASTENER"],
    validationIssueIds: [],
    reviewItemIds: ["RI-FASTENER"],
    resolutionTraces: [
      resolvedTrace("fastenerType"),
      resolvedTrace("quantity", ["A-QTY"], ["RI-QTY"]),
    ],
    fastenerType: "nail",
    diameter: null,
    length: null,
    coating: null,
    quantity: 40,
    associatedObjectIds: [],
    ...overrides,
  };
}

function buildPayload(
  fasteners: Fastener[] = [buildFastener()],
): ConnectorsHardwarePayload {
  return {
    connectors: [
      {
        id: "CN-001",
        objectType: "connector",
        completion: complete,
        reviewStatus: "no-review-required",
        blockingStatus: "not-blocked",
        evidenceIds: ["E-CN-001"],
        assumptionIds: [],
        validationIssueIds: [],
        reviewItemIds: [],
        resolutionTraces: [resolvedTrace("connectorType")],
        connectorType: "joist hanger",
        model: "HUS26",
        associatedObjectIds: ["SM-008"],
        hardwareIds: ["HW-001"],
        fastenerIds: fasteners.map((fastener) => fastener.id),
      },
    ],
    hardware: [
      {
        id: "HW-001",
        objectType: "hardware",
        completion: complete,
        reviewStatus: "no-review-required",
        blockingStatus: "not-blocked",
        evidenceIds: ["E-HW-001"],
        assumptionIds: [],
        validationIssueIds: [],
        reviewItemIds: [],
        resolutionTraces: [resolvedTrace("hardwareType")],
        hardwareType: "bearing plate",
        associatedObjectIds: ["SM-008"],
      },
    ],
    fasteners,
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

describe("calculateFasteners", () => {
  it("emits the specified quantity exactly as each", () => {
    const [item] = calculateFasteners(buildPayload());

    assert.equal(item?.quantity, 40);
    assert.equal(item?.unit, "each");
    assert.equal(item?.category, "fastener");
    assert.equal(item?.canonicalClassification, "nail");
    assert.equal(item?.description, "nail");
  });

  it("emits quantity 1 without alteration", () => {
    const [item] = calculateFasteners(
      buildPayload([buildFastener({ quantity: 1 })]),
    );

    assert.equal(item?.quantity, 1);
  });

  it("emits quantity greater than 1 without alteration", () => {
    const [item] = calculateFasteners(
      buildPayload([buildFastener({ quantity: 96 })]),
    );

    assert.equal(item?.quantity, 96);
  });

  it("skips a null quantity", () => {
    const materials = calculateFasteners(
      buildPayload([buildFastener({ quantity: null })]),
    );

    assert.equal(materials.length, 0);
  });

  it("skips an explicitly unresolved quantity", () => {
    const materials = calculateFasteners(
      buildPayload([
        buildFastener({
          quantity: 40,
          resolutionTraces: [
            resolvedTrace("fastenerType"),
            unresolvedTrace("quantity"),
          ],
        }),
      ]),
    );

    assert.equal(materials.length, 0);
  });

  it("skips a missing or unresolved fastener type", () => {
    const missingType = calculateFasteners(
      buildPayload([buildFastener({ fastenerType: null })]),
    );
    const unresolvedType = calculateFasteners(
      buildPayload([
        buildFastener({
          fastenerType: "nail",
          resolutionTraces: [
            unresolvedTrace("fastenerType"),
            resolvedTrace("quantity"),
          ],
        }),
      ]),
    );
    const unknownType = calculateFasteners(
      buildPayload([buildFastener({ fastenerType: "unknown" })]),
    );

    assert.equal(missingType.length, 0);
    assert.equal(unresolvedType.length, 0);
    assert.equal(unknownType.length, 0);
  });

  it("emits a valid line when optional diameter, length, and coating are absent", () => {
    const [item] = calculateFasteners(buildPayload());

    assert.equal(item?.description, "nail");
    assert.equal(item?.canonicalClassification, "nail");
    assert.deepEqual(framingMaterialLineItemSchema.parse(item), item);
  });

  it("includes resolved optional descriptors without inventing missing ones", () => {
    const [item] = calculateFasteners(
      buildPayload([
        buildFastener({
          diameter: '0.148"',
          length: '3-1/2"',
          coating: "hot-dip galvanized",
          resolutionTraces: [
            resolvedTrace("fastenerType"),
            resolvedTrace("quantity"),
            resolvedTrace("diameter"),
            resolvedTrace("length"),
            resolvedTrace("coating"),
          ],
        }),
      ]),
    );

    assert.equal(item?.description, '0.148" 3-1/2" hot-dip galvanized nail');
    assert.equal(
      item?.canonicalClassification,
      'nail-0.148"-3-1/2"-hot-dip galvanized',
    );
  });

  it("does not infer quantity from associated objects", () => {
    const [item] = calculateFasteners(
      buildPayload([
        buildFastener({
          quantity: 12,
          associatedObjectIds: ["CN-001", "SM-008", "SM-009"],
        }),
      ]),
    );

    assert.equal(item?.quantity, 12);
    assert.deepEqual(item?.sourceObjectIds, ["FS-001"]);
  });

  it("does not emit Connector or Hardware quantities", () => {
    const materials = calculateFasteners(buildPayload([]));

    assert.equal(materials.length, 0);
  });

  it("suppresses output when Validation blocks fastener.material", () => {
    const fastener = buildFastener();
    const validation = emptyValidation([
      createValidationIssue({
        ruleId: "fastener.type.resolved",
        level: "object",
        severity: "critical",
        ruleViolated: "Fastener type must be resolved.",
        explanation: "Validation blocked fastener material.",
        target: createObjectTarget(fastener.id, fastener.objectType),
        quantityImpacts: [
          {
            quantityKey: CONNECTORS_HARDWARE_QUANTITY_KEYS.fastenerMaterial,
            description: "Fastener material takeoff cannot proceed.",
            canCalculate: false,
          },
        ],
      }),
    ]);

    assert.equal(calculateFasteners(buildPayload([fastener]), validation).length, 0);
  });

  it("does not suppress output for unrelated Validation", () => {
    const fastener = buildFastener();
    const validation = emptyValidation([
      createValidationIssue({
        ruleId: "fastener.associatedObjects.resolved",
        level: "relationship",
        severity: "warning",
        ruleViolated: "Associated object review is unrelated to specified quantity.",
        explanation: "Unrelated relationship review.",
        target: createObjectTarget(fastener.id, fastener.objectType),
        quantityImpacts: [
          {
            quantityKey: CONNECTORS_HARDWARE_QUANTITY_KEYS.fastenerMaterial,
            description: "Specified fastener quantity may still proceed.",
            canCalculate: true,
          },
        ],
      }),
    ]);
    const [item] = calculateFasteners(buildPayload([fastener]), validation);

    assert.equal(item?.quantity, 40);
  });

  it("preserves source object, assumption, and review provenance", () => {
    const [item] = calculateFasteners(buildPayload());

    assert.deepEqual(item?.sourceObjectIds, ["FS-001"]);
    assert.deepEqual(item?.assumptionIds, ["A-FASTENER", "A-QTY"]);
    assert.deepEqual(item?.reviewItemIds, ["RI-FASTENER", "RI-QTY"]);
  });

  it("orders line items stably by fastener object ID", () => {
    const materials = calculateFasteners(
      buildPayload([
        buildFastener({ id: "FS-010", quantity: 2 }),
        buildFastener({ id: "FS-002", quantity: 8 }),
      ]),
    );

    assert.deepEqual(
      materials.map((item) => item.sourceObjectIds[0]),
      ["FS-002", "FS-010"],
    );
  });

  it("is deterministic across reruns", () => {
    const payload = buildPayload();

    assert.deepEqual(calculateFasteners(payload), calculateFasteners(payload));
  });

  it("emits line items that parse through FramingMaterialLineItem", () => {
    const materials = calculateFasteners(buildPayload());

    assert.equal(materials.length, 1);
    assert.deepEqual(
      framingMaterialLineItemSchema.parse(materials[0]),
      materials[0],
    );
  });
});
