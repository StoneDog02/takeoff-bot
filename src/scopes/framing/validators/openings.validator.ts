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

const KING_STUD_ELIGIBLE_CATEGORIES = new Set<Opening["category"]>([
  "door",
  "window",
  "cased",
]);

const ROUGH_SILL_ELIGIBLE_CATEGORIES = new Set<Opening["category"]>(["window"]);

function crippleLayoutQuantityImpacts(
  opening: Opening,
  canCalculate: boolean,
): Array<{
  quantityKey: string;
  description: string;
  canCalculate: boolean;
}> {
  const impacts = [];

  if (
    opening.category === "window" ||
    (opening.category === "cased" &&
      opening.headerMemberId !== null &&
      isRoughHeightResolved(opening))
  ) {
    impacts.push({
      quantityKey: OPENING_QUANTITY_KEYS.cripplesAbove,
      description: canCalculate
        ? "Cripple stud count above header uses layout continuation from rough opening width."
        : "Cripple stud count above header requires resolved rough opening width and wall stud spacing.",
      canCalculate,
    });
  }

  if (opening.category === "window") {
    impacts.push({
      quantityKey: OPENING_QUANTITY_KEYS.cripplesBelow,
      description: canCalculate
        ? "Cripple stud count below sill uses layout continuation from rough opening width."
        : "Cripple stud count below sill requires resolved rough opening width and wall stud spacing.",
      canCalculate,
    });
  }

  return impacts;
}

function isCrippleLayoutEligible(opening: Opening): boolean {
  if (opening.category === "window") {
    return true;
  }

  return (
    opening.category === "cased" &&
    opening.headerMemberId !== null &&
    isRoughHeightResolved(opening)
  );
}

function roughSillQuantityImpact(widthResolved: boolean) {
  return {
    quantityKey: OPENING_QUANTITY_KEYS.roughSill,
    description: widthResolved
      ? "Rough sill linear footage uses resolved rough opening width."
      : "Rough sill takeoff requires resolved rough opening width.",
    canCalculate: widthResolved,
  };
}

function isQuantityResolved(opening: Opening): boolean {
  if (opening.quantity === null) {
    return false;
  }

  const trace = opening.resolutionTraces.find(
    (entry) => entry.propertyPath === "quantity",
  );
  if (trace?.method === "unresolved") {
    return false;
  }

  return true;
}

function isKingStudCountExplicitlyResolved(opening: Opening): boolean {
  if (opening.kingStudCount === null) {
    return false;
  }

  const trace = opening.resolutionTraces.find(
    (entry) => entry.propertyPath === "kingStudCount",
  );
  if (trace?.method === "unresolved") {
    return false;
  }

  return true;
}

function isJackStudCountExplicitlyResolved(opening: Opening): boolean {
  if (opening.jackStudCount === null) {
    return false;
  }

  const trace = opening.resolutionTraces.find(
    (entry) => entry.propertyPath === "jackStudCount",
  );
  if (trace?.method === "unresolved") {
    return false;
  }

  return true;
}

