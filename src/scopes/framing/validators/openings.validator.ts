import type { ObjectId } from "../../../core/schemas/identity.schema.js";
import type { Opening } from "../schemas/opening.schema.js";
import type { OpeningsPayload } from "../schemas/framing-artifacts.schema.js";
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
  OPENING_QUANTITY_KEYS,
  OPENINGS_RULE_IDS,
} from "./rule-ids.js";
import type { ValidationBatch } from "./types.js";

export type OpeningsParentObject = {
  objectId: ObjectId;
  objectType: string;
};

export type OpeningsValidationInput = {
  payload: OpeningsPayload;
  parentObjectsById?: ReadonlyMap<ObjectId, OpeningsParentObject>;
  structuralMembersById?: ReadonlyMap<ObjectId, OpeningsParentObject>;
};

function isNominalWidthResolved(opening: Opening): boolean {
  return (
    opening.dimensions.nominalWidthFeet !== null ||
    isPropertyResolved(opening.resolutionTraces, "dimensions.nominalWidthFeet")
  );
}

function isNominalHeightResolved(opening: Opening): boolean {
  return (
    opening.dimensions.nominalHeightFeet !== null ||
    isPropertyResolved(opening.resolutionTraces, "dimensions.nominalHeightFeet")
  );
}

function isRoughWidthResolved(opening: Opening): boolean {
  return (
    opening.dimensions.roughWidthFeet !== null ||
    isPropertyResolved(opening.resolutionTraces, "dimensions.roughWidthFeet")
  );
}

function isRoughHeightResolved(opening: Opening): boolean {
  return (
    opening.dimensions.roughHeightFeet !== null ||
    isPropertyResolved(opening.resolutionTraces, "dimensions.roughHeightFeet")
  );
}

function validateParentResolved(
  opening: Opening,
  parentObjectsById: ReadonlyMap<ObjectId, OpeningsParentObject> | undefined,
): ValidationBatch {
  const target = createObjectTarget(opening.id, opening.objectType);
  const ruleId = OPENINGS_RULE_IDS.parentResolved;
  const evidenceIds = collectEvidenceIds(opening);

  if (parentObjectsById === undefined) {
    return buildSkippedBatch(
      ruleId,
      "relationship",
      target,
      "Parent object validation was skipped because no parent artifacts were provided.",
      evidenceIds,
    );
  }

  if (parentObjectsById.has(opening.parentObjectId)) {
    return buildPassedBatch(
      ruleId,
      "relationship",
      target,
      `Opening ${opening.id} references an existing parent object.`,
      evidenceIds,
    );
  }

  const quantityImpacts = [
    {
      quantityKey: OPENING_QUANTITY_KEYS.framing,
      description: "Opening framing requires a valid parent object.",
      canCalculate: false,
    },
    {
      quantityKey: OPENING_QUANTITY_KEYS.header,
      description: "Header takeoff requires a valid parent object.",
      canCalculate: false,
    },
  ];

  const explanation = `Opening ${opening.id} references missing parent object ${opening.parentObjectId}.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "relationship",
      severity: "critical",
      ruleViolated: "Opening parent object must reference an existing object.",
      explanation,
      target,
      recommendedUserAction:
        "Confirm the wall, floor, roof, or other parent object for this opening.",
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Resolve parent object for opening ${opening.id}`,
      description: explanation,
      action: {
        type: "provide-value",
        instruction:
          "Identify the parent object that owns this opening before takeoff continues.",
        targetProperty: "parentObjectId",
      },
      reviewStatus: "review-required",
      blockingStatus: "blocked",
      affectedObjects: [{ objectId: opening.id, objectType: opening.objectType }],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds,
    },
  );
}

