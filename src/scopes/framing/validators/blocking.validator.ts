import type { ObjectId } from "../../../core/schemas/identity.schema.js";
import type { Blocking } from "../schemas/blocking.schema.js";
import type { BlockingPayload } from "../schemas/framing-artifacts.schema.js";
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
  BLOCKING_QUANTITY_KEYS,
  BLOCKING_RULE_IDS,
} from "./rule-ids.js";
import type { RelatedObjectRef, ValidationBatch } from "./types.js";

export type BlockingValidationInput = {
  payload: BlockingPayload;
  relatedObjectsById?: ReadonlyMap<ObjectId, RelatedObjectRef>;
};

function isTypeResolved(blocking: Blocking): boolean {
  return (
    blocking.blockingType !== null ||
    isPropertyResolved(blocking.resolutionTraces, "blockingType")
  );
}

function isMaterialResolved(blocking: Blocking): boolean {
  return (
    blocking.material !== null ||
    isPropertyResolved(blocking.resolutionTraces, "material")
  );
}

function isSizeResolved(blocking: Blocking): boolean {
  return (
    blocking.size !== null ||
    isPropertyResolved(blocking.resolutionTraces, "size")
  );
}

function isLocationResolved(blocking: Blocking): boolean {
  return (
    blocking.location !== null ||
    isPropertyResolved(blocking.resolutionTraces, "location")
  );
}

function materialOnlyImpacts(description: string) {
  return [
    {
      quantityKey: BLOCKING_QUANTITY_KEYS.material,
      description,
      canCalculate: false,
    },
    {
      quantityKey: BLOCKING_QUANTITY_KEYS.quantity,
      description:
        "Blocking quantity may still be calculated without this material specification.",
      canCalculate: true,
    },
  ];
}

function validateTypeResolved(blocking: Blocking): ValidationBatch {
  const target = createObjectTarget(blocking.id, blocking.objectType);
  const ruleId = BLOCKING_RULE_IDS.typeResolved;
  const evidenceIds = collectEvidenceIds(blocking);

  if (isTypeResolved(blocking)) {
    return buildPassedBatch(
      ruleId,
      "object",
      target,
      `Blocking ${blocking.id} has a resolved type.`,
      evidenceIds,
    );
  }

  const quantityImpacts = materialOnlyImpacts(
    "Blocking material takeoff requires a resolved blocking type.",
  );
  const explanation = `Blocking ${blocking.id} has unresolved type classification.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "object",
      severity: "critical",
      ruleViolated: "Blocking type must be resolved.",
      explanation,
      target,
      recommendedUserAction:
        "Confirm whether this is solid, panel, fire, rim, lateral, web, or squash blocking.",
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Resolve type for blocking ${blocking.id}`,
      description: explanation,
      action: {
        type: "provide-value",
        instruction: "Provide the blocking type.",
        targetProperty: "blockingType",
      },
      reviewStatus: "review-required",
      blockingStatus: "blocked",
      affectedObjects: [
        { objectId: blocking.id, objectType: blocking.objectType },
      ],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds,
    },
  );
}

function validateStructuralRoleResolved(blocking: Blocking): ValidationBatch {
  const target = createObjectTarget(blocking.id, blocking.objectType);
  const ruleId = BLOCKING_RULE_IDS.structuralRoleResolved;
  const evidenceIds = collectEvidenceIds(blocking);

  if (blocking.structuralRole !== "unknown") {
    return buildPassedBatch(
      ruleId,
      "object",
      target,
      `Blocking ${blocking.id} has a resolved structural role.`,
      evidenceIds,
    );
  }

  const quantityImpacts = [
    {
      quantityKey: BLOCKING_QUANTITY_KEYS.quantity,
      description:
        "Blocking quantity may still be calculated while structural role is reviewed.",
      canCalculate: true,
    },
    {
      quantityKey: BLOCKING_QUANTITY_KEYS.material,
      description:
        "Blocking material specification may still be known while structural role is reviewed.",
      canCalculate: true,
    },
  ];
  const explanation = `Blocking ${blocking.id} has unresolved structural role.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "object",
      severity: "warning",
      ruleViolated: "Blocking structural role should be resolved.",
      explanation,
      target,
      recommendedUserAction:
        "Confirm whether this blocking is structural or non-structural.",
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Resolve structural role for blocking ${blocking.id}`,
      description: explanation,
      action: {
        type: "select-option",
        instruction: "Select whether this blocking is structural or non-structural.",
        targetProperty: "structuralRole",
      },
      reviewStatus: "review-recommended",
      blockingStatus: "not-blocked",
      affectedObjects: [
        { objectId: blocking.id, objectType: blocking.objectType },
      ],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds,
    },
  );
}

function validateMaterialResolved(blocking: Blocking): ValidationBatch {
  const target = createObjectTarget(blocking.id, blocking.objectType);
  const ruleId = BLOCKING_RULE_IDS.materialResolved;
  const evidenceIds = collectEvidenceIds(blocking);

  if (isMaterialResolved(blocking)) {
    return buildPassedBatch(
      ruleId,
      "object",
      target,
      `Blocking ${blocking.id} has resolved material.`,
      evidenceIds,
    );
  }

  const quantityImpacts = materialOnlyImpacts(
    "Blocking material takeoff requires a resolved material.",
  );
  const explanation = `Blocking ${blocking.id} is missing material.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "object",
      severity: "critical",
      ruleViolated: "Blocking material must be resolved.",
      explanation,
      target,
      recommendedUserAction:
        "Confirm blocking material from notes, details, or schedules.",
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Resolve material for blocking ${blocking.id}`,
      description: explanation,
      action: {
        type: "provide-value",
        instruction: "Provide the blocking material.",
        targetProperty: "material",
      },
      reviewStatus: "review-required",
      blockingStatus: "blocked",
      affectedObjects: [
        { objectId: blocking.id, objectType: blocking.objectType },
      ],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds,
    },
  );
}

