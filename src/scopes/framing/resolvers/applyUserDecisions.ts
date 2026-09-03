import type {
  Evidence,
  EvidenceSubjectKind,
} from "../../../core/schemas/evidence.schema.js";
import type {
  EvidenceId,
  ObjectId,
  ReviewItemId,
  UserDecisionId,
} from "../../../core/schemas/identity.schema.js";
import type { PropertyResolutionTrace } from "../../../core/schemas/resolved-object.schema.js";
import type { ReviewItem } from "../../../core/schemas/review-item.schema.js";
import type { UserDecision } from "../../../core/schemas/user-decision.schema.js";
import { userDecisionSchema } from "../../../core/schemas/user-decision.schema.js";
import type { UserDecisionValue } from "../../../core/schemas/user-decision.schema.js";
import {
  isFloorAreaPropertyPath,
  isFloorSystemPropertyPath,
  normalizeFloorAreaCandidate,
  normalizeFloorSystemCandidate,
  type FloorAreaPropertyPath,
  type FloorSystemPropertyPath,
} from "./floorFramingPropertyPaths.js";
import {
  isOpeningPropertyPath,
  normalizeOpeningCandidate,
  type OpeningPropertyPath,
} from "./openingPropertyPaths.js";
import {
  isRoofPlanePropertyPath,
  isRoofSystemPropertyPath,
  normalizeRoofPlaneCandidate,
  normalizeRoofSystemCandidate,
  type RoofPlanePropertyPath,
  type RoofSystemPropertyPath,
} from "./roofFramingPropertyPaths.js";
import {
  isSheathingAreaPropertyPath,
  isSheathingSystemPropertyPath,
  normalizeSheathingAreaCandidate,
  normalizeSheathingSystemCandidate,
  type SheathingAreaPropertyPath,
  type SheathingSystemPropertyPath,
} from "./sheathingPropertyPaths.js";
import {
  isStructuralMemberPropertyPath,
  normalizeStructuralMemberCandidate,
  type StructuralMemberPropertyPath,
} from "./structuralMemberPropertyPaths.js";
import {
  isWallFramingPropertyPath,
  normalizeWallFramingCandidate,
  type WallFramingPropertyPath,
} from "./wallFramingPropertyPaths.js";
import { lookupAssumptionRegistryEntry } from "../assumptions/assumptionRegistry.js";
import { OPENING_QUANTITY_KEYS } from "../validators/rule-ids.js";

export type UserDecisionPropertyPath =
  | WallFramingPropertyPath
  | OpeningPropertyPath
  | FloorSystemPropertyPath
  | FloorAreaPropertyPath
  | RoofSystemPropertyPath
  | RoofPlanePropertyPath
  | SheathingSystemPropertyPath
  | SheathingAreaPropertyPath
  | StructuralMemberPropertyPath;

export type SubjectBinding = {
  subjectKey: string;
  subjectKind: EvidenceSubjectKind;
};

export type UserDecisionResolutionContext = {
  userDecisions: readonly UserDecision[];
  reviewItemsById: ReadonlyMap<ReviewItemId, ReviewItem>;
  evidenceById: ReadonlyMap<EvidenceId, Evidence>;
};

export type AppliedUserDecision = {
  decision: UserDecision;
  reviewItem: ReviewItem;
  objectId: ObjectId;
  propertyPath: UserDecisionPropertyPath;
  subjectKey: string;
  value: string | number | boolean;
  resolutionKind: "conflict-resolved" | "value-provided" | "confirmed";
  acceptedEvidenceIds: EvidenceId[];
  rejectedEvidenceIds: EvidenceId[];
};

export type UserDecisionIndex = ReadonlyMap<string, AppliedUserDecision>;

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueSortedIds(ids: readonly string[]): EvidenceId[] {
  return [...new Set(ids)].sort(compareIds) as EvidenceId[];
}

function decisionTargetKey(objectId: ObjectId, propertyPath: string): string {
  return `${objectId}\0${propertyPath}`;
}

function candidateKey(value: string | number | boolean): string {
  return `${typeof value}:${String(value)}`;
}