function validateParentWallResolved(
  opening: Opening,
  parentObjectsById: ReadonlyMap<ObjectId, OpeningsParentObject> | undefined,
): ValidationBatch {
  const target = createObjectTarget(opening.id, opening.objectType);
  const ruleId = OPENINGS_RULE_IDS.parentWallResolved;
  const evidenceIds = collectEvidenceIds(opening);

  if (opening.parentWallId === null) {
    return buildPassedBatch(
      ruleId,
      "relationship",
      target,
      `Opening ${opening.id} has no explicit parent wall reference to validate.`,
      evidenceIds,
    );
  }

  if (parentObjectsById === undefined) {
    return buildSkippedBatch(
      ruleId,
      "relationship",
      target,
      "Parent wall validation was skipped because no parent artifacts were provided.",
      evidenceIds,
    );
  }

  if (parentObjectsById.has(opening.parentWallId)) {
    return buildPassedBatch(
      ruleId,
      "relationship",
      target,
      `Opening ${opening.id} references an existing parent wall.`,
      evidenceIds,
    );
  }

  const quantityImpacts = [
    {
      quantityKey: OPENING_QUANTITY_KEYS.framing,
      description: "Opening framing requires a valid parent wall association.",
      canCalculate: false,
    },
  ];

  const explanation = `Opening ${opening.id} references missing parent wall ${opening.parentWallId}.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "relationship",
      severity: "critical",
      ruleViolated: "Opening parent wall must reference an existing wall.",
      explanation,
      target,
      recommendedUserAction:
        "Confirm the parent wall associated with this opening.",
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Resolve parent wall for opening ${opening.id}`,
      description: explanation,
      action: {
        type: "provide-value",
        instruction: "Confirm the parent wall for this opening.",
        targetProperty: "parentWallId",
      },
      reviewStatus: "review-required",
      blockingStatus: "blocked",
      affectedObjects: [{ objectId: opening.id, objectType: opening.objectType }],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds,
    },
  );
}

function validateCategoryResolved(opening: Opening): ValidationBatch {
  const target = createObjectTarget(opening.id, opening.objectType);
  const ruleId = OPENINGS_RULE_IDS.categoryResolved;
  const evidenceIds = collectEvidenceIds(opening);

  if (opening.category !== "unknown") {
    return buildPassedBatch(
      ruleId,
      "object",
      target,
      `Opening ${opening.id} has a resolved category.`,
      evidenceIds,
    );
  }

  const quantityImpacts = [
    {
      quantityKey: OPENING_QUANTITY_KEYS.framing,
      description: "Opening framing depends on a resolved opening category.",
      canCalculate: false,
    },
  ];

  const explanation = `Opening ${opening.id} has unresolved category classification.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "object",
      severity: "critical",
      ruleViolated: "Opening category must be resolved before material takeoff.",
      explanation,
      target,
      recommendedUserAction:
        "Confirm whether this opening is a door, window, or other supported category.",
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Resolve category for opening ${opening.id}`,
      description: explanation,
      action: {
        type: "select-option",
        instruction: "Select the correct opening category for this opening.",
        targetProperty: "category",
      },
      reviewStatus: "review-required",
      blockingStatus: "blocked",
      affectedObjects: [{ objectId: opening.id, objectType: opening.objectType }],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds,
    },
  );
}

function validateNominalDimensionsResolved(opening: Opening): ValidationBatch {
  const target = createObjectTarget(opening.id, opening.objectType);
  const ruleId = OPENINGS_RULE_IDS.nominalDimensionsResolved;
  const evidenceIds = collectEvidenceIds(opening);
  const widthResolved = isNominalWidthResolved(opening);
  const heightResolved = isNominalHeightResolved(opening);

  if (widthResolved && heightResolved) {
    return buildPassedBatch(
      ruleId,
      "object",
      target,
      `Opening ${opening.id} has resolved nominal dimensions.`,
      evidenceIds,
    );
  }

  const missing: string[] = [];
  if (!widthResolved) {
    missing.push("nominal width");
  }
  if (!heightResolved) {
    missing.push("nominal height");
  }

  const quantityImpacts = [
    {
      quantityKey: OPENING_QUANTITY_KEYS.framing,
      description: "Opening framing quantities require nominal dimensions.",
      canCalculate: false,
    },
    {
      quantityKey: OPENING_QUANTITY_KEYS.header,
      description: "Header sizing requires nominal opening dimensions.",
      canCalculate: false,
    },
  ];

  const explanation = `Opening ${opening.id} is missing ${missing.join(" and ")}.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "object",
      severity: "critical",
      ruleViolated: "Opening nominal dimensions must be resolved.",
      explanation,
      target,
      recommendedUserAction:
        "Confirm nominal opening dimensions from plans or schedules.",
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Resolve nominal dimensions for opening ${opening.id}`,
      description: explanation,
      action: {
        type: "provide-value",
        instruction: "Provide the nominal opening width and height.",
        targetProperty: "dimensions",
      },
      reviewStatus: "review-required",
      blockingStatus: "blocked",
      affectedObjects: [{ objectId: opening.id, objectType: opening.objectType }],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds,
    },
  );
}

