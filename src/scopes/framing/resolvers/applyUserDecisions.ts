import type { Evidence } from "../../../core/schemas/evidence.schema.js";
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
  normalizeWallFramingCandidate,
  type WallFramingPropertyPath,
  isWallFramingPropertyPath,
} from "./wallFramingPropertyPaths.js";

export type UserDecisionResolutionContext = {
  userDecisions: readonly UserDecision[];
  reviewItemsById: ReadonlyMap<ReviewItemId, ReviewItem>;
  evidenceById: ReadonlyMap<EvidenceId, Evidence>;
};

export type AppliedUserDecision = {
  decision: UserDecision;
  reviewItem: ReviewItem;
  objectId: ObjectId;
  propertyPath: WallFramingPropertyPath;
  subjectKey: string;
  value: string | number | boolean;
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

function assertConflictResolvedDecision(decision: UserDecision): asserts decision is UserDecision & {
  result: Extract<UserDecision["result"], { type: "conflict-resolved" }>;
} {
  if (decision.result.type !== "conflict-resolved") {
    throw new Error(
      `User Decision ${decision.id} uses unsupported result type "${decision.result.type}" in this slice.`,
    );
  }
}

function validateReviewItemTarget(
  reviewItem: ReviewItem,
  objectId: ObjectId,
  propertyPath: WallFramingPropertyPath,
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
  subjectKey: string,
  propertyPath: WallFramingPropertyPath,
  evidenceId: EvidenceId,
  role: "accepted" | "rejected",
): string | number | boolean {
  if (record.subjectKind !== "wall") {
    throw new Error(
      `${role} Evidence ${evidenceId} belongs to subjectKind ${record.subjectKind}, not wall.`,
    );
  }

  if (record.subjectKey !== subjectKey) {
    throw new Error(
      `${role} Evidence ${evidenceId} belongs to subject ${record.subjectKey}, not ${subjectKey}.`,
    );
  }

  if (record.propertyPath !== propertyPath) {
    throw new Error(
      `${role} Evidence ${evidenceId} targets property ${record.propertyPath}, not ${propertyPath}.`,
    );
  }

  const normalized = normalizeWallFramingCandidate(propertyPath, record.candidateValue);
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
  propertyPath: WallFramingPropertyPath,
  subjectKey: string,
  evidenceById: ReadonlyMap<EvidenceId, Evidence>,
): AppliedUserDecision {
  userDecisionSchema.parse(decision);
  assertConflictResolvedDecision(decision);
  validateReviewItemTarget(reviewItem, objectId, propertyPath);

  const result = decision.result;
  const acceptedSet = new Set(result.acceptedEvidenceIds);
  const rejectedSet = new Set(result.rejectedEvidenceIds);

  if (result.acceptedEvidenceIds.length === 0) {
    throw new Error(
      `User Decision ${decision.id} must include at least one acceptedEvidenceId.`,
    );
  }

  if (
    result.acceptedEvidenceIds.some((evidenceId) => rejectedSet.has(evidenceId))
  ) {
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
      subjectKey,
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
  const decisionValueKey = candidateKey(scalarDecisionValue);
  if (selectedValue !== decisionValueKey) {
    throw new Error(
      `User Decision ${decision.id} value does not match accepted Evidence candidate value.`,
    );
  }

  const normalizedDecisionValue = normalizeWallFramingCandidate(
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

    validateEvidenceRecord(
      record,
      subjectKey,
      propertyPath,
      evidenceId,
      "rejected",
    );
  }

  return {
    decision,
    reviewItem,
    objectId,
    propertyPath,
    subjectKey,
    value: normalizedDecisionValue,
    acceptedEvidenceIds: uniqueSortedIds(result.acceptedEvidenceIds),
    rejectedEvidenceIds: uniqueSortedIds(result.rejectedEvidenceIds),
  };
}

/**
 * Returns active User Decisions keyed by `${objectId}\0${propertyPath}`.
 *
 * Supersession: a decision referenced by another decision's
 * `supersedesUserDecisionId` is inactive. Multiple active decisions for the
 * same target throw deterministically.
 */
export function buildUserDecisionIndex(
  context: UserDecisionResolutionContext,
  subjectKeyByObjectId: ReadonlyMap<ObjectId, string>,
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

    if (!isWallFramingPropertyPath(propertyPath)) {
      throw new Error(
        `Review Item ${reviewItem.id} targets unsupported property ${propertyPath}.`,
      );
    }

    const subjectKey = subjectKeyByObjectId.get(objectId);
    if (!subjectKey) {
      throw new Error(
        `User Decision ${decision.id} targets unknown object ${objectId}.`,
      );
    }

    const applied = validateConflictResolvedDecision(
      decision,
      reviewItem,
      objectId,
      propertyPath,
      subjectKey,
      context.evidenceById,
    );

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
  propertyPath: WallFramingPropertyPath,
): AppliedUserDecision | undefined {
  return index.get(decisionTargetKey(objectId, propertyPath));
}

export function createUserOverrideTrace(
  applied: AppliedUserDecision,
): PropertyResolutionTrace {
  const conflictingEvidenceIds = uniqueSortedIds([
    ...applied.acceptedEvidenceIds,
    ...applied.rejectedEvidenceIds,
  ]);

  return {
    propertyPath: applied.propertyPath,
    method: "user-override",
    explanation: `Resolved from User Decision ${applied.decision.id} selecting explicit project evidence ${applied.acceptedEvidenceIds.join(", ")} after conflicting candidates remained unresolved.`,
    evidenceIds: conflictingEvidenceIds,
    assumptionIds: [],
    userDecisionIds: [applied.decision.id],
    validationIssueIds: [],
    reviewItemIds: [applied.reviewItem.id],
  };
}

export type { WallFramingPropertyPath } from "./wallFramingPropertyPaths.js";