export function isUserDecisionPropertyPath(
  propertyPath: string,
): propertyPath is UserDecisionPropertyPath {
  return (
    isWallFramingPropertyPath(propertyPath) ||
    isOpeningPropertyPath(propertyPath) ||
    isFloorSystemPropertyPath(propertyPath) ||
    isFloorAreaPropertyPath(propertyPath) ||
    isRoofSystemPropertyPath(propertyPath) ||
    isRoofPlanePropertyPath(propertyPath) ||
    isSheathingSystemPropertyPath(propertyPath) ||
    isSheathingAreaPropertyPath(propertyPath) ||
    isStructuralMemberPropertyPath(propertyPath)
  );
}

export function normalizeUserDecisionCandidate(
  propertyPath: UserDecisionPropertyPath,
  candidateValue: Evidence["candidateValue"] | UserDecisionValue,
): string | number | boolean | undefined {
  if (isWallFramingPropertyPath(propertyPath)) {
    return normalizeWallFramingCandidate(propertyPath, candidateValue as Evidence["candidateValue"]);
  }
  if (isOpeningPropertyPath(propertyPath)) {
    return normalizeOpeningCandidate(propertyPath, candidateValue as Evidence["candidateValue"]);
  }
  if (isFloorSystemPropertyPath(propertyPath)) {
    return normalizeFloorSystemCandidate(propertyPath, candidateValue as Evidence["candidateValue"]);
  }
  if (isFloorAreaPropertyPath(propertyPath)) {
    return normalizeFloorAreaCandidate(propertyPath, candidateValue as Evidence["candidateValue"]);
  }
  if (isRoofSystemPropertyPath(propertyPath)) {
    return normalizeRoofSystemCandidate(propertyPath, candidateValue as Evidence["candidateValue"]);
  }
  if (isRoofPlanePropertyPath(propertyPath)) {
    return normalizeRoofPlaneCandidate(propertyPath, candidateValue as Evidence["candidateValue"]);
  }
  if (isSheathingSystemPropertyPath(propertyPath)) {
    return normalizeSheathingSystemCandidate(
      propertyPath,
      candidateValue as Evidence["candidateValue"],
    );
  }
  if (isSheathingAreaPropertyPath(propertyPath)) {
    return normalizeSheathingAreaCandidate(
      propertyPath,
      candidateValue as Evidence["candidateValue"],
    );
  }
  if (isStructuralMemberPropertyPath(propertyPath)) {
    return normalizeStructuralMemberCandidate(
      propertyPath,
      candidateValue as Evidence["candidateValue"],
    );
  }

  return undefined;
}

export function filterUserDecisionsForPropertyPaths(
  context: UserDecisionResolutionContext,
  isSupportedPropertyPath: (propertyPath: string) => boolean,
  knownObjectIds?: ReadonlySet<ObjectId>,
): UserDecisionResolutionContext {
  if (context.userDecisions.length === 0) {
    return context;
  }

  const filteredDecisions = context.userDecisions.filter((decision) => {
    const reviewItem = context.reviewItemsById.get(decision.reviewItemId);
    if (!reviewItem) {
      return false;
    }

    const propertyPath = reviewItem.action.targetProperty;
    if (propertyPath == null || !isSupportedPropertyPath(propertyPath)) {
      return false;
    }

    if (!knownObjectIds) {
      return true;
    }

    const objectId = reviewItem.affectedObjects[0]?.objectId;
    return objectId != null && knownObjectIds.has(objectId);
  });

  return {
    ...context,
    userDecisions: filteredDecisions,
  };
}

function assertScalarDecisionValue(
  value: UserDecisionValue,
  decisionId: UserDecisionId,
): string | number | boolean {
  if (value === null || typeof value === "object") {
    throw new Error(
      `User Decision ${decisionId} value must be a scalar for property resolution.`,
    );
  }

  return value;
}

function validateReviewItemTarget(
  reviewItem: ReviewItem,
  objectId: ObjectId,
  propertyPath: string,
): void {
  if (reviewItem.affectedObjects.length !== 1) {
    throw new Error(
      `Review Item ${reviewItem.id} must identify exactly one affected object for this slice.`,
    );
  }

  const affectedObject = reviewItem.affectedObjects[0]!;
  if (affectedObject.objectId !== objectId) {
    throw new Error(
      `Review Item ${reviewItem.id} targets object ${affectedObject.objectId}, not ${objectId}.`,
    );
  }

  const targetProperty = reviewItem.action.targetProperty;
  if (targetProperty !== propertyPath) {
    throw new Error(
      `Review Item ${reviewItem.id} targets property ${targetProperty ?? "null"}, not ${propertyPath}.`,
    );
  }
}