function validateParentResolved(
  opening: Opening,
  parentObjectsById: ReadonlyMap<ObjectId, OpeningsParentObject> | undefined,
): ValidationBatch {
  const target = createObjectTarget(opening.id, opening.objectType);
  const ruleId = OPENINGS_RULE_IDS.parentResolved;
  const evidenceIds = collectEvidenceIds(opening);

  if (opening.parentObjectId === null) {
    return buildPassedBatch(
      ruleId,
      "relationship",
      target,
      `Opening ${opening.id} has no explicit parent object reference to validate.`,
      evidenceIds,
    );
  }

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
        roughSillQuantityImpact(widthResolved),
      ]
    : [
        {
          quantityKey: OPENING_QUANTITY_KEYS.framing,
          description:
            "Rough opening dimensions remain unresolved without nominal fallback.",
          canCalculate: false,
        },
        roughSillQuantityImpact(widthResolved),
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

function validateQuantityResolved(opening: Opening): ValidationBatch {
  const target = createObjectTarget(opening.id, opening.objectType);
  const ruleId = OPENINGS_RULE_IDS.quantityResolved;
  const evidenceIds = collectEvidenceIds(opening);

  if (isQuantityResolved(opening)) {
    return buildPassedBatch(
      ruleId,
      "object",
      target,
      `Opening ${opening.id} has resolved quantity.`,
      evidenceIds,
    );
  }

  const quantityImpacts = [
    {
      quantityKey: OPENING_QUANTITY_KEYS.framing,
      description:
        "Opening framing quantities require a resolved occurrence count.",
      canCalculate: false,
    },
    {
      quantityKey: OPENING_QUANTITY_KEYS.kingStuds,
      description:
        "King stud takeoff requires a resolved opening occurrence count.",
      canCalculate: false,
    },
    {
      quantityKey: OPENING_QUANTITY_KEYS.roughSill,
      description:
        "Rough sill takeoff requires a resolved opening occurrence count.",
      canCalculate: false,
    },
    {
      quantityKey: OPENING_QUANTITY_KEYS.cripplesAbove,
      description:
        "Cripple stud count above header requires a resolved opening occurrence count.",
      canCalculate: false,
    },
    {
      quantityKey: OPENING_QUANTITY_KEYS.cripplesBelow,
      description:
        "Cripple stud count below sill requires a resolved opening occurrence count.",
      canCalculate: false,
    },
  ];

  const explanation = `Opening ${opening.id} is missing quantity or occurrence count.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "object",
      severity: "critical",
      ruleViolated:
        "Opening quantity must be resolved before opening-framing quantities can be calculated.",
      explanation,
      target,
      recommendedUserAction:
        "Confirm how many identical opening occurrences this object represents.",
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Resolve quantity for opening ${opening.id}`,
      description: explanation,
      action: {
        type: "provide-value",
        instruction:
          "Provide the opening occurrence count from plans, schedules, or notes.",
        targetProperty: "quantity",
      },
      reviewStatus: "review-required",
      blockingStatus: "blocked",
      affectedObjects: [{ objectId: opening.id, objectType: opening.objectType }],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds,
    },
  );
}

function validateJackStudCountResolved(opening: Opening): ValidationBatch {
  const target = createObjectTarget(opening.id, opening.objectType);
  const ruleId = OPENINGS_RULE_IDS.jackStudCountResolved;
  const evidenceIds = collectEvidenceIds(opening);

  if (!KING_STUD_ELIGIBLE_CATEGORIES.has(opening.category)) {
    return buildSkippedBatch(
      ruleId,
      "object",
      target,
      `Opening ${opening.id} category does not use jack stud count validation.`,
      evidenceIds,
    );
  }

  if (!isQuantityResolved(opening)) {
    return buildSkippedBatch(
      ruleId,
      "object",
      target,
      `Jack stud count validation skipped until opening quantity resolves.`,
      evidenceIds,
    );
  }

  if (opening.parentObjectId === null) {
    return buildSkippedBatch(
      ruleId,
      "object",
      target,
      `Jack stud count validation skipped until opening parent segment resolves.`,
      evidenceIds,
    );
  }

  if (isJackStudCountExplicitlyResolved(opening)) {
    return buildPassedBatch(
      ruleId,
      "object",
      target,
      `Opening ${opening.id} has explicit jack stud count evidence.`,
      evidenceIds,
    );
  }

  // Brain: create review when linked header exists but jack count evidence is
  // missing. Without a header link, jack quantity stays NOT CALCULABLE silently.
  if (opening.headerMemberId === null) {
    return buildSkippedBatch(
      ruleId,
      "object",
      target,
      `Jack stud count validation skipped until a linked header makes jacks expected.`,
      evidenceIds,
    );
  }

  const quantityImpacts = [
    {
      quantityKey: OPENING_QUANTITY_KEYS.jackStuds,
      description:
        "Jack stud count requires explicit project evidence; quantity cannot calculate.",
      canCalculate: false,
    },
  ];

  const explanation = `Opening ${opening.id} has a linked header but no explicit jack/trimmer stud count.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "object",
      severity: "warning",
      ruleViolated:
        "Jack stud count must be explicit project evidence when calculable.",
      explanation,
      target,
      recommendedUserAction:
        "Confirm jack/trimmer stud count from plans, schedules, or header details.",
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Resolve jack stud count for opening ${opening.id}`,
      description: explanation,
      action: {
        type: "provide-value",
        instruction:
          "Provide the explicit jack/trimmer stud count for this opening occurrence.",
        targetProperty: "jackStudCount",
      },
      reviewStatus: "review-required",
      blockingStatus: "not-blocked",
      affectedObjects: [{ objectId: opening.id, objectType: opening.objectType }],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds,
    },
  );
}

