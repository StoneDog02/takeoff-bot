import type { ObjectId } from "../../../core/schemas/identity.schema.js";
import type {
  FloorFramingArea,
  FloorFramingSystem,
} from "../schemas/floor-framing.schema.js";
import type { FloorFramingPayload } from "../schemas/framing-artifacts.schema.js";
import {
  buildFailedBatch,
  buildPassedBatch,
  buildSkippedBatch,
  collectEvidenceIds,
  toReviewQuantityImpacts,
} from "./buildValidationBatch.js";
import { createObjectTarget } from "./ids.js";
import { isPropertyResolved } from "./isPropertyResolved.js";
import { mergeValidationBatches } from "./mergeValidationBatch.js";
import {
  FLOOR_FRAMING_RULE_IDS,
  FLOOR_QUANTITY_KEYS,
} from "./rule-ids.js";
import type { RelatedObjectRef, ValidationBatch } from "./types.js";

export type FloorFramingValidationInput = {
  payload: FloorFramingPayload;
  boundingWallsById?: ReadonlyMap<ObjectId, RelatedObjectRef>;
  openingsById?: ReadonlyMap<ObjectId, RelatedObjectRef>;
  structuralMembersById?: ReadonlyMap<ObjectId, RelatedObjectRef>;
};

function isJoistTypeResolved(system: FloorFramingSystem): boolean {
  return (
    system.assembly.joistType !== null ||
    isPropertyResolved(system.resolutionTraces, "assembly.joistType")
  );
}

function isJoistSizeResolved(system: FloorFramingSystem): boolean {
  return (
    system.assembly.joistSize !== null ||
    isPropertyResolved(system.resolutionTraces, "assembly.joistSize")
  );
}

function isJoistSpacingResolved(system: FloorFramingSystem): boolean {
  return (
    system.assembly.joistSpacingInches !== null ||
    isPropertyResolved(system.resolutionTraces, "assembly.joistSpacingInches")
  );
}

function isSpanDirectionResolved(area: FloorFramingArea): boolean {
  return (
    area.spanDirection !== null ||
    isPropertyResolved(area.resolutionTraces, "spanDirection")
  );
}

function isAreaSquareFeetResolved(area: FloorFramingArea): boolean {
  return (
    area.areaSquareFeet !== null ||
    isPropertyResolved(area.resolutionTraces, "areaSquareFeet")
  );
}

function validateAreaParentSystemResolved(
  area: FloorFramingArea,
  systemsById: ReadonlyMap<ObjectId, FloorFramingSystem>,
): ValidationBatch {
  const target = createObjectTarget(area.id, area.objectType);
  const ruleId = FLOOR_FRAMING_RULE_IDS.areaParentSystemResolved;
  const evidenceIds = collectEvidenceIds(area);

  if (systemsById.has(area.parentSystemId)) {
    return buildPassedBatch(
      ruleId,
      "relationship",
      target,
      `Floor area ${area.id} references an existing parent system.`,
      evidenceIds,
    );
  }

  const quantityImpacts = [
    {
      quantityKey: FLOOR_QUANTITY_KEYS.joists,
      description: "Floor joist takeoff requires a valid parent system.",
      canCalculate: false,
    },
  ];

  const explanation = `Floor area ${area.id} references missing parent system ${area.parentSystemId}.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "relationship",
      severity: "critical",
      ruleViolated: "Floor area parent system must reference an existing system.",
      explanation,
      target,
      recommendedUserAction:
        "Confirm the floor framing system that owns this area.",
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Resolve parent system for floor area ${area.id}`,
      description: explanation,
      action: {
        type: "provide-value",
        instruction: "Identify the parent floor framing system for this area.",
        targetProperty: "parentSystemId",
      },
      reviewStatus: "review-required",
      blockingStatus: "blocked",
      affectedObjects: [{ objectId: area.id, objectType: area.objectType }],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds,
    },
  );
}

