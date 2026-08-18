import type { ObjectId } from "../../../core/schemas/identity.schema.js";
import type { StructuralMember } from "../schemas/structural-member.schema.js";
import type { StructuralMembersPayload } from "../schemas/framing-artifacts.schema.js";
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
  STRUCTURAL_MEMBER_QUANTITY_KEYS,
  STRUCTURAL_MEMBER_RULE_IDS,
} from "./rule-ids.js";
import type { ValidationBatch } from "./types.js";

export type StructuralMemberRelatedObject = {
  objectId: ObjectId;
  objectType: string;
};

export type StructuralMembersValidationInput = {
  payload: StructuralMembersPayload;
  relatedObjectsById?: ReadonlyMap<ObjectId, StructuralMemberRelatedObject>;
  connectorsById?: ReadonlyMap<ObjectId, StructuralMemberRelatedObject>;
};

function isMaterialResolved(member: StructuralMember): boolean {
  return (
    member.materialType !== null ||
    isPropertyResolved(member.resolutionTraces, "materialType")
  );
}

function isSizeResolved(member: StructuralMember): boolean {
  return (
    member.size !== null ||
    isPropertyResolved(member.resolutionTraces, "size")
  );
}

function isLengthResolved(member: StructuralMember): boolean {
  return (
    member.lengthFeet !== null ||
    isPropertyResolved(member.resolutionTraces, "lengthFeet")
  );
}

function isPlyCountResolved(member: StructuralMember): boolean {
  return (
    member.plyCount !== null ||
    isPropertyResolved(member.resolutionTraces, "plyCount")
  );
}

function plyCountValidationApplies(member: StructuralMember): boolean {
  return member.category === "built-up-member";
}

function validateCategoryResolved(member: StructuralMember): ValidationBatch {
  const target = createObjectTarget(member.id, member.objectType);
  const ruleId = STRUCTURAL_MEMBER_RULE_IDS.categoryResolved;
  const evidenceIds = collectEvidenceIds(member);

  if (member.category !== "unknown") {
    return buildPassedBatch(
      ruleId,
      "object",
      target,
      `Structural member ${member.id} has a resolved category.`,
      evidenceIds,
    );
  }

  const quantityImpacts = [
    {
      quantityKey: STRUCTURAL_MEMBER_QUANTITY_KEYS.material,
      description: "Member material takeoff requires a resolved category.",
      canCalculate: false,
    },
    {
      quantityKey: STRUCTURAL_MEMBER_QUANTITY_KEYS.length,
      description: "Member length takeoff requires a resolved category.",
      canCalculate: false,
    },
  ];

  const explanation = `Structural member ${member.id} has unresolved category classification.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "object",
      severity: "critical",
      ruleViolated:
        "Structural member category must be resolved before material takeoff.",
      explanation,
      target,
      recommendedUserAction:
        "Confirm whether this member is a header, beam, joist, or other supported category.",
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Resolve category for structural member ${member.id}`,
      description: explanation,
      action: {
        type: "select-option",
        instruction: "Select the correct structural member category.",
        targetProperty: "category",
      },
      reviewStatus: "review-required",
      blockingStatus: "blocked",
      affectedObjects: [{ objectId: member.id, objectType: member.objectType }],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds,
    },
  );
}

