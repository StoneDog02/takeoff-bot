import type { ObjectId } from "../../../core/schemas/identity.schema.js";
import type {
  RoofFramingSystem,
  RoofPlane,
} from "../schemas/roof-framing.schema.js";
import type { RoofFramingPayload } from "../schemas/framing-artifacts.schema.js";
import { isStickCommonRafterFramingType } from "../resolvers/roofFramingPropertyPaths.js";
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
  ROOF_FRAMING_RULE_IDS,
  ROOF_QUANTITY_KEYS,
} from "./rule-ids.js";
import type { RelatedObjectRef, ValidationBatch } from "./types.js";

export type RoofFramingValidationInput = {
  payload: RoofFramingPayload;
  boundingWallsById?: ReadonlyMap<ObjectId, RelatedObjectRef>;
  openingsById?: ReadonlyMap<ObjectId, RelatedObjectRef>;
  structuralMembersById?: ReadonlyMap<ObjectId, RelatedObjectRef>;
};

function blockCommonRafters(
  description: string,
): Array<{ quantityKey: string; description: string; canCalculate: boolean }> {
  return [
    {
      quantityKey: ROOF_QUANTITY_KEYS.commonRafters,
      description,
      canCalculate: false,
    },
  ];
}

function allowCommonRafters(
  description: string,
): Array<{ quantityKey: string; description: string; canCalculate: boolean }> {
  return [
    {
      quantityKey: ROOF_QUANTITY_KEYS.commonRafters,
      description,
      canCalculate: true,
    },
  ];
}

function isFramingTypeResolved(system: RoofFramingSystem): boolean {
  return (
    system.assembly.framingType !== null ||
    isPropertyResolved(system.resolutionTraces, "assembly.framingType")
  );
}

function isMemberSizeResolved(system: RoofFramingSystem): boolean {
  return (
    system.assembly.memberSize !== null ||
    isPropertyResolved(system.resolutionTraces, "assembly.memberSize")
  );
}

function isMemberSpacingResolved(system: RoofFramingSystem): boolean {
  return (
    system.assembly.memberSpacingInches !== null ||
    isPropertyResolved(system.resolutionTraces, "assembly.memberSpacingInches")
  );
}

function isSpanDirectionResolved(plane: RoofPlane): boolean {
  return (
    plane.spanDirection !== null ||
    isPropertyResolved(plane.resolutionTraces, "spanDirection")
  );
}

function isRafterLayoutLengthResolved(plane: RoofPlane): boolean {
  return (
    plane.rafterLayoutLengthFeet !== null ||
    isPropertyResolved(plane.resolutionTraces, "rafterLayoutLengthFeet")
  );
}

function isPitchResolved(plane: RoofPlane): boolean {
  return (
    plane.pitch !== null ||
    isPropertyResolved(plane.resolutionTraces, "pitch")
  );
}

function isAreaSquareFeetResolved(plane: RoofPlane): boolean {
  return (
    plane.areaSquareFeet !== null ||
    isPropertyResolved(plane.resolutionTraces, "areaSquareFeet")
  );
}

function validatePlaneParentSystemResolved(
  plane: RoofPlane,
  systemsById: ReadonlyMap<ObjectId, RoofFramingSystem>,
): ValidationBatch {
  const target = createObjectTarget(plane.id, plane.objectType);
  const ruleId = ROOF_FRAMING_RULE_IDS.planeParentSystemResolved;
  const evidenceIds = collectEvidenceIds(plane);

  if (systemsById.has(plane.parentSystemId)) {
    return buildPassedBatch(
      ruleId,
      "relationship",
      target,
      `Roof plane ${plane.id} references an existing parent system.`,
      evidenceIds,
    );
  }

  const quantityImpacts = blockCommonRafters(
    "Common-rafter takeoff requires a valid parent system.",
  );

  const explanation = `Roof plane ${plane.id} references missing parent system ${plane.parentSystemId}.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "relationship",
      severity: "critical",
      ruleViolated: "Roof plane parent system must reference an existing system.",
      explanation,
      target,
      recommendedUserAction:
        "Confirm the roof framing system that owns this plane.",
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Resolve parent system for roof plane ${plane.id}`,
      description: explanation,
      action: {
        type: "provide-value",
        instruction: "Identify the parent roof framing system for this plane.",
        targetProperty: "parentSystemId",
      },
      reviewStatus: "review-required",
      blockingStatus: "blocked",
      affectedObjects: [{ objectId: plane.id, objectType: plane.objectType }],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds,
    },
  );
}

