import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { reviewItemSchema } from "../../src/core/schemas/review-item.schema.js";
import {
  validationIssueSchema,
  validationResultSchema,
} from "../../src/core/schemas/validation.schema.js";
import type { ConnectorsHardwarePayload } from "../../src/scopes/framing/schemas/framing-artifacts.schema.js";
import {
  CONNECTORS_HARDWARE_QUANTITY_KEYS,
  CONNECTORS_HARDWARE_RULE_IDS,
} from "../../src/scopes/framing/validators/rule-ids.js";
import { validateConnectorsHardware } from "../../src/scopes/framing/validators/connectors-hardware.validator.js";

const complete = {
  status: "complete",
  percentage: 100,
  completedItems: 1,
  totalItems: 1,
} as const;

function buildCompleteConnector(
  overrides: Partial<ConnectorsHardwarePayload["connectors"][number]> = {},
): ConnectorsHardwarePayload["connectors"][number] {
  return {
    id: "CN-001",
    objectType: "connector",
    completion: complete,
    reviewStatus: "no-review-required",
    blockingStatus: "not-blocked",
    evidenceIds: ["E-CN-001"],
    assumptionIds: [],
    validationIssueIds: [],
    reviewItemIds: [],
    resolutionTraces: [
      {
        propertyPath: "connectorType",
        method: "explicit-project-value",
        explanation: "Connector type is explicit on the detail.",
        evidenceIds: ["E-CN-001"],
        assumptionIds: [],
        validationIssueIds: [],
        reviewItemIds: [],
      },
    ],
    connectorType: "joist hanger",
    model: "HUS26",
    associatedObjectIds: ["SM-008"],
    hardwareIds: ["HW-001"],
    fastenerIds: ["FS-001"],
    ...overrides,
  };
}

function buildCompleteHardware(
  overrides: Partial<ConnectorsHardwarePayload["hardware"][number]> = {},
): ConnectorsHardwarePayload["hardware"][number] {
  return {
    id: "HW-001",
    objectType: "hardware",
    completion: complete,
    reviewStatus: "no-review-required",
    blockingStatus: "not-blocked",
    evidenceIds: ["E-HW-001"],
    assumptionIds: [],
    validationIssueIds: [],
    reviewItemIds: [],
    resolutionTraces: [
      {
        propertyPath: "hardwareType",
        method: "explicit-project-value",
        explanation: "Hardware type is explicit on the detail.",
        evidenceIds: ["E-HW-001"],
        assumptionIds: [],
        validationIssueIds: [],
        reviewItemIds: [],
      },
    ],
    hardwareType: "bearing plate",
    associatedObjectIds: ["SM-008", "CN-001"],
    ...overrides,
  };
}

function buildCompleteFastener(
  overrides: Partial<ConnectorsHardwarePayload["fasteners"][number]> = {},
): ConnectorsHardwarePayload["fasteners"][number] {
  return {
    id: "FS-001",
    objectType: "fastener",
    completion: complete,
    reviewStatus: "no-review-required",
    blockingStatus: "not-blocked",
    evidenceIds: ["E-FS-001"],
    assumptionIds: [],
    validationIssueIds: [],
    reviewItemIds: [],
    resolutionTraces: [
      {
        propertyPath: "fastenerType",
        method: "explicit-project-value",
        explanation: "Fastener type is explicit on the detail.",
        evidenceIds: ["E-FS-001"],
        assumptionIds: [],
        validationIssueIds: [],
        reviewItemIds: [],
      },
    ],
    fastenerType: "nail",
    diameter: '0.148"',
    length: '3-1/2"',
    coating: "hot-dip galvanized",
    quantity: 40,
    associatedObjectIds: ["CN-001"],
    ...overrides,
  };
}

function buildCompletePayload(
  overrides: Partial<ConnectorsHardwarePayload> = {},
): ConnectorsHardwarePayload {
  return {
    connectors: [buildCompleteConnector()],
    hardware: [buildCompleteHardware()],
    fasteners: [buildCompleteFastener()],
    ...overrides,
  };
}

function buildRelatedMaps() {
  return {
    relatedObjectsById: new Map([
      ["SM-008", { objectId: "SM-008", objectType: "structural-member" }],
      ["CN-001", { objectId: "CN-001", objectType: "connector" }],
      ["HW-001", { objectId: "HW-001", objectType: "hardware" }],
      ["FS-001", { objectId: "FS-001", objectType: "fastener" }],
    ]),
  };
}