function validateMaterialResolved(member: StructuralMember): ValidationBatch {
  const target = createObjectTarget(member.id, member.objectType);
  const ruleId = STRUCTURAL_MEMBER_RULE_IDS.materialResolved;
  const evidenceIds = collectEvidenceIds(member);

  if (isMaterialResolved(member)) {
    return buildPassedBatch(
      ruleId,
      "object",
      target,
      `Structural member ${member.id} has resolved material type.`,
      evidenceIds,
    );
  }

  const quantityImpacts = [
    {
      quantityKey: STRUCTURAL_MEMBER_QUANTITY_KEYS.material,
      description: "Member material takeoff requires a resolved material type.",
      canCalculate: false,
    },
  ];

  const explanation = `Structural member ${member.id} is missing material type.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "object",
      severity: "critical",
      ruleViolated: "Structural member material type must be resolved.",
      explanation,
      target,
      recommendedUserAction:
        "Confirm the member material from schedules, details, or notes.",
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Resolve material for structural member ${member.id}`,
      description: explanation,
      action: {
        type: "provide-value",
        instruction: "Provide the structural member material type.",
        targetProperty: "materialType",
      },
      reviewStatus: "review-required",
      blockingStatus: "blocked",
      affectedObjects: [{ objectId: member.id, objectType: member.objectType }],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds,
    },
  );
}

function validateSizeResolved(member: StructuralMember): ValidationBatch {
  const target = createObjectTarget(member.id, member.objectType);
  const ruleId = STRUCTURAL_MEMBER_RULE_IDS.sizeResolved;
  const evidenceIds = collectEvidenceIds(member);

  if (isSizeResolved(member)) {
    return buildPassedBatch(
      ruleId,
      "object",
      target,
      `Structural member ${member.id} has resolved size.`,
      evidenceIds,
    );
  }

  const quantityImpacts = [
    {
      quantityKey: STRUCTURAL_MEMBER_QUANTITY_KEYS.material,
      description: "Member material takeoff requires a resolved member size.",
      canCalculate: false,
    },
  ];

  const explanation = `Structural member ${member.id} is missing member size.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "object",
      severity: "critical",
      ruleViolated: "Structural member size must be resolved.",
      explanation,
      target,
      recommendedUserAction:
        "Confirm the member size from schedules, details, or callouts.",
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Resolve size for structural member ${member.id}`,
      description: explanation,
      action: {
        type: "provide-value",
        instruction: "Provide the structural member size.",
        targetProperty: "size",
      },
      reviewStatus: "review-required",
      blockingStatus: "blocked",
      affectedObjects: [{ objectId: member.id, objectType: member.objectType }],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds,
    },
  );
}

function validateLengthResolved(member: StructuralMember): ValidationBatch {
  const target = createObjectTarget(member.id, member.objectType);
  const ruleId = STRUCTURAL_MEMBER_RULE_IDS.lengthResolved;
  const evidenceIds = collectEvidenceIds(member);

  if (isLengthResolved(member)) {
    return buildPassedBatch(
      ruleId,
      "object",
      target,
      `Structural member ${member.id} has resolved length.`,
      evidenceIds,
    );
  }

  const quantityImpacts = [
    {
      quantityKey: STRUCTURAL_MEMBER_QUANTITY_KEYS.length,
      description: "Member length takeoff requires a resolved span or length.",
      canCalculate: false,
    },
  ];

  const explanation = `Structural member ${member.id} is missing length or span.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "object",
      severity: "critical",
      ruleViolated: "Structural member length or span must be resolved.",
      explanation,
      target,
      recommendedUserAction:
        "Confirm the member length from plans, sections, or schedules.",
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Resolve length for structural member ${member.id}`,
      description: explanation,
      action: {
        type: "provide-value",
        instruction: "Provide the structural member length in feet.",
        targetProperty: "lengthFeet",
      },
      reviewStatus: "review-required",
      blockingStatus: "blocked",
      affectedObjects: [{ objectId: member.id, objectType: member.objectType }],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds,
    },
  );
}