function validateSystemPlanesConsistent(
  system: RoofFramingSystem,
  planesById: ReadonlyMap<ObjectId, RoofPlane>,
): ValidationBatch {
  const target = createObjectTarget(system.id, system.objectType);
  const ruleId = ROOF_FRAMING_RULE_IDS.systemPlanesConsistent;
  const evidenceIds = collectEvidenceIds(system);
  const problems: string[] = [];

  for (const planeId of system.planeIds) {
    const plane = planesById.get(planeId);
    if (!plane) {
      problems.push(
        `Roof system ${system.id} references missing plane ${planeId}.`,
      );
      continue;
    }

    if (plane.parentSystemId !== system.id) {
      problems.push(
        `Plane ${plane.id} is listed on system ${system.id} but references parent ${plane.parentSystemId}.`,
      );
    }
  }

  for (const plane of planesById.values()) {
    if (
      plane.parentSystemId === system.id &&
      !system.planeIds.includes(plane.id)
    ) {
      problems.push(
        `Plane ${plane.id} references system ${system.id} but is not listed on the system.`,
      );
    }
  }

  if (problems.length === 0) {
    return buildPassedBatch(
      ruleId,
      "relationship",
      target,
      `Roof system ${system.id} plane relationships are consistent.`,
      evidenceIds,
    );
  }

  const quantityImpacts = blockCommonRafters(
    "Inconsistent roof planes prevent reliable common-rafter takeoff.",
  );

  const explanation = problems.join(" ");

  return buildFailedBatch(
    {
      ruleId,
      level: "relationship",
      severity: "critical",
      ruleViolated: "Roof system and plane relationships must be consistent.",
      explanation,
      target,
      recommendedUserAction:
        "Reconcile roof system plane IDs and parent system references.",
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Reconcile planes for roof system ${system.id}`,
      description: explanation,
      action: {
        type: "provide-value",
        instruction:
          "Confirm which planes belong to this roof framing system.",
        targetProperty: "planeIds",
      },
      reviewStatus: "review-required",
      blockingStatus: "blocked",
      affectedObjects: [{ objectId: system.id, objectType: system.objectType }],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds,
    },
  );
}

function validateFramingTypeResolved(
  system: RoofFramingSystem,
): ValidationBatch {
  const target = createObjectTarget(system.id, system.objectType);
  const ruleId = ROOF_FRAMING_RULE_IDS.framingTypeResolved;
  const evidenceIds = collectEvidenceIds(system);

  if (isFramingTypeResolved(system)) {
    return buildPassedBatch(
      ruleId,
      "object",
      target,
      `Roof system ${system.id} has a resolved framing type.`,
      evidenceIds,
    );
  }

  const quantityImpacts = blockCommonRafters(
    "Common-rafter takeoff requires a resolved framing type.",
  );

  const explanation = `Roof system ${system.id} is missing framing type.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "object",
      severity: "critical",
      ruleViolated: "Roof framing type must be resolved.",
      explanation,
      target,
      recommendedUserAction:
        "Confirm whether this roof uses rafters, trusses, or another supported framing type.",
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Resolve framing type for roof system ${system.id}`,
      description: explanation,
      action: {
        type: "provide-value",
        instruction: "Provide the roof framing type for this system.",
        targetProperty: "assembly.framingType",
      },
      reviewStatus: "review-required",
      blockingStatus: "blocked",
      affectedObjects: [{ objectId: system.id, objectType: system.objectType }],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds,
    },
  );
}

function validateFramingTypeCommonRafterEligible(
  system: RoofFramingSystem,
): ValidationBatch {
  const target = createObjectTarget(system.id, system.objectType);
  const ruleId = ROOF_FRAMING_RULE_IDS.framingTypeCommonRafterEligible;
  const evidenceIds = collectEvidenceIds(system);

  if (!isFramingTypeResolved(system) || system.assembly.framingType === null) {
    return buildSkippedBatch(
      ruleId,
      "object",
      target,
      `Common-rafter eligibility skipped until framing type resolves for ${system.id}.`,
      evidenceIds,
    );
  }

  if (isStickCommonRafterFramingType(system.assembly.framingType)) {
    return buildPassedBatch(
      ruleId,
      "object",
      target,
      `Roof system ${system.id} framing type is eligible for baseline common-rafter count.`,
      evidenceIds,
    );
  }

  const quantityImpacts = blockCommonRafters(
    "Baseline common-rafter count is not authorized for this framing type.",
  );

  const explanation = `Roof system ${system.id} framing type "${system.assembly.framingType}" is not stick common-rafter eligible.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "object",
      severity: "warning",
      ruleViolated:
        "Baseline common-rafter count applies only to stick / rafter framing types.",
      explanation,
      target,
      recommendedUserAction:
        "Confirm framing type or take truss / unsupported systems through a dedicated authority.",
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Confirm common-rafter eligibility for roof system ${system.id}`,
      description: explanation,
      action: {
        type: "confirm",
        instruction:
          "Confirm whether this roof uses stick-framed common rafters eligible for baseline count.",
        targetProperty: "assembly.framingType",
      },
      reviewStatus: "review-required",
      blockingStatus: "not-blocked",
      affectedObjects: [{ objectId: system.id, objectType: system.objectType }],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds,
    },
  );
}

function validateMemberSizeResolved(system: RoofFramingSystem): ValidationBatch {
  const target = createObjectTarget(system.id, system.objectType);
  const ruleId = ROOF_FRAMING_RULE_IDS.memberSizeResolved;
  const evidenceIds = collectEvidenceIds(system);

  if (isMemberSizeResolved(system)) {
    return buildPassedBatch(
      ruleId,
      "object",
      target,
      `Roof system ${system.id} has a resolved member size.`,
      evidenceIds,
    );
  }

  const quantityImpacts = blockCommonRafters(
    "Common-rafter takeoff requires a resolved member size.",
  );

  const explanation = `Roof system ${system.id} is missing member size.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "object",
      severity: "critical",
      ruleViolated: "Roof framing member size must be resolved.",
      explanation,
      target,
      recommendedUserAction:
        "Confirm rafter size from roof framing plans or schedules.",
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Resolve member size for roof system ${system.id}`,
      description: explanation,
      action: {
        type: "provide-value",
        instruction: "Provide the rafter size for this roof system.",
        targetProperty: "assembly.memberSize",
      },
      reviewStatus: "review-required",
      blockingStatus: "blocked",
      affectedObjects: [{ objectId: system.id, objectType: system.objectType }],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds,
    },
  );
}

function validateMemberSpacingResolved(
  system: RoofFramingSystem,
): ValidationBatch {
  const target = createObjectTarget(system.id, system.objectType);
  const ruleId = ROOF_FRAMING_RULE_IDS.memberSpacingResolved;
  const evidenceIds = collectEvidenceIds(system);

  if (isMemberSpacingResolved(system)) {
    return buildPassedBatch(
      ruleId,
      "object",
      target,
      `Roof system ${system.id} has resolved member spacing.`,
      evidenceIds,
    );
  }

  const quantityImpacts = blockCommonRafters(
    "Common-rafter takeoff requires resolved member spacing.",
  );

  const explanation = `Roof system ${system.id} is missing member spacing.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "object",
      severity: "critical",
      ruleViolated: "Roof framing member spacing must be resolved.",
      explanation,
      target,
      recommendedUserAction:
        "Confirm rafter spacing from roof framing plans or schedules.",
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Resolve member spacing for roof system ${system.id}`,
      description: explanation,
      action: {
        type: "provide-value",
        instruction:
          "Provide rafter spacing in inches for this roof system.",
        targetProperty: "assembly.memberSpacingInches",
      },
      reviewStatus: "review-required",
      blockingStatus: "blocked",
      affectedObjects: [{ objectId: system.id, objectType: system.objectType }],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds,
    },
  );
}

function validateSpanDirectionResolved(plane: RoofPlane): ValidationBatch {
  const target = createObjectTarget(plane.id, plane.objectType);
  const ruleId = ROOF_FRAMING_RULE_IDS.spanDirectionResolved;
  const evidenceIds = collectEvidenceIds(plane);

  if (isSpanDirectionResolved(plane)) {
    return buildPassedBatch(
      ruleId,
      "object",
      target,
      `Roof plane ${plane.id} has a resolved span direction.`,
      evidenceIds,
    );
  }

  const quantityImpacts = blockCommonRafters(
    "Common-rafter layout requires a resolved span direction.",
  );

  const explanation = `Roof plane ${plane.id} is missing span direction.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "object",
      severity: "critical",
      ruleViolated: "Roof plane span direction must be resolved.",
      explanation,
      target,
      recommendedUserAction:
        "Confirm span direction from roof framing plans or details.",
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Resolve span direction for roof plane ${plane.id}`,
      description: explanation,
      action: {
        type: "provide-value",
        instruction: "Provide the span direction for this roof plane.",
        targetProperty: "spanDirection",
      },
      reviewStatus: "review-required",
      blockingStatus: "blocked",
      affectedObjects: [{ objectId: plane.id, objectType: plane.objectType }],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds,
    },
  );
}

function validateRafterLayoutLengthResolved(plane: RoofPlane): ValidationBatch {
  const target = createObjectTarget(plane.id, plane.objectType);
  const ruleId = ROOF_FRAMING_RULE_IDS.rafterLayoutLengthResolved;
  const evidenceIds = collectEvidenceIds(plane);

  if (isRafterLayoutLengthResolved(plane)) {
    return buildPassedBatch(
      ruleId,
      "object",
      target,
      `Roof plane ${plane.id} has resolved rafter layout length.`,
      evidenceIds,
    );
  }

  const quantityImpacts = blockCommonRafters(
    "Common-rafter count requires resolved rafter layout length along the spacing axis.",
  );

  const explanation = `Roof plane ${plane.id} is missing rafter layout length.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "object",
      severity: "critical",
      ruleViolated:
        "Roof plane rafter layout length must be resolved for baseline common-rafter count.",
      explanation,
      target,
      recommendedUserAction:
        "Confirm the roof plane length along the rafter spacing axis (perpendicular to span).",
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Resolve rafter layout length for roof plane ${plane.id}`,
      description: explanation,
      action: {
        type: "provide-value",
        instruction:
          "Provide rafterLayoutLengthFeet as the spacing-axis plane length in feet.",
        targetProperty: "rafterLayoutLengthFeet",
      },
      reviewStatus: "review-required",
      blockingStatus: "blocked",
      affectedObjects: [{ objectId: plane.id, objectType: plane.objectType }],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds,
    },
  );
}

function validatePitchResolved(plane: RoofPlane): ValidationBatch {
  const target = createObjectTarget(plane.id, plane.objectType);
  const ruleId = ROOF_FRAMING_RULE_IDS.pitchResolved;
  const evidenceIds = collectEvidenceIds(plane);

  if (isPitchResolved(plane)) {
    return buildPassedBatch(
      ruleId,
      "object",
      target,
      `Roof plane ${plane.id} has a resolved pitch.`,
      evidenceIds,
    );
  }

  // Per knowledge/framing/15-roof-framing-calculations.md, pitch is not an
  // input to baseline common-rafter count. Missing pitch is reviewable but must
  // not block roof.common-rafters.
  const quantityImpacts = allowCommonRafters(
    "Baseline common-rafter count does not require pitch.",
  );

  const explanation = `Roof plane ${plane.id} is missing pitch.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "object",
      severity: "warning",
      ruleViolated:
        "Roof plane pitch is unresolved (optional for common-rafter count).",
      explanation,
      target,
      recommendedUserAction:
        "Confirm roof pitch from elevations, sections, or roof plans when length rules need it.",
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Resolve pitch for roof plane ${plane.id}`,
      description: explanation,
      action: {
        type: "provide-value",
        instruction: "Provide the pitch for this roof plane.",
        targetProperty: "pitch",
      },
      reviewStatus: "review-recommended",
      blockingStatus: "not-blocked",
      affectedObjects: [{ objectId: plane.id, objectType: plane.objectType }],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds,
    },
  );
}

function validateAreaSquareFeetResolved(plane: RoofPlane): ValidationBatch {
  const target = createObjectTarget(plane.id, plane.objectType);
  const ruleId = ROOF_FRAMING_RULE_IDS.areaSquareFeetResolved;
  const evidenceIds = collectEvidenceIds(plane);

  if (isAreaSquareFeetResolved(plane)) {
    return buildPassedBatch(
      ruleId,
      "object",
      target,
      `Roof plane ${plane.id} has resolved area square footage.`,
      evidenceIds,
    );
  }

  // Per knowledge/framing/15-roof-framing-calculations.md, areaSquareFeet is
  // not an input to baseline common-rafter count. Missing SF is reviewable but
  // must not block roof.common-rafters.
  const quantityImpacts = allowCommonRafters(
    "Baseline common-rafter count does not require area square footage.",
  );

  const explanation = `Roof plane ${plane.id} is missing area square footage.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "object",
      severity: "warning",
      ruleViolated:
        "Roof plane square footage is unresolved (optional for common-rafter count).",
      explanation,
      target,
      recommendedUserAction:
        "Confirm roof plane square footage from plans when coverage geometry is needed.",
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Resolve area square footage for roof plane ${plane.id}`,
      description: explanation,
      action: {
        type: "provide-value",
        instruction: "Provide the roof plane area in square feet.",
        targetProperty: "areaSquareFeet",
      },
      reviewStatus: "review-recommended",
      blockingStatus: "not-blocked",
      affectedObjects: [{ objectId: plane.id, objectType: plane.objectType }],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds,
    },
  );
}

function validateReferenceIds(
  plane: RoofPlane,
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
  const target = createObjectTarget(plane.id, plane.objectType);
  const evidenceIds = collectEvidenceIds(plane);

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

  const explanation = `Roof plane ${plane.id} references missing ${options.relationshipLabel}: ${missingIds.join(", ")}.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "relationship",
      severity: options.severity,
      ruleViolated: `Roof plane ${options.relationshipLabel} must reference existing objects.`,
      explanation,
      target,
      recommendedUserAction: options.actionInstruction,
      evidenceIds,
      quantityImpacts: options.quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Resolve ${options.relationshipLabel} for roof plane ${plane.id}`,
      description: explanation,
      action: {
        type: "provide-value",
        instruction: options.actionInstruction,
        targetProperty: options.targetProperty,
      },
      reviewStatus: options.reviewStatus,
      blockingStatus: options.blockingStatus,
      affectedObjects: [{ objectId: plane.id, objectType: plane.objectType }],
      quantityImpacts: toReviewQuantityImpacts(options.quantityImpacts),
      evidenceIds,
    },
  );
}

function validateBoundingWallsResolved(
  plane: RoofPlane,
  relatedObjectsById: ReadonlyMap<ObjectId, RelatedObjectRef> | undefined,
): ValidationBatch {
  return validateReferenceIds(
    plane,
    ROOF_FRAMING_RULE_IDS.boundingWallsResolved,
    plane.boundingWallIds,
    relatedObjectsById,
    {
      skipExplanation:
        "Bounding wall validation was skipped because no wall artifacts were provided.",
      emptyExplanation: `Roof plane ${plane.id} has no bounding wall references to validate.`,
      passExplanation: `Roof plane ${plane.id} references existing bounding walls.`,
      relationshipLabel: "bounding walls",
      severity: "warning",
      quantityImpacts: allowCommonRafters(
        "Common-rafter takeoff may still proceed from explicit plane geometry.",
      ),
      reviewStatus: "review-recommended",
      blockingStatus: "not-blocked",
      targetProperty: "boundingWallIds",
      actionInstruction:
        "Confirm the walls that bound this roof plane.",
    },
  );
}

function validateOpeningReferencesResolved(
  plane: RoofPlane,
  relatedObjectsById: ReadonlyMap<ObjectId, RelatedObjectRef> | undefined,
): ValidationBatch {
  return validateReferenceIds(
    plane,
    ROOF_FRAMING_RULE_IDS.openingReferencesResolved,
    plane.openingIds,
    relatedObjectsById,
    {
      skipExplanation:
        "Opening reference validation was skipped because no opening artifacts were provided.",
      emptyExplanation: `Roof plane ${plane.id} has no opening references to validate.`,
      passExplanation: `Roof plane ${plane.id} references existing openings.`,
      relationshipLabel: "openings",
      severity: "warning",
      quantityImpacts: allowCommonRafters(
        "Common-rafter takeoff may still proceed without opening association resolution.",
      ),
      reviewStatus: "review-recommended",
      blockingStatus: "not-blocked",
      targetProperty: "openingIds",
      actionInstruction: "Confirm the openings associated with this roof plane.",
    },
  );
}

function validateStructuralMemberReferencesResolved(
  plane: RoofPlane,
  relatedObjectsById: ReadonlyMap<ObjectId, RelatedObjectRef> | undefined,
): ValidationBatch {
  return validateReferenceIds(
    plane,
    ROOF_FRAMING_RULE_IDS.structuralMemberReferencesResolved,
    plane.structuralMemberIds,
    relatedObjectsById,
    {
      skipExplanation:
        "Structural member validation was skipped because no structural member artifacts were provided.",
      emptyExplanation: `Roof plane ${plane.id} has no structural member references to validate.`,
      passExplanation: `Roof plane ${plane.id} references existing structural members.`,
      relationshipLabel: "structural members",
      severity: "warning",
      quantityImpacts: allowCommonRafters(
        "Common-rafter takeoff may still proceed without member association resolution.",
      ),
      reviewStatus: "review-recommended",
      blockingStatus: "not-blocked",
      targetProperty: "structuralMemberIds",
      actionInstruction:
        "Confirm the structural members associated with this roof plane.",
    },
  );
}

export function validateRoofFraming(
  input: RoofFramingValidationInput,
): ValidationBatch {
  const systemsById = new Map(
    input.payload.systems.map((system) => [system.id, system]),
  );
  const planesById = new Map(
    input.payload.planes.map((plane) => [plane.id, plane]),
  );

  const batches: ValidationBatch[] = [];

  for (const system of input.payload.systems) {
    batches.push(validateSystemPlanesConsistent(system, planesById));
    batches.push(validateFramingTypeResolved(system));
    batches.push(validateFramingTypeCommonRafterEligible(system));
    batches.push(validateMemberSizeResolved(system));
    batches.push(validateMemberSpacingResolved(system));
  }

  for (const plane of input.payload.planes) {
    batches.push(validatePlaneParentSystemResolved(plane, systemsById));
    batches.push(validateSpanDirectionResolved(plane));
    batches.push(validateRafterLayoutLengthResolved(plane));
    batches.push(validatePitchResolved(plane));
    batches.push(validateAreaSquareFeetResolved(plane));
    batches.push(
      validateBoundingWallsResolved(plane, input.boundingWallsById),
    );
    batches.push(validateOpeningReferencesResolved(plane, input.openingsById));
    batches.push(
      validateStructuralMemberReferencesResolved(
        plane,
        input.structuralMembersById,
      ),
    );
  }

  return mergeValidationBatches(...batches);
}