function validateSystemAreasConsistent(
  system: FloorFramingSystem,
  areasById: ReadonlyMap<ObjectId, FloorFramingArea>,
): ValidationBatch {
  const target = createObjectTarget(system.id, system.objectType);
  const ruleId = FLOOR_FRAMING_RULE_IDS.systemAreasConsistent;
  const evidenceIds = collectEvidenceIds(system);
  const problems: string[] = [];

  for (const areaId of system.areaIds) {
    const area = areasById.get(areaId);
    if (!area) {
      problems.push(
        `Floor system ${system.id} references missing area ${areaId}.`,
      );
      continue;
    }

    if (area.parentSystemId !== system.id) {
      problems.push(
        `Area ${area.id} is listed on system ${system.id} but references parent ${area.parentSystemId}.`,
      );
    }
  }

  for (const area of areasById.values()) {
    if (
      area.parentSystemId === system.id &&
      !system.areaIds.includes(area.id)
    ) {
      problems.push(
        `Area ${area.id} references system ${system.id} but is not listed on the system.`,
      );
    }
  }

  if (problems.length === 0) {
    return buildPassedBatch(
      ruleId,
      "relationship",
      target,
      `Floor system ${system.id} area relationships are consistent.`,
      evidenceIds,
    );
  }

  const quantityImpacts = [
    {
      quantityKey: FLOOR_QUANTITY_KEYS.joists,
      description: "Inconsistent floor areas prevent reliable joist takeoff.",
      canCalculate: false,
    },
  ];

  const explanation = problems.join(" ");

  return buildFailedBatch(
    {
      ruleId,
      level: "relationship",
      severity: "critical",
      ruleViolated: "Floor system and area relationships must be consistent.",
      explanation,
      target,
      recommendedUserAction:
        "Reconcile floor system area IDs and parent system references.",
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Reconcile areas for floor system ${system.id}`,
      description: explanation,
      action: {
        type: "provide-value",
        instruction:
          "Confirm which areas belong to this floor framing system.",
        targetProperty: "areaIds",
      },
      reviewStatus: "review-required",
      blockingStatus: "blocked",
      affectedObjects: [{ objectId: system.id, objectType: system.objectType }],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds,
    },
  );
}

function validateJoistTypeResolved(system: FloorFramingSystem): ValidationBatch {
  const target = createObjectTarget(system.id, system.objectType);
  const ruleId = FLOOR_FRAMING_RULE_IDS.joistTypeResolved;
  const evidenceIds = collectEvidenceIds(system);

  if (isJoistTypeResolved(system)) {
    return buildPassedBatch(
      ruleId,
      "object",
      target,
      `Floor system ${system.id} has a resolved joist type.`,
      evidenceIds,
    );
  }

  const quantityImpacts = [
    {
      quantityKey: FLOOR_QUANTITY_KEYS.joists,
      description: "Floor joist takeoff requires a resolved joist type.",
      canCalculate: false,
    },
  ];

  const explanation = `Floor system ${system.id} is missing joist type.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "object",
      severity: "critical",
      ruleViolated: "Floor framing joist type must be resolved.",
      explanation,
      target,
      recommendedUserAction:
        "Confirm joist type from floor framing plans or schedules.",
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Resolve joist type for floor system ${system.id}`,
      description: explanation,
      action: {
        type: "provide-value",
        instruction: "Provide the joist type for this floor framing system.",
        targetProperty: "assembly.joistType",
      },
      reviewStatus: "review-required",
      blockingStatus: "blocked",
      affectedObjects: [{ objectId: system.id, objectType: system.objectType }],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds,
    },
  );
}

function validateJoistSizeResolved(system: FloorFramingSystem): ValidationBatch {
  const target = createObjectTarget(system.id, system.objectType);
  const ruleId = FLOOR_FRAMING_RULE_IDS.joistSizeResolved;
  const evidenceIds = collectEvidenceIds(system);

  if (isJoistSizeResolved(system)) {
    return buildPassedBatch(
      ruleId,
      "object",
      target,
      `Floor system ${system.id} has a resolved joist size.`,
      evidenceIds,
    );
  }

  const quantityImpacts = [
    {
      quantityKey: FLOOR_QUANTITY_KEYS.joists,
      description: "Floor joist takeoff requires a resolved joist size.",
      canCalculate: false,
    },
  ];

  const explanation = `Floor system ${system.id} is missing joist size.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "object",
      severity: "critical",
      ruleViolated: "Floor framing joist size must be resolved.",
      explanation,
      target,
      recommendedUserAction:
        "Confirm joist size from floor framing plans or schedules.",
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Resolve joist size for floor system ${system.id}`,
      description: explanation,
      action: {
        type: "provide-value",
        instruction: "Provide the joist size for this floor framing system.",
        targetProperty: "assembly.joistSize",
      },
      reviewStatus: "review-required",
      blockingStatus: "blocked",
      affectedObjects: [{ objectId: system.id, objectType: system.objectType }],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds,
    },
  );
}

function validateJoistSpacingResolved(
  system: FloorFramingSystem,
): ValidationBatch {
  const target = createObjectTarget(system.id, system.objectType);
  const ruleId = FLOOR_FRAMING_RULE_IDS.joistSpacingResolved;
  const evidenceIds = collectEvidenceIds(system);

  if (isJoistSpacingResolved(system)) {
    return buildPassedBatch(
      ruleId,
      "object",
      target,
      `Floor system ${system.id} has resolved joist spacing.`,
      evidenceIds,
    );
  }

  const quantityImpacts = [
    {
      quantityKey: FLOOR_QUANTITY_KEYS.joists,
      description: "Floor joist takeoff requires resolved joist spacing.",
      canCalculate: false,
    },
  ];

  const explanation = `Floor system ${system.id} is missing joist spacing.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "object",
      severity: "critical",
      ruleViolated: "Floor framing joist spacing must be resolved.",
      explanation,
      target,
      recommendedUserAction:
        "Confirm joist spacing from floor framing plans or schedules.",
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Resolve joist spacing for floor system ${system.id}`,
      description: explanation,
      action: {
        type: "provide-value",
        instruction: "Provide joist spacing in inches for this floor system.",
        targetProperty: "assembly.joistSpacingInches",
      },
      reviewStatus: "review-required",
      blockingStatus: "blocked",
      affectedObjects: [{ objectId: system.id, objectType: system.objectType }],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds,
    },
  );
}

function validateSpanDirectionResolved(area: FloorFramingArea): ValidationBatch {
  const target = createObjectTarget(area.id, area.objectType);
  const ruleId = FLOOR_FRAMING_RULE_IDS.spanDirectionResolved;
  const evidenceIds = collectEvidenceIds(area);

  if (isSpanDirectionResolved(area)) {
    return buildPassedBatch(
      ruleId,
      "object",
      target,
      `Floor area ${area.id} has a resolved span direction.`,
      evidenceIds,
    );
  }

  const quantityImpacts = [
    {
      quantityKey: FLOOR_QUANTITY_KEYS.joists,
      description: "Floor joist layout requires a resolved span direction.",
      canCalculate: false,
    },
  ];

  const explanation = `Floor area ${area.id} is missing span direction.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "object",
      severity: "critical",
      ruleViolated: "Floor area span direction must be resolved.",
      explanation,
      target,
      recommendedUserAction:
        "Confirm span direction from floor framing plans or details.",
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Resolve span direction for floor area ${area.id}`,
      description: explanation,
      action: {
        type: "provide-value",
        instruction: "Provide the span direction for this floor area.",
        targetProperty: "spanDirection",
      },
      reviewStatus: "review-required",
      blockingStatus: "blocked",
      affectedObjects: [{ objectId: area.id, objectType: area.objectType }],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds,
    },
  );
}

function validateAreaSquareFeetResolved(area: FloorFramingArea): ValidationBatch {
  const target = createObjectTarget(area.id, area.objectType);
  const ruleId = FLOOR_FRAMING_RULE_IDS.areaSquareFeetResolved;
  const evidenceIds = collectEvidenceIds(area);

  if (isAreaSquareFeetResolved(area)) {
    return buildPassedBatch(
      ruleId,
      "object",
      target,
      `Floor area ${area.id} has resolved area square footage.`,
      evidenceIds,
    );
  }

  const quantityImpacts = [
    {
      quantityKey: FLOOR_QUANTITY_KEYS.joists,
      description: "Floor joist quantities require resolved area square footage.",
      canCalculate: false,
    },
  ];

  const explanation = `Floor area ${area.id} is missing area square footage.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "object",
      severity: "critical",
      ruleViolated: "Floor area square footage must be resolved.",
      explanation,
      target,
      recommendedUserAction:
        "Confirm floor area square footage from plans or schedules.",
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Resolve area square footage for floor area ${area.id}`,
      description: explanation,
      action: {
        type: "provide-value",
        instruction: "Provide the floor area in square feet.",
        targetProperty: "areaSquareFeet",
      },
      reviewStatus: "review-required",
      blockingStatus: "blocked",
      affectedObjects: [{ objectId: area.id, objectType: area.objectType }],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds,
    },
  );
}

function validateReferenceIds(
  area: FloorFramingArea,
  ruleId: string,
  referenceIds: ObjectId[],
  objectsById: ReadonlyMap<ObjectId, RelatedObjectRef> | undefined,
  options: {
    skipExplanation: string;
    emptyExplanation: string;
    passExplanation: string;
    relationshipLabel: string;
    severity: "critical" | "warning";
    quantityImpacts: Array<{
      quantityKey: string;
      description: string;
      canCalculate: boolean;
    }>;
    reviewStatus: "review-required" | "review-recommended";
    blockingStatus: "blocked" | "not-blocked";
    targetProperty: string;
    actionInstruction: string;
  },
): ValidationBatch {
  const target = createObjectTarget(area.id, area.objectType);
  const evidenceIds = collectEvidenceIds(area);

  if (referenceIds.length === 0) {
    return buildPassedBatch(
      ruleId,
      "relationship",
      target,
      options.emptyExplanation,
      evidenceIds,
    );
  }

  if (objectsById === undefined) {
    return buildSkippedBatch(
      ruleId,
      "relationship",
      target,
      options.skipExplanation,
      evidenceIds,
    );
  }

  const missingIds = referenceIds.filter((id) => !objectsById.has(id));

  if (missingIds.length === 0) {
    return buildPassedBatch(
      ruleId,
      "relationship",
      target,
      options.passExplanation,
      evidenceIds,
    );
  }

  const explanation = `Floor area ${area.id} references missing ${options.relationshipLabel}: ${missingIds.join(", ")}.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "relationship",
      severity: options.severity,
      ruleViolated: `Floor area ${options.relationshipLabel} must reference existing objects.`,
      explanation,
      target,
      recommendedUserAction: options.actionInstruction,
      evidenceIds,
      quantityImpacts: options.quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Resolve ${options.relationshipLabel} for floor area ${area.id}`,
      description: explanation,
      action: {
        type: "provide-value",
        instruction: options.actionInstruction,
        targetProperty: options.targetProperty,
      },
      reviewStatus: options.reviewStatus,
      blockingStatus: options.blockingStatus,
      affectedObjects: [{ objectId: area.id, objectType: area.objectType }],
      quantityImpacts: toReviewQuantityImpacts(options.quantityImpacts),
      evidenceIds,
    },
  );
}

function validateBoundingWallsResolved(
  area: FloorFramingArea,
  relatedObjectsById: ReadonlyMap<ObjectId, RelatedObjectRef> | undefined,
): ValidationBatch {
  return validateReferenceIds(
    area,
    FLOOR_FRAMING_RULE_IDS.boundingWallsResolved,
    area.boundingWallIds,
    relatedObjectsById,
    {
      skipExplanation:
        "Bounding wall validation was skipped because no wall artifacts were provided.",
      emptyExplanation: `Floor area ${area.id} has no bounding wall references to validate.`,
      passExplanation: `Floor area ${area.id} references existing bounding walls.`,
      relationshipLabel: "bounding walls",
      severity: "warning",
      quantityImpacts: [
        {
          quantityKey: FLOOR_QUANTITY_KEYS.joists,
          description:
            "Floor joist takeoff may still proceed from explicit area geometry.",
          canCalculate: true,
        },
      ],
      reviewStatus: "review-recommended",
      blockingStatus: "not-blocked",
      targetProperty: "boundingWallIds",
      actionInstruction:
        "Confirm the walls that bound this floor framing area.",
    },
  );
}

function validateOpeningReferencesResolved(
  area: FloorFramingArea,
  relatedObjectsById: ReadonlyMap<ObjectId, RelatedObjectRef> | undefined,
): ValidationBatch {
  return validateReferenceIds(
    area,
    FLOOR_FRAMING_RULE_IDS.openingReferencesResolved,
    area.openingIds,
    relatedObjectsById,
    {
      skipExplanation:
        "Opening reference validation was skipped because no opening artifacts were provided.",
      emptyExplanation: `Floor area ${area.id} has no opening references to validate.`,
      passExplanation: `Floor area ${area.id} references existing openings.`,
      relationshipLabel: "openings",
      severity: "warning",
      quantityImpacts: [
        {
          quantityKey: FLOOR_QUANTITY_KEYS.joists,
          description:
            "Floor joist takeoff may still proceed without opening association resolution.",
          canCalculate: true,
        },
      ],
      reviewStatus: "review-recommended",
      blockingStatus: "not-blocked",
      targetProperty: "openingIds",
      actionInstruction: "Confirm the openings associated with this floor area.",
    },
  );
}

function validateStructuralMemberReferencesResolved(
  area: FloorFramingArea,
  relatedObjectsById: ReadonlyMap<ObjectId, RelatedObjectRef> | undefined,
): ValidationBatch {
  return validateReferenceIds(
    area,
    FLOOR_FRAMING_RULE_IDS.structuralMemberReferencesResolved,
    area.structuralMemberIds,
    relatedObjectsById,
    {
      skipExplanation:
        "Structural member validation was skipped because no structural member artifacts were provided.",
      emptyExplanation: `Floor area ${area.id} has no structural member references to validate.`,
      passExplanation: `Floor area ${area.id} references existing structural members.`,
      relationshipLabel: "structural members",
      severity: "warning",
      quantityImpacts: [
        {
          quantityKey: FLOOR_QUANTITY_KEYS.joists,
          description:
            "Floor joist takeoff may still proceed without member association resolution.",
          canCalculate: true,
        },
      ],
      reviewStatus: "review-recommended",
      blockingStatus: "not-blocked",
      targetProperty: "structuralMemberIds",
      actionInstruction:
        "Confirm the structural members associated with this floor area.",
    },
  );
}

export function validateFloorFraming(
  input: FloorFramingValidationInput,
): ValidationBatch {
  const systemsById = new Map(
    input.payload.systems.map((system) => [system.id, system]),
  );
  const areasById = new Map(
    input.payload.areas.map((area) => [area.id, area]),
  );

  const batches: ValidationBatch[] = [];

  for (const system of input.payload.systems) {
    batches.push(validateSystemAreasConsistent(system, areasById));
    batches.push(validateJoistTypeResolved(system));
    batches.push(validateJoistSizeResolved(system));
    batches.push(validateJoistSpacingResolved(system));
  }

  for (const area of input.payload.areas) {
    batches.push(validateAreaParentSystemResolved(area, systemsById));
    batches.push(validateSpanDirectionResolved(area));
    batches.push(validateAreaSquareFeetResolved(area));
    batches.push(
      validateBoundingWallsResolved(area, input.boundingWallsById),
    );
    batches.push(validateOpeningReferencesResolved(area, input.openingsById));
    batches.push(
      validateStructuralMemberReferencesResolved(
        area,
        input.structuralMembersById,
      ),
    );
  }

  return mergeValidationBatches(...batches);
}