function validatePlyCountResolved(member: StructuralMember): ValidationBatch {
  const target = createObjectTarget(member.id, member.objectType);
  const ruleId = STRUCTURAL_MEMBER_RULE_IDS.plyCountResolved;
  const evidenceIds = collectEvidenceIds(member);

  if (!plyCountValidationApplies(member)) {
    return buildPassedBatch(
      ruleId,
      "object",
      target,
      `Structural member ${member.id} does not require explicit ply count validation.`,
      evidenceIds,
    );
  }

  if (isPlyCountResolved(member)) {
    return buildPassedBatch(
      ruleId,
      "object",
      target,
      `Structural member ${member.id} has resolved ply count.`,
      evidenceIds,
    );
  }

  const quantityImpacts = [
    {
      quantityKey: STRUCTURAL_MEMBER_QUANTITY_KEYS.material,
      description: "Built-up member material takeoff requires ply count.",
      canCalculate: false,
    },
  ];

  const explanation = `Built-up structural member ${member.id} is missing ply count.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "object",
      severity: "critical",
      ruleViolated: "Built-up structural member ply count must be resolved.",
      explanation,
      target,
      recommendedUserAction:
        "Confirm the ply count for this built-up member from schedules or details.",
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Resolve ply count for structural member ${member.id}`,
      description: explanation,
      action: {
        type: "provide-value",
        instruction: "Provide the ply count for this built-up member.",
        targetProperty: "plyCount",
      },
      reviewStatus: "review-required",
      blockingStatus: "blocked",
      affectedObjects: [{ objectId: member.id, objectType: member.objectType }],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds,
    },
  );
}

function validateReferenceIds(
  member: StructuralMember,
  ruleId: string,
  referenceIds: ObjectId[],
  objectsById: ReadonlyMap<ObjectId, StructuralMemberRelatedObject> | undefined,
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
  const target = createObjectTarget(member.id, member.objectType);
  const evidenceIds = collectEvidenceIds(member);

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

  const explanation = `Structural member ${member.id} references missing ${options.relationshipLabel}: ${missingIds.join(", ")}.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "relationship",
      severity: options.severity,
      ruleViolated: `Structural member ${options.relationshipLabel} must reference existing objects.`,
      explanation,
      target,
      recommendedUserAction: options.actionInstruction,
      evidenceIds,
      quantityImpacts: options.quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Resolve ${options.relationshipLabel} for structural member ${member.id}`,
      description: explanation,
      action: {
        type: "provide-value",
        instruction: options.actionInstruction,
        targetProperty: options.targetProperty,
      },
      reviewStatus: options.reviewStatus,
      blockingStatus: options.blockingStatus,
      affectedObjects: [{ objectId: member.id, objectType: member.objectType }],
      quantityImpacts: toReviewQuantityImpacts(options.quantityImpacts),
      evidenceIds,
    },
  );
}

function validateAssociatedObjectsResolved(
  member: StructuralMember,
  relatedObjectsById: ReadonlyMap<ObjectId, StructuralMemberRelatedObject> | undefined,
): ValidationBatch {
  return validateReferenceIds(
    member,
    STRUCTURAL_MEMBER_RULE_IDS.associatedObjectsResolved,
    member.associatedObjectIds,
    relatedObjectsById,
    {
      skipExplanation:
        "Associated object validation was skipped because no related artifacts were provided.",
      emptyExplanation: `Structural member ${member.id} has no associated object references to validate.`,
      passExplanation: `Structural member ${member.id} references existing associated objects.`,
      relationshipLabel: "associated objects",
      severity: "warning",
      quantityImpacts: [
        {
          quantityKey: STRUCTURAL_MEMBER_QUANTITY_KEYS.material,
          description:
            "Member material takeoff may still proceed from schedule data.",
          canCalculate: true,
        },
      ],
      reviewStatus: "review-recommended",
      blockingStatus: "not-blocked",
      targetProperty: "associatedObjectIds",
      actionInstruction:
        "Confirm the openings, walls, or other objects associated with this member.",
    },
  );
}

