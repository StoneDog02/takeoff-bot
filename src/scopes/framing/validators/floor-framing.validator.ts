import type { ObjectId } from "../../../core/schemas/identity.schema.js";
import type {
  FloorFramingArea,
  FloorFramingSystem,
} from "../schemas/floor-framing.schema.js";
import type { FloorFramingPayload } from "../schemas/framing-artifacts.schema.js";
import { isSimpleAreaJoistLinearFeetTypeSupported } from "../calculators/calculateFloorFraming.js";
import { hasJoistCountLayoutAxisAuthority } from "../resolvers/floorLayoutAuthority.js";
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

function blockBothJoistQuantities(
  description: string,
): Array<{ quantityKey: string; description: string; canCalculate: boolean }> {
  return [
    {
      quantityKey: FLOOR_QUANTITY_KEYS.joists,
      description,
      canCalculate: false,
    },
    {
      quantityKey: FLOOR_QUANTITY_KEYS.joistLinearFeet,
      description,
      canCalculate: false,
    },
  ];
}

function allowBothJoistQuantities(
  description: string,
): Array<{ quantityKey: string; description: string; canCalculate: boolean }> {
  return [
    {
      quantityKey: FLOOR_QUANTITY_KEYS.joists,
      description,
      canCalculate: true,
    },
    {
      quantityKey: FLOOR_QUANTITY_KEYS.joistLinearFeet,
      description,
      canCalculate: true,
    },
  ];
}

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

function isJoistLayoutLengthResolved(area: FloorFramingArea): boolean {
  return (
    area.joistLayoutLengthFeet !== null ||
    isPropertyResolved(area.resolutionTraces, "joistLayoutLengthFeet")
  );
}

function isJoistMemberLengthResolved(area: FloorFramingArea): boolean {
  return (
    area.joistMemberLengthFeet !== null ||
    isPropertyResolved(area.resolutionTraces, "joistMemberLengthFeet")
  );
}

function isAreaSquareFeetResolved(area: FloorFramingArea): boolean {
  return (
    area.areaSquareFeet !== null ||
    isPropertyResolved(area.resolutionTraces, "areaSquareFeet")
  );
}