function validateKingStudCountDefault(opening: Opening): ValidationBatch {
  const target = createObjectTarget(opening.id, opening.objectType);
  const ruleId = OPENINGS_RULE_IDS.kingStudCountDefault;
  const evidenceIds = collectEvidenceIds(opening);

  if (!KING_STUD_ELIGIBLE_CATEGORIES.has(opening.category)) {
    return buildSkippedBatch(
      ruleId,
      "object",
      target,
      `Opening ${opening.id} category does not use king stud default validation.`,
      evidenceIds,
    );
  }

  if (!isQuantityResolved(opening)) {
    return buildSkippedBatch(
      ruleId,
      "object",
      target,
      `King stud default validation skipped until opening quantity resolves.`,
      evidenceIds,
    );
  }

  if (opening.parentObjectId === null) {
    return buildSkippedBatch(
      ruleId,
      "object",
      target,
      `King stud default validation skipped until opening parent segment resolves.`,
      evidenceIds,
    );
  }

  if (isKingStudCountExplicitlyResolved(opening)) {
    return buildPassedBatch(
      ruleId,
      "object",
      target,
      `Opening ${opening.id} has explicit king stud count evidence.`,
      evidenceIds,
    );
  }

  const quantityImpacts = [
    {
      quantityKey: OPENING_QUANTITY_KEYS.kingStuds,
      description:
        "King stud count will use the Construction Brain industry default of 2 per occurrence.",
      canCalculate: true,
    },
  ];

  const explanation = `Opening ${opening.id} has no explicit king stud count; industry default may apply.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "object",
      severity: "warning",
      ruleViolated:
        "King stud count should be confirmed when explicit project evidence is absent.",
      explanation,
      target,
      recommendedUserAction:
        "Confirm king stud count from plans or accept the industry default of 2 per occurrence.",
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Confirm king stud count for opening ${opening.id}`,
      description: explanation,
      action: {
        type: "provide-value",
        instruction:
          "Provide explicit king stud count evidence or confirm the industry default of 2.",
        targetProperty: "kingStudCount",
      },
      reviewStatus: "review-recommended",
      blockingStatus: "not-blocked",
      affectedObjects: [{ objectId: opening.id, objectType: opening.objectType }],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds,
    },
  );
}

