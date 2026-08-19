import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { coordinateFramingCalculations } from "../../src/scopes/framing/calculators/calculation-coordinator.js";
import {
  framingCalculationsPayloadSchema,
  type ConnectorsHardwarePayload,
  type SheathingPayload,
  type StructuralMembersPayload,
  type ValidationPayload,
  type WallFramingPayload,
} from "../../src/scopes/framing/schemas/framing-artifacts.schema.js";
import { createValidationIssue } from "../../src/scopes/framing/validators/createValidationIssue.js";
import { createObjectTarget } from "../../src/scopes/framing/validators/ids.js";
import {
  CONNECTORS_HARDWARE_QUANTITY_KEYS,
  SHEATHING_QUANTITY_KEYS,
  STRUCTURAL_MEMBER_QUANTITY_KEYS,
  WALL_QUANTITY_KEYS,
} from "../../src/scopes/framing/validators/rule-ids.js";

const complete = {
  status: "complete",
  percentage: 100,
  completedItems: 1,
  totalItems: 1,
} as const;

function resolvedTrace(propertyPath: string) {
  return {
    propertyPath,
    method: "explicit-project-value" as const,
    explanation: `${propertyPath} is explicit.`,
    evidenceIds: ["E-001"],
    assumptionIds: [] as string[],
    validationIssueIds: [] as string[],
    reviewItemIds: [] as string[],
  };
}

function buildWallFraming(): WallFramingPayload {
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
          resolvedTrace("assembly.studSpacingInches"),
          resolvedTrace("assembly.studSize"),
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
        assumptionIds: [],
        validationIssueIds: [],
        reviewItemIds: [],
        resolutionTraces: [resolvedTrace("lengthFeet")],
        parentWallId: "W-001",
        lengthFeet: 20,
        openingIds: [],
      },
    ],
  };
}

function buildStructuralMembers(): StructuralMembersPayload {
  return {
    structuralMembers: [
      {
        id: "SM-008",
        objectType: "structural-member",
        completion: complete,
        reviewStatus: "no-review-required",
        blockingStatus: "not-blocked",
        evidenceIds: ["E-008"],
        assumptionIds: ["A-MEMBER"],
        validationIssueIds: [],
        reviewItemIds: ["RI-MEMBER"],
        resolutionTraces: [
          resolvedTrace("materialType"),
          resolvedTrace("size"),
          resolvedTrace("lengthFeet"),
          resolvedTrace("quantity"),
        ],
        category: "header",
        materialType: "lvl",
        size: "1.75x11.875",
        plyCount: null,
        lengthFeet: 6,
        quantity: 1,
        location: "W-001 window header",
        associatedObjectIds: [],
        supportedObjectIds: [],
        supportingObjectIds: [],
        connectorIds: [],
      },
    ],
  };
}

function buildSheathing(): SheathingPayload {
  return {
    systems: [
      {
        id: "SHS-001",
        objectType: "sheathing-system",
        completion: complete,
        reviewStatus: "no-review-required",
        blockingStatus: "not-blocked",
        evidenceIds: ["E-SHS-001"],
        assumptionIds: [],
        validationIssueIds: [],
        reviewItemIds: [],
        resolutionTraces: [
          resolvedTrace("application"),
          resolvedTrace("panelSpecification.panelType"),
          resolvedTrace("panelSpecification.thickness"),
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
          specificationReference: null,
        },
        areaIds: ["SHA-001", "SHA-002"],
      },
    ],
    areas: [
      {
        id: "SHA-001",
        objectType: "sheathing-area",
        completion: complete,
        reviewStatus: "no-review-required",
        blockingStatus: "not-blocked",
        evidenceIds: ["E-SHA-001"],
        assumptionIds: [],
        validationIssueIds: [],
        reviewItemIds: [],
        resolutionTraces: [resolvedTrace("areaSquareFeet")],
        parentSystemId: "SHS-001",
        layout: null,
        areaSquareFeet: 320,
        coveredObjectIds: [],
        openingIds: [],
      },
      {
        id: "SHA-002",
        objectType: "sheathing-area",
        completion: complete,
        reviewStatus: "no-review-required",
        blockingStatus: "not-blocked",
        evidenceIds: ["E-SHA-002"],
        assumptionIds: [],
        validationIssueIds: [],
        reviewItemIds: [],
        resolutionTraces: [resolvedTrace("areaSquareFeet")],
        parentSystemId: "SHS-001",
        layout: null,
        areaSquareFeet: 80,
        coveredObjectIds: [],
        openingIds: [],
      },
    ],
  };
}