function validateEvidenceRecord(
  record: Evidence,
  binding: SubjectBinding,
  propertyPath: UserDecisionPropertyPath,
  evidenceId: EvidenceId,
  role: "accepted" | "rejected",
): string | number | boolean {
  if (record.subjectKind !== binding.subjectKind) {
    throw new Error(
      `${role} Evidence ${evidenceId} belongs to subjectKind ${record.subjectKind}, not ${binding.subjectKind}.`,
    );
  }

  if (record.subjectKey !== binding.subjectKey) {
    throw new Error(
      `${role} Evidence ${evidenceId} belongs to subject ${record.subjectKey}, not ${binding.subjectKey}.`,
    );
  }

  if (record.propertyPath !== propertyPath) {
    throw new Error(
      `${role} Evidence ${evidenceId} targets property ${record.propertyPath}, not ${propertyPath}.`,
    );
  }

  const normalized = normalizeUserDecisionCandidate(propertyPath, record.candidateValue);
  if (normalized === undefined) {
    throw new Error(
      `${role} Evidence ${evidenceId} does not provide a usable candidate for ${propertyPath}.`,
    );
  }

  return normalized;
}

function validateConflictResolvedDecision(
  decision: UserDecision,
  reviewItem: ReviewItem,
  objectId: ObjectId,
  propertyPath: UserDecisionPropertyPath,
  binding: SubjectBinding,
  evidenceById: ReadonlyMap<EvidenceId, Evidence>,
): AppliedUserDecision {
  userDecisionSchema.parse(decision);
  if (decision.result.type !== "conflict-resolved") {
    throw new Error(
      `User Decision ${decision.id} uses unsupported result type "${decision.result.type}" for conflict resolution.`,
    );
  }
  validateReviewItemTarget(reviewItem, objectId, propertyPath);

  const result = decision.result;
  const acceptedSet = new Set(result.acceptedEvidenceIds);
  const rejectedSet = new Set(result.rejectedEvidenceIds);

  if (result.acceptedEvidenceIds.length === 0) {
    throw new Error(
      `User Decision ${decision.id} must include at least one acceptedEvidenceId.`,
    );
  }

  if (result.acceptedEvidenceIds.some((evidenceId) => rejectedSet.has(evidenceId))) {
    throw new Error(
      `User Decision ${decision.id} cannot accept and reject the same Evidence ID.`,
    );
  }

  const acceptedValues = new Set<string>();
  for (const evidenceId of result.acceptedEvidenceIds) {
    const record = evidenceById.get(evidenceId);
    if (!record) {
      throw new Error(
        `User Decision ${decision.id} references missing accepted Evidence ${evidenceId}.`,
      );
    }

    const normalized = validateEvidenceRecord(
      record,
      binding,
      propertyPath,
      evidenceId,
      "accepted",
    );
    acceptedValues.add(candidateKey(normalized));
  }

  if (acceptedValues.size !== 1) {
    throw new Error(
      `User Decision ${decision.id} accepted Evidence must resolve to one candidate value.`,
    );
  }

  const selectedValue = [...acceptedValues][0]!;
  const scalarDecisionValue = assertScalarDecisionValue(result.value, decision.id);
  if (selectedValue !== candidateKey(scalarDecisionValue)) {
    throw new Error(
      `User Decision ${decision.id} value does not match accepted Evidence candidate value.`,
    );
  }

  const normalizedDecisionValue = normalizeUserDecisionCandidate(
    propertyPath,
    scalarDecisionValue,
  );
  if (normalizedDecisionValue === undefined) {
    throw new Error(
      `User Decision ${decision.id} value is not valid for property ${propertyPath}.`,
    );
  }

  for (const evidenceId of result.rejectedEvidenceIds) {
    const record = evidenceById.get(evidenceId);
    if (!record) {
      throw new Error(
        `User Decision ${decision.id} references missing rejected Evidence ${evidenceId}.`,
      );
    }

    validateEvidenceRecord(record, binding, propertyPath, evidenceId, "rejected");
  }

  return {
    decision,
    reviewItem,
    objectId,
    propertyPath,
    subjectKey: binding.subjectKey,
    value: normalizedDecisionValue,
    resolutionKind: "conflict-resolved",
    acceptedEvidenceIds: uniqueSortedIds(result.acceptedEvidenceIds),
    rejectedEvidenceIds: uniqueSortedIds(result.rejectedEvidenceIds),
  };
}