function validateInferredParentSystemReview(
  area: FloorFramingArea,
): ValidationBatch | null {
  const parentTrace = area.resolutionTraces.find(
    (trace) =>
      trace.propertyPath === "parentSystemTag" &&
      trace.method === "supported-inference",
  );

  if (!parentTrace) {
    return null;
  }

  const target = createObjectTarget(area.id, area.objectType);
  const ruleId = FLOOR_FRAMING_RULE_IDS.areaParentSystemResolved;
  const evidenceIds = collectEvidenceIds(area);
  const explanation = `Floor area ${area.id} parent system was inferred (${parentTrace.explanation}). Confirm ownership before relying on material output.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "relationship",
      severity: "warning",
      ruleViolated:
        "Inferred floor area parent system relationship requires confirmation.",
      explanation,
      target,
      recommendedUserAction:
        "Confirm the inferred parent floor framing system for this area.",
      evidenceIds,
      quantityImpacts: allowBothJoistQuantities(
        "Baseline joist quantities may calculate while inferred parent link is confirmed.",
      ),
    },
    {
      ruleId,
      target,
      title: `Confirm inferred parent system for floor area ${area.id}`,
      description: explanation,
      action: {
        type: "confirm",
        instruction:
          "Confirm the parent floor framing system inferred from corroborating plan evidence.",
        targetProperty: "parentSystemId",
      },
      reviewStatus: "review-required",
      blockingStatus: "not-blocked",
      affectedObjects: [{ objectId: area.id, objectType: area.objectType }],
      quantityImpacts: toReviewQuantityImpacts(
        allowBothJoistQuantities(
          "Baseline joist quantities may calculate while inferred parent link is confirmed.",
        ),
      ),
      evidenceIds,
    },
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

  const quantityImpacts = blockBothJoistQuantities(
    "Floor joist takeoff requires a valid parent system.",
  );

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

  const quantityImpacts = blockBothJoistQuantities(
    "Inconsistent floor areas prevent reliable joist takeoff.",
  );

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

  const quantityImpacts = blockBothJoistQuantities(
    "Floor joist takeoff requires a resolved joist type.",
  );

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

  const quantityImpacts = blockBothJoistQuantities(
    "Floor joist takeoff requires a resolved joist size.",
  );

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

  const quantityImpacts = blockBothJoistQuantities(
    "Floor joist takeoff requires resolved joist spacing.",
  );

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

function validateLayoutAxisAuthorityResolved(area: FloorFramingArea): ValidationBatch {
  const target = createObjectTarget(area.id, area.objectType);
  const ruleId = FLOOR_FRAMING_RULE_IDS.spanDirectionResolved;
  const evidenceIds = collectEvidenceIds(area);

  if (hasJoistCountLayoutAxisAuthority(area)) {
    return buildPassedBatch(
      ruleId,
      "object",
      target,
      `Floor area ${area.id} has layout-axis authority for baseline joist count (span direction or spacing-axis layout authority).`,
      evidenceIds,
    );
  }

  const quantityImpacts = blockBothJoistQuantities(
    "Floor joist count requires layout-axis authority: valid span direction or explicit spacing-axis layout authority on joistLayoutLengthFeet.",
  );

  const explanation = `Floor area ${area.id} lacks layout-axis authority for baseline joist count.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "object",
      severity: "critical",
      ruleViolated:
        "Floor area must have span direction or established spacing-axis layout authority.",
      explanation,
      target,
      recommendedUserAction:
        "Confirm span direction or provide explicit spacing-axis bay dimension for joistLayoutLengthFeet.",
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Resolve layout-axis authority for floor area ${area.id}`,
      description: explanation,
      action: {
        type: "provide-value",
        instruction:
          "Provide span direction or explicit spacing-axis layout length authority for this floor area.",
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

function validateJoistLayoutLengthResolved(area: FloorFramingArea): ValidationBatch {
  const target = createObjectTarget(area.id, area.objectType);
  const ruleId = FLOOR_FRAMING_RULE_IDS.joistLayoutLengthResolved;
  const evidenceIds = collectEvidenceIds(area);

  if (isJoistLayoutLengthResolved(area)) {
    return buildPassedBatch(
      ruleId,
      "object",
      target,
      `Floor area ${area.id} has resolved joist layout length.`,
      evidenceIds,
    );
  }

  const quantityImpacts = blockBothJoistQuantities(
    "Floor joist count and LF require resolved joist layout length along the spacing axis.",
  );

  const explanation = `Floor area ${area.id} is missing joist layout length.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "object",
      severity: "critical",
      ruleViolated:
        "Floor area joist layout length must be resolved for baseline joist count.",
      explanation,
      target,
      recommendedUserAction:
        "Confirm the floor bay length along the joist spacing axis (perpendicular to span).",
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Resolve joist layout length for floor area ${area.id}`,
      description: explanation,
      action: {
        type: "provide-value",
        instruction:
          "Provide joistLayoutLengthFeet as the spacing-axis bay length in feet.",
        targetProperty: "joistLayoutLengthFeet",
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

  // Per knowledge/framing/14-floor-framing-calculations.md, areaSquareFeet is
  // not an input to baseline joist count or LF. Missing SF is reviewable but must
  // not block floor.joists or floor.joist-linear-feet.
  const quantityImpacts = allowBothJoistQuantities(
    "Baseline floor joist count and LF do not require area square footage.",
  );

  const explanation = `Floor area ${area.id} is missing area square footage.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "object",
      severity: "warning",
      ruleViolated:
        "Floor area square footage is unresolved (optional for joist count).",
      explanation,
      target,
      recommendedUserAction:
        "Confirm floor area square footage from plans when coverage geometry is needed.",
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
      reviewStatus: "review-recommended",
      blockingStatus: "not-blocked",
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
      quantityImpacts: allowBothJoistQuantities(
        "Floor joist takeoff may still proceed from explicit area geometry.",
      ),
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
      quantityImpacts: allowBothJoistQuantities(
        "Floor joist takeoff may still proceed without opening association resolution.",
      ),
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
      quantityImpacts: allowBothJoistQuantities(
        "Floor joist takeoff may still proceed without member association resolution.",
      ),
      reviewStatus: "review-recommended",
      blockingStatus: "not-blocked",
      targetProperty: "structuralMemberIds",
      actionInstruction:
        "Confirm the structural members associated with this floor area.",
    },
  );
}