function buildConnectorsHardware(
  overrides: Partial<ConnectorsHardwarePayload> = {},
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
        fastenerIds: ["FS-001"],
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
    fasteners: [
      {
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
          resolvedTrace("quantity"),
        ],
        fastenerType: "nail",
        diameter: null,
        length: null,
        coating: null,
        quantity: 40,
        associatedObjectIds: ["CN-001"],
      },
    ],
    ...overrides,
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

function unitsOf(payload: ReturnType<typeof coordinateFramingCalculations>) {
  return payload.materials.map((item) => item.unit);
}

describe("coordinateFramingCalculations", () => {
  it("returns wall lines when only Wall Framing is supplied", () => {
    const payload = coordinateFramingCalculations({
      wallFraming: buildWallFraming(),
    });

    assert.deepEqual(unitsOf(payload), ["each", "linear-foot"]);
    assert.equal(payload.materials[0]?.quantity, 16);
    assert.equal(payload.materials[1]?.quantity, 60);
  });

  it("returns member lines when only Structural Members are supplied", () => {
    const payload = coordinateFramingCalculations({
      structuralMembers: buildStructuralMembers(),
    });

    assert.equal(payload.materials.length, 1);
    assert.equal(payload.materials[0]?.unit, "linear-foot");
    assert.equal(payload.materials[0]?.quantity, 6);
  });

  it("returns sheathing lines when only Sheathing is supplied", () => {
    const payload = coordinateFramingCalculations({
      sheathing: buildSheathing(),
    });

    assert.equal(payload.materials.length, 2);
    assert.deepEqual(
      payload.materials.map((item) => item.quantity),
      [320, 80],
    );
  });

  it("concatenates wall, member, and sheathing lines in stable subsystem order", () => {
    const payload = coordinateFramingCalculations({
      wallFraming: buildWallFraming(),
      structuralMembers: buildStructuralMembers(),
      sheathing: buildSheathing(),
    });

    assert.deepEqual(unitsOf(payload), [
      "each",
      "linear-foot",
      "linear-foot",
      "square-foot",
      "square-foot",
    ]);
    assert.deepEqual(
      payload.materials.map((item) => item.quantity),
      [16, 60, 6, 320, 80],
    );
  });

  it("omits missing subsystems without failing", () => {
    const payload = coordinateFramingCalculations({
      wallFraming: buildWallFraming(),
      sheathing: buildSheathing(),
    });

    assert.equal(
      payload.materials.some((item) => item.id.includes("SM-008")),
      false,
    );
    assert.equal(payload.materials.length, 4);
  });

  it("returns a valid empty payload when no calculable subsystems are supplied", () => {
    const payload = coordinateFramingCalculations({});

    assert.deepEqual(payload.materials, []);
    assert.deepEqual(framingCalculationsPayloadSchema.parse(payload), payload);
  });

  it("suppresses a wall quantity without suppressing members or sheathing", () => {
    const wallFraming = buildWallFraming();
    const validation = emptyValidation([
      createValidationIssue({
        ruleId: "wall.geometry.length.resolved",
        level: "calculation",
        severity: "blocking",
        ruleViolated: "Stud quantity cannot be calculated.",
        explanation: "Validation blocked wall studs only.",
        target: createObjectTarget("W-001", "building-wall"),
        quantityImpacts: [
          {
            quantityKey: WALL_QUANTITY_KEYS.studs,
            description: "Studs cannot be calculated.",
            canCalculate: false,
          },
        ],
      }),
    ]);
    const payload = coordinateFramingCalculations({
      wallFraming,
      structuralMembers: buildStructuralMembers(),
      sheathing: buildSheathing(),
      validation,
    });

    assert.equal(
      payload.materials.some((item) => item.unit === "each"),
      false,
    );
    assert.equal(
      payload.materials.some((item) => item.quantity === 60),
      true,
    );
    assert.equal(
      payload.materials.some((item) => item.id.includes("SM-008")),
      true,
    );
    assert.equal(
      payload.materials.filter((item) => item.unit === "square-foot").length,
      2,
    );
  });

  it("suppresses a member quantity without suppressing wall or sheathing", () => {
    const members = buildStructuralMembers();
    const validation = emptyValidation([
      createValidationIssue({
        ruleId: "member.length.resolved",
        level: "object",
        severity: "critical",
        ruleViolated: "Member length cannot be calculated.",
        explanation: "Validation blocked member length.",
        target: createObjectTarget("SM-008", "structural-member"),
        quantityImpacts: [
          {
            quantityKey: STRUCTURAL_MEMBER_QUANTITY_KEYS.length,
            description: "Member length cannot be calculated.",
            canCalculate: false,
          },
        ],
      }),
    ]);
    const payload = coordinateFramingCalculations({
      wallFraming: buildWallFraming(),
      structuralMembers: members,
      sheathing: buildSheathing(),
      validation,
    });

    assert.equal(
      payload.materials.some((item) => item.id.includes("SM-008")),
      false,
    );
    assert.equal(payload.materials[0]?.quantity, 16);
    assert.equal(
      payload.materials.filter((item) => item.unit === "square-foot").length,
      2,
    );
  });

  it("suppresses sheathing without suppressing wall or members", () => {
    const sheathing = buildSheathing();
    const validation = emptyValidation([
      createValidationIssue({
        ruleId: "sheathing.system.panelType.resolved",
        level: "object",
        severity: "critical",
        ruleViolated: "Panel type cannot be calculated.",
        explanation: "Validation blocked sheathing material.",
        target: createObjectTarget("SHS-001", "sheathing-system"),
        quantityImpacts: [
          {
            quantityKey: SHEATHING_QUANTITY_KEYS.material,
            description: "Sheathing material cannot be calculated.",
            canCalculate: false,
          },
        ],
      }),
    ]);
    const payload = coordinateFramingCalculations({
      wallFraming: buildWallFraming(),
      structuralMembers: buildStructuralMembers(),
      sheathing,
      validation,
    });

    assert.equal(
      payload.materials.some((item) => item.unit === "square-foot"),
      false,
    );
    assert.equal(payload.materials.length, 3);
  });

  it("preserves calculator provenance through coordination", () => {
    const payload = coordinateFramingCalculations({
      wallFraming: buildWallFraming(),
      structuralMembers: buildStructuralMembers(),
    });
    const studs = payload.materials[0];
    const member = payload.materials[2];

    assert.deepEqual(studs?.sourceObjectIds, ["W-001", "WS-001"]);
    assert.ok(studs?.assumptionIds.includes("A-WALL"));
    assert.ok(studs?.reviewItemIds.includes("RI-WALL"));
    assert.deepEqual(member?.sourceObjectIds, ["SM-008"]);
    assert.deepEqual(member?.assumptionIds, ["A-MEMBER"]);
    assert.deepEqual(member?.reviewItemIds, ["RI-MEMBER"]);
  });

  it("does not silently merge similar sheathing line items", () => {
    const payload = coordinateFramingCalculations({
      sheathing: buildSheathing(),
    });

    assert.equal(payload.materials.length, 2);
    assert.equal(
      payload.materials[0]?.canonicalClassification,
      payload.materials[1]?.canonicalClassification,
    );
    assert.equal(payload.materials[0]?.quantity, 320);
    assert.equal(payload.materials[1]?.quantity, 80);
  });

  it("is deterministic across reruns", () => {
    const input = {
      wallFraming: buildWallFraming(),
      structuralMembers: buildStructuralMembers(),
      sheathing: buildSheathing(),
    };

    assert.deepEqual(
      coordinateFramingCalculations(input),
      coordinateFramingCalculations(input),
    );
  });

  it("parses through FramingCalculationsPayload", () => {
    const payload = coordinateFramingCalculations({
      wallFraming: buildWallFraming(),
      structuralMembers: buildStructuralMembers(),
      sheathing: buildSheathing(),
    });

    assert.deepEqual(
      framingCalculationsPayloadSchema.parse(payload),
      payload,
    );
  });

  it("returns fastener lines when only Connectors & Hardware is supplied", () => {
    const payload = coordinateFramingCalculations({
      connectorsHardware: buildConnectorsHardware(),
    });

    assert.equal(payload.materials.length, 1);
    assert.equal(payload.materials[0]?.quantity, 40);
    assert.equal(payload.materials[0]?.unit, "each");
    assert.equal(payload.materials[0]?.category, "fastener");
  });

  it("concatenates wall, member, sheathing, and fastener lines in stable order", () => {
    const payload = coordinateFramingCalculations({
      wallFraming: buildWallFraming(),
      structuralMembers: buildStructuralMembers(),
      sheathing: buildSheathing(),
      connectorsHardware: buildConnectorsHardware(),
    });

    assert.deepEqual(
      payload.materials.map((item) => item.quantity),
      [16, 60, 6, 320, 80, 40],
    );
    assert.equal(payload.materials[5]?.category, "fastener");
  });

  it("produces no fastener line when specified quantity is null", () => {
    const payload = coordinateFramingCalculations({
      connectorsHardware: buildConnectorsHardware({
        fasteners: [
          {
            ...buildConnectorsHardware().fasteners[0]!,
            quantity: null,
          },
        ],
      }),
    });

    assert.equal(payload.materials.length, 0);
  });

  it("does not emit Connector or Hardware quantities", () => {
    const payload = coordinateFramingCalculations({
      connectorsHardware: buildConnectorsHardware({ fasteners: [] }),
    });

    assert.equal(payload.materials.length, 0);
  });

  it("suppresses a fastener quantity without suppressing wall, members, or sheathing", () => {
    const validation = emptyValidation([
      createValidationIssue({
        ruleId: "fastener.type.resolved",
        level: "object",
        severity: "critical",
        ruleViolated: "Fastener type must be resolved.",
        explanation: "Validation blocked fastener material.",
        target: createObjectTarget("FS-001", "fastener"),
        quantityImpacts: [
          {
            quantityKey: CONNECTORS_HARDWARE_QUANTITY_KEYS.fastenerMaterial,
            description: "Fastener material cannot be calculated.",
            canCalculate: false,
          },
        ],
      }),
    ]);
    const payload = coordinateFramingCalculations({
      wallFraming: buildWallFraming(),
      structuralMembers: buildStructuralMembers(),
      sheathing: buildSheathing(),
      connectorsHardware: buildConnectorsHardware(),
      validation,
    });

    assert.equal(
      payload.materials.some((item) => item.id.includes("FS-001")),
      false,
    );
    assert.equal(payload.materials[0]?.quantity, 16);
    assert.equal(
      payload.materials.some((item) => item.id.includes("SM-008")),
      true,
    );
    assert.equal(
      payload.materials.filter((item) => item.unit === "square-foot").length,
      2,
    );
  });

  it("does not merge similar fastener line items", () => {
    const first = buildConnectorsHardware().fasteners[0]!;
    const payload = coordinateFramingCalculations({
      connectorsHardware: buildConnectorsHardware({
        fasteners: [
          first,
          {
            ...first,
            id: "FS-002",
            quantity: 12,
          },
        ],
      }),
    });

    assert.equal(payload.materials.length, 2);
    assert.equal(
      payload.materials[0]?.canonicalClassification,
      payload.materials[1]?.canonicalClassification,
    );
    assert.deepEqual(
      payload.materials.map((item) => item.quantity),
      [40, 12],
    );
  });

  it("is deterministic across reruns when fasteners are included", () => {
    const input = {
      wallFraming: buildWallFraming(),
      structuralMembers: buildStructuralMembers(),
      sheathing: buildSheathing(),
      connectorsHardware: buildConnectorsHardware(),
    };

    assert.deepEqual(
      coordinateFramingCalculations(input),
      coordinateFramingCalculations(input),
    );
  });
});