function validateSizeResolved(blocking: Blocking): ValidationBatch {
  const target = createObjectTarget(blocking.id, blocking.objectType);
  const ruleId = BLOCKING_RULE_IDS.sizeResolved;
  const evidenceIds = collectEvidenceIds(blocking);

  if (isSizeResolved(blocking)) {
    return buildPassedBatch(
      ruleId,
      "object",
      target,
      `Blocking ${blocking.id} has resolved size.`,
      evidenceIds,
    );
  }

  const quantityImpacts = materialOnlyImpacts(
    "Blocking material takeoff requires a resolved size.",
  );
  const explanation = `Blocking ${blocking.id} is missing size.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "object",
      severity: "critical",
      ruleViolated: "Blocking size must be resolved.",
      explanation,
      target,
      recommendedUserAction:
        "Confirm blocking size from details, notes, or associated member size.",
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Resolve size for blocking ${blocking.id}`,
      description: explanation,
      action: {
        type: "provide-value",
        instruction: "Provide the blocking size.",
        targetProperty: "size",
      },
      reviewStatus: "review-required",
      blockingStatus: "blocked",
      affectedObjects: [
        { objectId: blocking.id, objectType: blocking.objectType },
      ],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds,
    },
  );
}

function validateLocationResolved(blocking: Blocking): ValidationBatch {
  const target = createObjectTarget(blocking.id, blocking.objectType);
  const ruleId = BLOCKING_RULE_IDS.locationResolved;
  const evidenceIds = collectEvidenceIds(blocking);

  if (isLocationResolved(blocking)) {
    return buildPassedBatch(
      ruleId,
      "object",
      target,
      `Blocking ${blocking.id} has a resolved location.`,
      evidenceIds,
    );
  }

  const quantityImpacts = [
    {
      quantityKey: BLOCKING_QUANTITY_KEYS.quantity,
      description: "Blocking quantity takeoff requires a resolved location.",
      canCalculate: false,
    },
    {
      quantityKey: BLOCKING_QUANTITY_KEYS.material,
      description:
        "Blocking material specification may still be known without location.",
      canCalculate: true,
    },
  ];
  const explanation = `Blocking ${blocking.id} is missing location.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "object",
      severity: "critical",
      ruleViolated: "Blocking location must be resolved.",
      explanation,
      target,
      recommendedUserAction:
        "Confirm where this blocking occurs from details or associated assemblies.",
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Resolve location for blocking ${blocking.id}`,
      description: explanation,
      action: {
        type: "provide-value",
        instruction: "Provide the blocking location.",
        targetProperty: "location",
      },
      reviewStatus: "review-required",
      blockingStatus: "blocked",
      affectedObjects: [
        { objectId: blocking.id, objectType: blocking.objectType },
      ],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds,
    },
  );
}

function validateAssociatedObjectsResolved(
  blocking: Blocking,
  relatedObjectsById: ReadonlyMap<ObjectId, RelatedObjectRef> | undefined,
): ValidationBatch {
  const target = createObjectTarget(blocking.id, blocking.objectType);
  const ruleId = BLOCKING_RULE_IDS.associatedObjectsResolved;
  const evidenceIds = collectEvidenceIds(blocking);

  if (blocking.associatedObjectIds.length === 0) {
    return buildPassedBatch(
      ruleId,
      "relationship",
      target,
      `Blocking ${blocking.id} has no associated object references to validate.`,
      evidenceIds,
    );
  }

  if (relatedObjectsById === undefined) {
    return buildSkippedBatch(
      ruleId,
      "relationship",
      target,
      "Associated object validation was skipped because no related artifacts were provided.",
      evidenceIds,
    );
  }

  const missingIds = blocking.associatedObjectIds.filter(
    (id) => !relatedObjectsById.has(id),
  );

  if (missingIds.length === 0) {
    return buildPassedBatch(
      ruleId,
      "relationship",
      target,
      `Blocking ${blocking.id} references existing associated objects.`,
      evidenceIds,
    );
  }

  const quantityImpacts = [
    {
      quantityKey: BLOCKING_QUANTITY_KEYS.quantity,
      description:
        "Blocking quantity may still be calculated from explicit location.",
      canCalculate: true,
    },
  ];
  const explanation = `Blocking ${blocking.id} references missing associated objects: ${missingIds.join(", ")}.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "relationship",
      severity: "warning",
      ruleViolated:
        "Blocking associated objects must reference existing objects.",
      explanation,
      target,
      recommendedUserAction:
        "Confirm the assemblies associated with this blocking.",
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Resolve associated objects for blocking ${blocking.id}`,
      description: explanation,
      action: {
        type: "provide-value",
        instruction:
          "Confirm the walls, floors, roofs, members, or sheathing associated with this blocking.",
        targetProperty: "associatedObjectIds",
      },
      reviewStatus: "review-recommended",
      blockingStatus: "not-blocked",
      affectedObjects: [
        { objectId: blocking.id, objectType: blocking.objectType },
      ],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds,
    },
  );
}

export function validateBlocking(
  input: BlockingValidationInput,
): ValidationBatch {
  const batches: ValidationBatch[] = [];

  for (const blocking of input.payload.blocking) {
    batches.push(
      validateTypeResolved(blocking),
      validateStructuralRoleResolved(blocking),
      validateMaterialResolved(blocking),
      validateSizeResolved(blocking),
      validateLocationResolved(blocking),
      validateAssociatedObjectsResolved(blocking, input.relatedObjectsById),
    );
  }

  return mergeValidationBatches(...batches);
}