describe("validateConnectorsHardware", () => {
  it("accepts fully resolved connector, hardware, and fastener objects", () => {
    const batch = validateConnectorsHardware({
      payload: buildCompletePayload(),
      ...buildRelatedMaps(),
    });

    assert.equal(batch.validationIssues.length, 0);
    assert.equal(batch.reviewItems.length, 0);
    assert.ok(batch.validationResults.length > 0);
    assert.ok(
      batch.validationResults.every((result) => result.outcome === "passed"),
    );
  });

  it("fails unresolved connector type", () => {
    const batch = validateConnectorsHardware({
      payload: buildCompletePayload({
        connectors: [
          buildCompleteConnector({
            connectorType: null,
            resolutionTraces: [],
          }),
        ],
      }),
      ...buildRelatedMaps(),
    });

    const issue = batch.validationIssues.find(
      (entry) =>
        entry.ruleId === CONNECTORS_HARDWARE_RULE_IDS.connectorTypeResolved,
    );

    assert.ok(issue);
    assert.equal(issue.severity, "critical");
    assert.equal(
      issue.quantityImpacts.find(
        (impact) =>
          impact.quantityKey ===
          CONNECTORS_HARDWARE_QUANTITY_KEYS.connectorMaterial,
      )?.canCalculate,
      false,
    );
  });

  it("fails unresolved hardware type", () => {
    const batch = validateConnectorsHardware({
      payload: buildCompletePayload({
        hardware: [
          buildCompleteHardware({
            hardwareType: null,
            resolutionTraces: [],
          }),
        ],
      }),
      ...buildRelatedMaps(),
    });

    const issue = batch.validationIssues.find(
      (entry) =>
        entry.ruleId === CONNECTORS_HARDWARE_RULE_IDS.hardwareTypeResolved,
    );

    assert.ok(issue);
    assert.equal(issue.severity, "critical");
    assert.equal(
      issue.quantityImpacts.find(
        (impact) =>
          impact.quantityKey ===
          CONNECTORS_HARDWARE_QUANTITY_KEYS.hardwareMaterial,
      )?.canCalculate,
      false,
    );
  });

  it("fails unresolved fastener type", () => {
    const batch = validateConnectorsHardware({
      payload: buildCompletePayload({
        fasteners: [
          buildCompleteFastener({
            fastenerType: null,
            resolutionTraces: [],
          }),
        ],
      }),
      ...buildRelatedMaps(),
    });

    const issue = batch.validationIssues.find(
      (entry) =>
        entry.ruleId === CONNECTORS_HARDWARE_RULE_IDS.fastenerTypeResolved,
    );

    assert.ok(issue);
    assert.equal(issue.severity, "critical");
    assert.equal(
      issue.quantityImpacts.find(
        (impact) =>
          impact.quantityKey ===
          CONNECTORS_HARDWARE_QUANTITY_KEYS.fastenerMaterial,
      )?.canCalculate,
      false,
    );
  });

  it("warns on dangling connector hardware references", () => {
    const batch = validateConnectorsHardware({
      payload: buildCompletePayload({
        connectors: [
          buildCompleteConnector({ hardwareIds: ["HW-MISSING"] }),
        ],
      }),
      ...buildRelatedMaps(),
    });

    const issue = batch.validationIssues.find(
      (entry) =>
        entry.ruleId ===
        CONNECTORS_HARDWARE_RULE_IDS.connectorHardwareResolved,
    );

    assert.ok(issue);
    assert.equal(issue.severity, "warning");
    assert.equal(issue.quantityImpacts[0]?.canCalculate, true);
  });

  it("warns on dangling connector fastener references", () => {
    const batch = validateConnectorsHardware({
      payload: buildCompletePayload({
        connectors: [
          buildCompleteConnector({ fastenerIds: ["FS-MISSING"] }),
        ],
      }),
      ...buildRelatedMaps(),
    });

    const issue = batch.validationIssues.find(
      (entry) =>
        entry.ruleId ===
        CONNECTORS_HARDWARE_RULE_IDS.connectorFastenersResolved,
    );

    assert.ok(issue);
    assert.equal(issue.severity, "warning");
    assert.equal(issue.quantityImpacts[0]?.canCalculate, true);
  });

  it("warns on dangling associated-object references", () => {
    const batch = validateConnectorsHardware({
      payload: buildCompletePayload({
        connectors: [
          buildCompleteConnector({ associatedObjectIds: ["SM-MISSING"] }),
        ],
      }),
      relatedObjectsById: buildRelatedMaps().relatedObjectsById,
    });

    const issue = batch.validationIssues.find(
      (entry) =>
        entry.ruleId ===
        CONNECTORS_HARDWARE_RULE_IDS.connectorAssociatedObjectsResolved,
    );

    assert.ok(issue);
    assert.equal(issue.severity, "warning");
    assert.equal(issue.quantityImpacts[0]?.canCalculate, true);
  });

  it("skips associated-object validation when related artifacts are not provided", () => {
    const batch = validateConnectorsHardware({
      payload: buildCompletePayload(),
    });

    const connectorResult = batch.validationResults.find(
      (entry) =>
        entry.ruleId ===
        CONNECTORS_HARDWARE_RULE_IDS.connectorAssociatedObjectsResolved,
    );
    const hardwareResult = batch.validationResults.find(
      (entry) =>
        entry.ruleId ===
        CONNECTORS_HARDWARE_RULE_IDS.hardwareAssociatedObjectsResolved,
    );
    const fastenerResult = batch.validationResults.find(
      (entry) =>
        entry.ruleId ===
        CONNECTORS_HARDWARE_RULE_IDS.fastenerAssociatedObjectsResolved,
    );

    assert.equal(connectorResult?.outcome, "skipped");
    assert.equal(hardwareResult?.outcome, "skipped");
    assert.equal(fastenerResult?.outcome, "passed");
  });

  it("resolves same-payload associated-object references without external artifacts", () => {
    const batch = validateConnectorsHardware({
      payload: buildCompletePayload({
        connectors: [
          buildCompleteConnector({ associatedObjectIds: ["HW-001"] }),
        ],
        hardware: [buildCompleteHardware({ associatedObjectIds: ["CN-001"] })],
        fasteners: [buildCompleteFastener({ associatedObjectIds: ["CN-001"] })],
      }),
    });

    const connectorResult = batch.validationResults.find(
      (entry) =>
        entry.ruleId ===
        CONNECTORS_HARDWARE_RULE_IDS.connectorAssociatedObjectsResolved,
    );
    const hardwareResult = batch.validationResults.find(
      (entry) =>
        entry.ruleId ===
        CONNECTORS_HARDWARE_RULE_IDS.hardwareAssociatedObjectsResolved,
    );
    const fastenerResult = batch.validationResults.find(
      (entry) =>
        entry.ruleId ===
        CONNECTORS_HARDWARE_RULE_IDS.fastenerAssociatedObjectsResolved,
    );
    const hardwareRefResult = batch.validationResults.find(
      (entry) =>
        entry.ruleId === CONNECTORS_HARDWARE_RULE_IDS.connectorHardwareResolved,
    );

    assert.equal(connectorResult?.outcome, "passed");
    assert.equal(hardwareResult?.outcome, "passed");
    assert.equal(fastenerResult?.outcome, "passed");
    assert.equal(hardwareRefResult?.outcome, "passed");
    assert.equal(batch.validationIssues.length, 0);
  });

  it("passes empty hardware, fastener, and associated-object references", () => {
    const batch = validateConnectorsHardware({
      payload: buildCompletePayload({
        connectors: [
          buildCompleteConnector({
            associatedObjectIds: [],
            hardwareIds: [],
            fastenerIds: [],
          }),
        ],
        hardware: [buildCompleteHardware({ associatedObjectIds: [] })],
        fasteners: [buildCompleteFastener({ associatedObjectIds: [] })],
      }),
    });

    const hardwareResult = batch.validationResults.find(
      (entry) =>
        entry.ruleId ===
        CONNECTORS_HARDWARE_RULE_IDS.connectorHardwareResolved,
    );
    const fastenerResult = batch.validationResults.find(
      (entry) =>
        entry.ruleId ===
        CONNECTORS_HARDWARE_RULE_IDS.connectorFastenersResolved,
    );
    const associatedResult = batch.validationResults.find(
      (entry) =>
        entry.ruleId ===
        CONNECTORS_HARDWARE_RULE_IDS.connectorAssociatedObjectsResolved,
    );

    assert.equal(hardwareResult?.outcome, "passed");
    assert.equal(fastenerResult?.outcome, "passed");
    assert.equal(associatedResult?.outcome, "passed");
  });

  it("produces deterministic IDs and output across identical reruns", () => {
    const batchInput = {
      payload: buildCompletePayload({
        connectors: [
          buildCompleteConnector({
            connectorType: null,
            resolutionTraces: [],
          }),
        ],
      }),
    };

    const first = validateConnectorsHardware(batchInput);
    const second = validateConnectorsHardware(batchInput);

    assert.deepEqual(first, second);
    const typeIssue = first.validationIssues.find(
      (entry) =>
        entry.ruleId === CONNECTORS_HARDWARE_RULE_IDS.connectorTypeResolved,
    );

    assert.equal(
      typeIssue?.id,
      "VI-connector-type-resolved-object-CN-001",
    );
  });

  it("parses generated issues, results, and review items through core schemas", () => {
    const batch = validateConnectorsHardware({
      payload: buildCompletePayload({
        connectors: [
          buildCompleteConnector({
            connectorType: null,
            associatedObjectIds: ["SM-MISSING"],
            hardwareIds: ["HW-MISSING"],
            fastenerIds: ["FS-MISSING"],
            resolutionTraces: [],
          }),
        ],
        hardware: [
          buildCompleteHardware({
            hardwareType: null,
            associatedObjectIds: ["SM-MISSING"],
            resolutionTraces: [],
          }),
        ],
        fasteners: [
          buildCompleteFastener({
            fastenerType: null,
            associatedObjectIds: ["CN-MISSING"],
            resolutionTraces: [],
          }),
        ],
      }),
      ...buildRelatedMaps(),
    });

    for (const issue of batch.validationIssues) {
      validationIssueSchema.parse(issue);
    }
    for (const result of batch.validationResults) {
      validationResultSchema.parse(result);
    }
    for (const item of batch.reviewItems) {
      reviewItemSchema.parse(item);
    }
  });
});