function validateJoistMemberLengthResolved(
  area: FloorFramingArea,
): ValidationBatch {
  const target = createObjectTarget(area.id, area.objectType);
  const ruleId = FLOOR_FRAMING_RULE_IDS.joistMemberLengthResolved;
  const evidenceIds = collectEvidenceIds(area);

  if (isJoistMemberLengthResolved(area)) {
    return buildPassedBatch(
      ruleId,
      "object",
      target,
      `Floor area ${area.id} has resolved joist member length.`,
      evidenceIds,
    );
  }

  // Smallest blast radius: missing member length blocks LF only, not count.
  const quantityImpacts = [
    {
      quantityKey: FLOOR_QUANTITY_KEYS.joists,
      description:
        "Baseline floor joist count does not require joist member length.",
      canCalculate: true,
    },
    {
      quantityKey: FLOOR_QUANTITY_KEYS.joistLinearFeet,
      description:
        "Floor joist linear footage requires resolved joist member length.",
      canCalculate: false,
    },
  ];

  const explanation = `Floor area ${area.id} is missing joist member length.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "object",
      severity: "warning",
      ruleViolated:
        "Floor area joist member length must be resolved for baseline joist LF.",
      explanation,
      target,
      recommendedUserAction:
        "Confirm the installed length of one baseline joist member in feet (not clear span alone).",
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Resolve joist member length for floor area ${area.id}`,
      description: explanation,
      action: {
        type: "provide-value",
        instruction:
          "Provide joistMemberLengthFeet as the installed length of one baseline joist member in feet.",
        targetProperty: "joistMemberLengthFeet",
      },
      reviewStatus: "review-required",
      blockingStatus: "not-blocked",
      affectedObjects: [{ objectId: area.id, objectType: area.objectType }],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds,
    },
  );
}

function validateJoistLinearFeetTypeSupported(
  system: FloorFramingSystem,
  area: FloorFramingArea,
): ValidationBatch {
  const target = createObjectTarget(area.id, area.objectType);
  const ruleId = FLOOR_FRAMING_RULE_IDS.joistLinearFeetTypeSupported;
  const evidenceIds = collectEvidenceIds(system);

  if (!isJoistTypeResolved(system) || system.assembly.joistType === null) {
    return buildSkippedBatch(
      ruleId,
      "object",
      target,
      `Joist LF type support skipped until joist type resolves for ${system.id}.`,
      evidenceIds,
    );
  }

  if (isSimpleAreaJoistLinearFeetTypeSupported(system.assembly.joistType)) {
    return buildPassedBatch(
      ruleId,
      "object",
      target,
      `Floor area ${area.id} joist type is eligible for simple-area joist LF.`,
      evidenceIds,
    );
  }

  const quantityImpacts = [
    {
      quantityKey: FLOOR_QUANTITY_KEYS.joists,
      description:
        "Baseline floor joist count remains available for this joist type.",
      canCalculate: true,
    },
    {
      quantityKey: FLOOR_QUANTITY_KEYS.joistLinearFeet,
      description:
        "Simple-area joist LF is not authorized for this joist type classification.",
      canCalculate: false,
    },
  ];

  const explanation = `Floor area ${area.id} joist type "${system.assembly.joistType}" is outside the simple-area joist LF allowlist.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "object",
      severity: "warning",
      ruleViolated:
        "Baseline joist LF applies only to dimensional lumber and I-joist simple-area populations.",
      explanation,
      target,
      recommendedUserAction:
        "Confirm joist type or take floor-truss / unsupported systems through a dedicated authority.",
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Confirm joist type eligibility for LF on floor area ${area.id}`,
      description: explanation,
      action: {
        type: "confirm",
        instruction:
          "Confirm whether this floor bay uses dimensional lumber or I-joists eligible for simple-area LF.",
        targetProperty: "assembly.joistType",
      },
      reviewStatus: "review-required",
      blockingStatus: "not-blocked",
      affectedObjects: [
        { objectId: area.id, objectType: area.objectType },
        { objectId: system.id, objectType: system.objectType },
      ],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds,
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
    const inferredParentReview = validateInferredParentSystemReview(area);
    if (inferredParentReview) {
      batches.push(inferredParentReview);
    }
    batches.push(validateLayoutAxisAuthorityResolved(area));
    batches.push(validateJoistLayoutLengthResolved(area));
    batches.push(validateJoistMemberLengthResolved(area));
    batches.push(validateAreaSquareFeetResolved(area));
    const parentSystem = systemsById.get(area.parentSystemId);
    if (parentSystem) {
      batches.push(validateJoistLinearFeetTypeSupported(parentSystem, area));
    }
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