function validateValueProvidedDecision(
  decision: UserDecision,
  reviewItem: ReviewItem,
  objectId: ObjectId,
  propertyPath: UserDecisionPropertyPath,
  binding: SubjectBinding,
): AppliedUserDecision {
  userDecisionSchema.parse(decision);
  validateReviewItemTarget(reviewItem, objectId, propertyPath);

  const result = decision.result;
  if (result.type !== "value-provided") {
    throw new Error(
      `User Decision ${decision.id} must use result.type "value-provided" for property ${propertyPath}.`,
    );
  }

  if (reviewItem.action.type !== "provide-value") {
    throw new Error(
      `Review Item ${reviewItem.id} must use action.type "provide-value" for value-provided decisions.`,
    );
  }

  const scalarDecisionValue = assertScalarDecisionValue(result.value, decision.id);
  const normalizedDecisionValue = normalizeUserDecisionCandidate(
    propertyPath,
    scalarDecisionValue,
  );
  if (normalizedDecisionValue === undefined) {
    throw new Error(
      `User Decision ${decision.id} value is not valid for property ${propertyPath}.`,
    );
  }

  return {
    decision,
    reviewItem,
    objectId,
    propertyPath,
    subjectKey: binding.subjectKey,
    value: normalizedDecisionValue,
    resolutionKind: "value-provided",
    acceptedEvidenceIds: [],
    rejectedEvidenceIds: [],
  };
}

/**
 * Confirm an industry-default assumption: apply the registry's fixed value.
 * Only properties with an explicit registry entry may be confirmed this way.
 */
function validateConfirmedDecision(
  decision: UserDecision,
  reviewItem: ReviewItem,
  objectId: ObjectId,
  propertyPath: UserDecisionPropertyPath,
  binding: SubjectBinding,
): AppliedUserDecision {
  userDecisionSchema.parse(decision);
  validateReviewItemTarget(reviewItem, objectId, propertyPath);

  if (decision.result.type !== "confirmed") {
    throw new Error(
      `User Decision ${decision.id} must use result.type "confirmed".`,
    );
  }

  const quantityKey =
    reviewItem.quantityImpacts.find((impact) => impact.canCalculate)?.quantityKey ??
    (propertyPath === "kingStudCount" ? OPENING_QUANTITY_KEYS.kingStuds : undefined);

  if (!quantityKey) {
    throw new Error(
      `User Decision ${decision.id} cannot confirm ${propertyPath}: no quantityKey mapping for registry lookup.`,
    );
  }

  const entry = lookupAssumptionRegistryEntry(quantityKey, propertyPath);
  if (!entry) {
    throw new Error(
      `User Decision ${decision.id} cannot confirm ${propertyPath}: no assumption registry entry for ${quantityKey}.`,
    );
  }

  const assumedValue = entry.resolveAssumedValue({ objectId });
  const normalizedDecisionValue = normalizeUserDecisionCandidate(
    propertyPath,
    assumedValue,
  );
  if (normalizedDecisionValue === undefined) {
    throw new Error(
      `User Decision ${decision.id} confirmed value is not valid for property ${propertyPath}.`,
    );
  }

  return {
    decision,
    reviewItem,
    objectId,
    propertyPath,
    subjectKey: binding.subjectKey,
    value: normalizedDecisionValue,
    resolutionKind: "confirmed",
    acceptedEvidenceIds: [],
    rejectedEvidenceIds: [],
  };
}

/**
 * Returns active User Decisions keyed by `${objectId}\0${propertyPath}`.
 *
 * Supersession: a decision referenced by another decision's
 * `supersedesUserDecisionId` is inactive. Multiple active decisions for the
 * same target throw deterministically.
 *
 * Precedence: when an active User Decision targets a property, resolvers apply
 * it before Evidence candidate selection. Repeated Claude extraction cannot
 * overwrite an accepted User Decision on Run 2.
 */