function validateRoughSillSizeDefault(opening: Opening): ValidationBatch {
  const target = createObjectTarget(opening.id, opening.objectType);
  const ruleId = OPENINGS_RULE_IDS.roughSillSizeDefault;
  const evidenceIds = collectEvidenceIds(opening);

  if (!ROUGH_SILL_ELIGIBLE_CATEGORIES.has(opening.category)) {
    return buildSkippedBatch(
      ruleId,
      "object",
      target,
      `Opening ${opening.id} category does not use rough sill size default validation.`,
      evidenceIds,
    );
  }

  if (!isQuantityResolved(opening)) {
    return buildSkippedBatch(
      ruleId,
      "object",
      target,
      `Rough sill size default validation skipped until opening quantity resolves.`,
      evidenceIds,
    );
  }

  if (opening.parentObjectId === null) {
    return buildSkippedBatch(
      ruleId,
      "object",
      target,
      `Rough sill size default validation skipped until opening parent segment resolves.`,
      evidenceIds,
    );
  }

  if (!isRoughWidthResolved(opening)) {
    return buildSkippedBatch(
      ruleId,
      "object",
      target,
      `Rough sill size default validation skipped until rough opening width resolves.`,
      evidenceIds,
    );
  }

  const quantityImpacts = [
    {
      quantityKey: OPENING_QUANTITY_KEYS.roughSill,
      description:
        "Rough sill size will inherit the parent wall stud size when explicit sill size is absent.",
      canCalculate: true,
    },
  ];

  const explanation = `Opening ${opening.id} has no explicit rough sill size; wall stud size may apply.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "object",
      severity: "warning",
      ruleViolated:
        "Rough sill size should be confirmed when explicit project evidence is absent.",
      explanation,
      target,
      recommendedUserAction:
        "Confirm rough sill size from plans or accept inheritance from the parent wall stud size.",
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Confirm rough sill size for opening ${opening.id}`,
      description: explanation,
      action: {
        type: "provide-value",
        instruction:
          "Provide explicit rough sill size evidence or confirm inheritance from the parent wall stud size.",
        targetProperty: "roughSillSize",
      },
      reviewStatus: "review-recommended",
      blockingStatus: "not-blocked",
      affectedObjects: [{ objectId: opening.id, objectType: opening.objectType }],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds,
    },
  );
}

function validateCrippleLayoutDefault(opening: Opening): ValidationBatch {
  const target = createObjectTarget(opening.id, opening.objectType);
  const ruleId = OPENINGS_RULE_IDS.crippleLayoutDefault;
  const evidenceIds = collectEvidenceIds(opening);

  if (!isCrippleLayoutEligible(opening)) {
    return buildSkippedBatch(
      ruleId,
      "object",
      target,
      `Opening ${opening.id} category does not use cripple layout default validation.`,
      evidenceIds,
    );
  }

  if (!isQuantityResolved(opening)) {
    return buildSkippedBatch(
      ruleId,
      "object",
      target,
      `Cripple layout default validation skipped until opening quantity resolves.`,
      evidenceIds,
    );
  }

  if (opening.parentObjectId === null) {
    return buildSkippedBatch(
      ruleId,
      "object",
      target,
      `Cripple layout default validation skipped until opening parent segment resolves.`,
      evidenceIds,
    );
  }

  if (!isRoughWidthResolved(opening)) {
    return buildSkippedBatch(
      ruleId,
      "object",
      target,
      `Cripple layout default validation skipped until rough opening width resolves.`,
      evidenceIds,
    );
  }

  const quantityImpacts = crippleLayoutQuantityImpacts(opening, true);
  if (quantityImpacts.length === 0) {
    return buildSkippedBatch(
      ruleId,
      "object",
      target,
      `Opening ${opening.id} has no cripple layout quantity impacts.`,
      evidenceIds,
    );
  }

  const explanation = `Opening ${opening.id} will use layout-continuation cripple stud counts from rough opening width and wall stud spacing.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "object",
      severity: "warning",
      ruleViolated:
        "Cripple stud layout should be confirmed when explicit cripple count evidence is absent.",
      explanation,
      target,
      recommendedUserAction:
        "Confirm cripple stud layout from plans or accept layout continuation between king studs.",
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Confirm cripple stud layout for opening ${opening.id}`,
      description: explanation,
      action: {
        type: "confirm",
        instruction:
          "Confirm cripple stud layout continuation from rough opening width and wall stud spacing.",
        targetProperty: "crippleStudLayout",
      },
      reviewStatus: "review-recommended",
      blockingStatus: "not-blocked",
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
      validateQuantityResolved(opening),
      validateKingStudCountDefault(opening),
      validateJackStudCountResolved(opening),
      validateRoughSillSizeDefault(opening),
      validateCrippleLayoutDefault(opening),
    );
  }

  return mergeValidationBatches(...batches);
}