function validateRoughDimensionsResolved(opening: Opening): ValidationBatch {
  const target = createObjectTarget(opening.id, opening.objectType);
  const ruleId = OPENINGS_RULE_IDS.roughDimensionsResolved;
  const evidenceIds = collectEvidenceIds(opening);
  const widthResolved = isRoughWidthResolved(opening);
  const heightResolved = isRoughHeightResolved(opening);

  if (widthResolved && heightResolved) {
    return buildPassedBatch(
      ruleId,
      "object",
      target,
      `Opening ${opening.id} has resolved rough opening dimensions.`,
      evidenceIds,
    );
  }

  const nominalComplete =
    isNominalWidthResolved(opening) && isNominalHeightResolved(opening);

  const missing: string[] = [];
  if (!widthResolved) {
    missing.push("rough width");
  }
  if (!heightResolved) {
    missing.push("rough height");
  }

  const quantityImpacts = nominalComplete
    ? [
        {
          quantityKey: OPENING_QUANTITY_KEYS.framing,
          description:
            "Nominal dimensions may still support partial opening framing takeoff.",
          canCalculate: true,
        },
      ]
    : [
        {
          quantityKey: OPENING_QUANTITY_KEYS.framing,
          description:
            "Rough opening dimensions remain unresolved without nominal fallback.",
          canCalculate: false,
        },
      ];

  const explanation = `Opening ${opening.id} is missing ${missing.join(" and ")}.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "object",
      severity: "warning",
      ruleViolated:
        "Rough opening dimensions should be resolved or explicitly flagged.",
      explanation,
      target,
      recommendedUserAction:
        "Confirm rough opening dimensions from schedules or details.",
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Resolve rough opening for ${opening.id}`,
      description: explanation,
      action: {
        type: "provide-value",
        instruction: "Provide rough opening width and height when available.",
        targetProperty: "dimensions",
      },
      reviewStatus: nominalComplete ? "review-recommended" : "review-required",
      blockingStatus: nominalComplete ? "not-blocked" : "blocked",
      affectedObjects: [{ objectId: opening.id, objectType: opening.objectType }],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds,
    },
  );
}

function validateHeaderReferenceResolved(
  opening: Opening,
  structuralMembersById:
    | ReadonlyMap<ObjectId, OpeningsParentObject>
    | undefined,
): ValidationBatch {
  const target = createObjectTarget(opening.id, opening.objectType);
  const ruleId = OPENINGS_RULE_IDS.headerReferenceResolved;
  const evidenceIds = collectEvidenceIds(opening);

  if (opening.headerMemberId === null) {
    return buildPassedBatch(
      ruleId,
      "relationship",
      target,
      `Opening ${opening.id} has no header member reference to validate.`,
      evidenceIds,
    );
  }

  if (structuralMembersById === undefined) {
    return buildSkippedBatch(
      ruleId,
      "relationship",
      target,
      "Header member validation was skipped because no structural member artifacts were provided.",
      evidenceIds,
    );
  }

  if (structuralMembersById.has(opening.headerMemberId)) {
    return buildPassedBatch(
      ruleId,
      "relationship",
      target,
      `Opening ${opening.id} references an existing header member.`,
      evidenceIds,
    );
  }

  const quantityImpacts = [
    {
      quantityKey: OPENING_QUANTITY_KEYS.header,
      description: "Header takeoff requires a valid structural member reference.",
      canCalculate: false,
    },
  ];

  const explanation = `Opening ${opening.id} references missing header member ${opening.headerMemberId}.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "relationship",
      severity: "critical",
      ruleViolated: "Opening header member reference must resolve when present.",
      explanation,
      target,
      recommendedUserAction:
        "Confirm the header member associated with this opening.",
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Resolve header member for opening ${opening.id}`,
      description: explanation,
      action: {
        type: "provide-value",
        instruction: "Confirm the header member ID for this opening.",
        targetProperty: "headerMemberId",
      },
      reviewStatus: "review-required",
      blockingStatus: "blocked",
      affectedObjects: [{ objectId: opening.id, objectType: opening.objectType }],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds,
    },
  );
}

export function validateOpenings(input: OpeningsValidationInput): ValidationBatch {
  const batches: ValidationBatch[] = [];

  for (const opening of input.payload.openings) {
    batches.push(
      validateParentResolved(opening, input.parentObjectsById),
      validateParentWallResolved(opening, input.parentObjectsById),
      validateCategoryResolved(opening),
      validateNominalDimensionsResolved(opening),
      validateRoughDimensionsResolved(opening),
      validateHeaderReferenceResolved(opening, input.structuralMembersById),
    );
  }

  return mergeValidationBatches(...batches);
}