export function buildUserDecisionIndex(
  context: UserDecisionResolutionContext,
  subjectBindingByObjectId: ReadonlyMap<ObjectId, SubjectBinding>,
): UserDecisionIndex {
  if (context.userDecisions.length === 0) {
    return new Map();
  }

  const parsedDecisions = context.userDecisions.map((decision) =>
    userDecisionSchema.parse(decision),
  );
  const supersededIds = new Set<UserDecisionId>(
    parsedDecisions
      .map((decision) => decision.supersedesUserDecisionId)
      .filter((decisionId): decisionId is UserDecisionId => decisionId !== null),
  );
  const activeDecisions = parsedDecisions.filter(
    (decision) => !supersededIds.has(decision.id),
  );

  const index = new Map<string, AppliedUserDecision>();

  for (const decision of activeDecisions) {
    const reviewItem = context.reviewItemsById.get(decision.reviewItemId);
    if (!reviewItem) {
      throw new Error(
        `User Decision ${decision.id} references missing Review Item ${decision.reviewItemId}.`,
      );
    }

    if (reviewItem.affectedObjects.length !== 1) {
      throw new Error(
        `Review Item ${reviewItem.id} must identify exactly one affected object for this slice.`,
      );
    }

    const objectId = reviewItem.affectedObjects[0]!.objectId;
    const propertyPath = reviewItem.action.targetProperty;
    if (!propertyPath) {
      throw new Error(
        `Review Item ${reviewItem.id} must specify action.targetProperty for this slice.`,
      );
    }

    if (!isUserDecisionPropertyPath(propertyPath)) {
      throw new Error(
        `Review Item ${reviewItem.id} targets unsupported property ${propertyPath}.`,
      );
    }

    const binding = subjectBindingByObjectId.get(objectId);
    if (!binding) {
      throw new Error(
        `User Decision ${decision.id} targets unknown object ${objectId}.`,
      );
    }

    let applied: AppliedUserDecision;
    if (decision.result.type === "conflict-resolved") {
      applied = validateConflictResolvedDecision(
        decision,
        reviewItem,
        objectId,
        propertyPath,
        binding,
        context.evidenceById,
      );
    } else if (decision.result.type === "value-provided") {
      applied = validateValueProvidedDecision(
        decision,
        reviewItem,
        objectId,
        propertyPath,
        binding,
      );
    } else if (decision.result.type === "confirmed") {
      applied = validateConfirmedDecision(
        decision,
        reviewItem,
        objectId,
        propertyPath,
        binding,
      );
    } else {
      throw new Error(
        `User Decision ${decision.id} uses unsupported result type "${decision.result.type}" in this slice.`,
      );
    }

    const key = decisionTargetKey(objectId, propertyPath);
    if (index.has(key)) {
      throw new Error(
        `Multiple active User Decisions target ${objectId}.${propertyPath}.`,
      );
    }

    index.set(key, applied);
  }

  return index;
}

export function findAppliedUserDecision(
  index: UserDecisionIndex,
  objectId: ObjectId,
  propertyPath: UserDecisionPropertyPath,
): AppliedUserDecision | undefined {
  return index.get(decisionTargetKey(objectId, propertyPath));
}

export function createUserOverrideTrace(
  applied: AppliedUserDecision,
): PropertyResolutionTrace {
  if (applied.resolutionKind === "confirmed") {
    return {
      propertyPath: applied.propertyPath,
      method: "approved-default",
      explanation: `Confirmed industry-default assumption via User Decision ${applied.decision.id}.`,
      assumptionIds: [],
    };
  }

  const explanation =
    applied.resolutionKind === "value-provided"
      ? `Resolved from User Decision ${applied.decision.id} providing reviewer value without plan evidence.`
      : `Resolved from User Decision ${applied.decision.id} selecting explicit project evidence ${applied.acceptedEvidenceIds.join(", ")} after conflicting candidates remained unresolved.`;

  return {
    propertyPath: applied.propertyPath,
    method: "user-override",
    explanation,
    assumptionIds: [],
  };
}

export type { OpeningPropertyPath } from "./openingPropertyPaths.js";
export type { WallFramingPropertyPath } from "./wallFramingPropertyPaths.js";
export type { FloorAreaPropertyPath, FloorSystemPropertyPath } from "./floorFramingPropertyPaths.js";
export type { RoofPlanePropertyPath, RoofSystemPropertyPath } from "./roofFramingPropertyPaths.js";
export type {
  SheathingAreaPropertyPath,
  SheathingSystemPropertyPath,
} from "./sheathingPropertyPaths.js";
export type { StructuralMemberPropertyPath } from "./structuralMemberPropertyPaths.js";