function validateSupportedObjectsResolved(
  member: StructuralMember,
  relatedObjectsById: ReadonlyMap<ObjectId, StructuralMemberRelatedObject> | undefined,
): ValidationBatch {
  return validateReferenceIds(
    member,
    STRUCTURAL_MEMBER_RULE_IDS.supportedObjectsResolved,
    member.supportedObjectIds,
    relatedObjectsById,
    {
      skipExplanation:
        "Supported object validation was skipped because no related artifacts were provided.",
      emptyExplanation: `Structural member ${member.id} has no supported object references to validate.`,
      passExplanation: `Structural member ${member.id} references existing supported objects.`,
      relationshipLabel: "supported objects",
      severity: "critical",
      quantityImpacts: [
        {
          quantityKey: STRUCTURAL_MEMBER_QUANTITY_KEYS.length,
          description: "Member span takeoff requires valid supported objects.",
          canCalculate: false,
        },
      ],
      reviewStatus: "review-required",
      blockingStatus: "blocked",
      targetProperty: "supportedObjectIds",
      actionInstruction:
        "Confirm the members or assemblies supported by this structural member.",
    },
  );
}

function validateSupportingObjectsResolved(
  member: StructuralMember,
  relatedObjectsById: ReadonlyMap<ObjectId, StructuralMemberRelatedObject> | undefined,
): ValidationBatch {
  return validateReferenceIds(
    member,
    STRUCTURAL_MEMBER_RULE_IDS.supportingObjectsResolved,
    member.supportingObjectIds,
    relatedObjectsById,
    {
      skipExplanation:
        "Supporting object validation was skipped because no related artifacts were provided.",
      emptyExplanation: `Structural member ${member.id} has no supporting object references to validate.`,
      passExplanation: `Structural member ${member.id} references existing supporting objects.`,
      relationshipLabel: "supporting objects",
      severity: "critical",
      quantityImpacts: [
        {
          quantityKey: STRUCTURAL_MEMBER_QUANTITY_KEYS.length,
          description:
            "Member span takeoff requires valid supporting objects.",
          canCalculate: false,
        },
      ],
      reviewStatus: "review-required",
      blockingStatus: "blocked",
      targetProperty: "supportingObjectIds",
      actionInstruction:
        "Confirm the members or assemblies that support this structural member.",
    },
  );
}

function validateConnectorReferencesResolved(
  member: StructuralMember,
  connectorsById: ReadonlyMap<ObjectId, StructuralMemberRelatedObject> | undefined,
): ValidationBatch {
  return validateReferenceIds(
    member,
    STRUCTURAL_MEMBER_RULE_IDS.connectorReferencesResolved,
    member.connectorIds,
    connectorsById,
    {
      skipExplanation:
        "Connector validation was skipped because no connector artifacts were provided.",
      emptyExplanation: `Structural member ${member.id} has no connector references to validate.`,
      passExplanation: `Structural member ${member.id} references existing connectors.`,
      relationshipLabel: "connectors",
      severity: "warning",
      quantityImpacts: [
        {
          quantityKey: STRUCTURAL_MEMBER_QUANTITY_KEYS.material,
          description:
            "Member material takeoff may still proceed without connector resolution.",
          canCalculate: true,
        },
      ],
      reviewStatus: "review-recommended",
      blockingStatus: "not-blocked",
      targetProperty: "connectorIds",
      actionInstruction:
        "Confirm the connectors associated with this structural member.",
    },
  );
}

export function validateStructuralMembers(
  input: StructuralMembersValidationInput,
): ValidationBatch {
  const batches: ValidationBatch[] = [];

  for (const member of input.payload.structuralMembers) {
    batches.push(
      validateCategoryResolved(member),
      validateMaterialResolved(member),
      validateSizeResolved(member),
      validateLengthResolved(member),
      validatePlyCountResolved(member),
      validateAssociatedObjectsResolved(member, input.relatedObjectsById),
      validateSupportedObjectsResolved(member, input.relatedObjectsById),
      validateSupportingObjectsResolved(member, input.relatedObjectsById),
      validateConnectorReferencesResolved(member, input.connectorsById),
    );
  }

  return mergeValidationBatches(...batches);
}
