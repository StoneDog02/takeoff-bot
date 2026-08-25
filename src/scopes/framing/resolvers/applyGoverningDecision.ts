import type {
  GoverningApplyEligibility,
  GoverningDecisionAnswer,
  GoverningPropagationDependent,
  GoverningPropagationDependentResult,
  GoverningPropagationResult,
} from "../../../core/schemas/governing-propagation.schema.js";
import {
  governingDecisionAnswerSchema,
  governingPropagationResultSchema,
} from "../../../core/schemas/governing-propagation.schema.js";
import type {
  ObjectId,
  ReviewItemId,
  UserDecisionId,
} from "../../../core/schemas/identity.schema.js";
import type { ReviewItem } from "../../../core/schemas/review-item.schema.js";
import type { ReviewRootCause } from "../../../core/schemas/review-root-cause.schema.js";
import type { UserDecision } from "../../../core/schemas/user-decision.schema.js";
import { userDecisionSchema } from "../../../core/schemas/user-decision.schema.js";
import {
  type AppliedUserDecision,
  type SubjectBinding,
  type UserDecisionIndex,
  type UserDecisionPropertyPath,
  isUserDecisionPropertyPath,
  normalizeUserDecisionCandidate,
} from "./applyUserDecisions.js";

export type { GoverningApplyEligibility };

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function decisionTargetKey(objectId: ObjectId, propertyPath: string): string {
  return `${objectId}\0${propertyPath}`;
}

function assertScalar(
  value: unknown,
  decisionId: UserDecisionId,
): string | number | boolean {
  if (value === null || typeof value === "object") {
    throw new Error(
      `Governing User Decision ${decisionId} value must be a scalar for property resolution.`,
    );
  }
  return value as string | number | boolean;
}

export type ApplyGoverningDecisionInput = {
  answer: GoverningDecisionAnswer;
  userDecision: UserDecision;
  rootCause: ReviewRootCause;
  reviewItemsById: ReadonlyMap<ReviewItemId, ReviewItem>;
  subjectBindingByObjectId: ReadonlyMap<ObjectId, SubjectBinding>;
  eligibility?: GoverningApplyEligibility;
};

export type ApplyGoverningDecisionOutput = {
  propagationResult: GoverningPropagationResult;
  applications: AppliedUserDecision[];
};

function reviewItemIdsForObject(
  answer: GoverningDecisionAnswer,
  objectId: ObjectId,
  reviewItemsById: ReadonlyMap<ReviewItemId, ReviewItem>,
): ReviewItemId[] {
  const ids: ReviewItemId[] = [];
  for (const reviewItemId of answer.affectedReviewItemIdsSnapshot) {
    const reviewItem = reviewItemsById.get(reviewItemId);
    if (!reviewItem) {
      continue;
    }
    if (
      reviewItem.affectedObjects.some((affected) => affected.objectId === objectId)
    ) {
      ids.push(reviewItemId);
    }
  }
  return ids.sort(compareIds);
}

function dependentResult(
  objectId: ObjectId,
  reviewItemIds: readonly ReviewItemId[],
  result: GoverningPropagationDependentResult,
  explanation: string,
): GoverningPropagationDependent {
  return {
    objectId,
    reviewItemIds: [...reviewItemIds],
    result,
    explanation,
  };
}

/**
 * Fail-closed governing fan-out: one UserDecision → N derived applications.
 *
 * Rejects NEEDS_PARTITIONING / INFORMATIONAL / non-ACTIONABLE_SINGLE_DECISION
 * groups entirely. Revalidates eligibility per dependent at apply time.
 */
export function applyGoverningDecision(
  input: ApplyGoverningDecisionInput,
): ApplyGoverningDecisionOutput {
  const answer = governingDecisionAnswerSchema.parse(input.answer);
  const userDecision = userDecisionSchema.parse(input.userDecision);
  const rootCause = input.rootCause;
  const eligibility = input.eligibility ?? {};

  if (userDecision.id !== answer.userDecisionId) {
    throw new Error(
      `Governing answer ${answer.id} userDecisionId ${answer.userDecisionId} does not match User Decision ${userDecision.id}.`,
    );
  }

  if (userDecision.result.type !== "value-provided") {
    throw new Error(
      `Governing User Decision ${userDecision.id} must use result.type "value-provided".`,
    );
  }

  const rejectionBase = {
    id: `GPR-${answer.id}`,
    governingDecisionAnswerId: answer.id,
    userDecisionId: userDecision.id,
    rootCauseId: answer.rootCauseId,
    targetProperty: answer.targetProperty,
    dependents: [] as GoverningPropagationDependent[],
    appliedObjectIds: [] as ObjectId[],
    appliedCount: 0,
    skippedCount: 0,
  };

  if (rootCause.id !== answer.rootCauseId) {
    const propagationResult = governingPropagationResultSchema.parse({
      ...rejectionBase,
      status: "REJECTED",
      rejectionReason: `Root cause id mismatch: answer bound to ${answer.rootCauseId}, live family is ${rootCause.id}.`,
    });
    return { propagationResult, applications: [] };
  }

  if (rootCause.decisionReadiness !== "ACTIONABLE_SINGLE_DECISION") {
    const propagationResult = governingPropagationResultSchema.parse({
      ...rejectionBase,
      status: "REJECTED",
      rejectionReason: `Root cause ${rootCause.id} readiness is ${rootCause.decisionReadiness}; governing value fan-out requires ACTIONABLE_SINGLE_DECISION.`,
    });
    return { propagationResult, applications: [] };
  }

  if (answer.decisionReadinessAtSubmit !== "ACTIONABLE_SINGLE_DECISION") {
    const propagationResult = governingPropagationResultSchema.parse({
      ...rejectionBase,
      status: "REJECTED",
      rejectionReason: `Governing answer submitted with readiness ${answer.decisionReadinessAtSubmit}; only ACTIONABLE_SINGLE_DECISION may fan out.`,
    });
    return { propagationResult, applications: [] };
  }

  if (
    answer.groupingAuthorityKind != null &&
    answer.groupingAuthorityKind !== rootCause.groupingAuthority.kind
  ) {
    const propagationResult = governingPropagationResultSchema.parse({
      ...rejectionBase,
      status: "REJECTED",
      rejectionReason: `Grouping authority kind drifted from ${answer.groupingAuthorityKind} to ${rootCause.groupingAuthority.kind}.`,
    });
    return { propagationResult, applications: [] };
  }

  if (
    answer.groupingAuthorityKey != null &&
    answer.groupingAuthorityKey !== rootCause.groupingAuthority.key
  ) {
    const propagationResult = governingPropagationResultSchema.parse({
      ...rejectionBase,
      status: "REJECTED",
      rejectionReason: `Grouping authority key drifted from ${answer.groupingAuthorityKey} to ${rootCause.groupingAuthority.key}.`,
    });
    return { propagationResult, applications: [] };
  }

  if (!isUserDecisionPropertyPath(answer.targetProperty)) {
    const propagationResult = governingPropagationResultSchema.parse({
      ...rejectionBase,
      status: "REJECTED",
      rejectionReason: `Target property ${answer.targetProperty} is not a supported UserDecision property path.`,
    });
    return { propagationResult, applications: [] };
  }

  const propertyPath = answer.targetProperty as UserDecisionPropertyPath;
  const scalarValue = assertScalar(
    userDecision.result.value,
    userDecision.id,
  );
  const normalized = normalizeUserDecisionCandidate(propertyPath, scalarValue);
  if (normalized === undefined) {
    const propagationResult = governingPropagationResultSchema.parse({
      ...rejectionBase,
      status: "REJECTED",
      rejectionReason: `Value is not valid for property ${propertyPath}.`,
    });
    return { propagationResult, applications: [] };
  }

  const liveAffected = new Set(rootCause.affectedObjectIds);
  const dependents: GoverningPropagationDependent[] = [];
  const applications: AppliedUserDecision[] = [];
  const appliedObjectIds: ObjectId[] = [];

  const snapshotObjects = [...answer.affectedObjectIdsSnapshot].sort(compareIds);

  for (const objectId of snapshotObjects) {
    const reviewItemIds = reviewItemIdsForObject(
      answer,
      objectId,
      input.reviewItemsById,
    );

    if (eligibility.staleObjectIds?.has(objectId) || !liveAffected.has(objectId)) {
      dependents.push(
        dependentResult(
          objectId,
          reviewItemIds,
          liveAffected.has(objectId) ? "INELIGIBLE" : "NO_LONGER_APPLICABLE",
          liveAffected.has(objectId)
            ? `Object ${objectId} marked ineligible at apply time.`
            : `Object ${objectId} is no longer in root cause ${rootCause.id} affected set.`,
        ),
      );
      continue;
    }

    if (eligibility.strongerAuthorityObjectIds?.has(objectId)) {
      dependents.push(
        dependentResult(
          objectId,
          reviewItemIds,
          "ALREADY_RESOLVED_STRONGER_AUTHORITY",
          `Object ${objectId} already has stronger non-override authority for ${propertyPath}.`,
        ),
      );
      continue;
    }

    if (eligibility.conflictObjectIds?.has(objectId)) {
      dependents.push(
        dependentResult(
          objectId,
          reviewItemIds,
          "CONFLICT",
          `Object ${objectId} conflicts with governing value for ${propertyPath}.`,
        ),
      );
      continue;
    }

    const binding = input.subjectBindingByObjectId.get(objectId);
    if (!binding) {
      dependents.push(
        dependentResult(
          objectId,
          reviewItemIds,
          "INELIGIBLE",
          `Object ${objectId} has no subject binding in the current resolve set.`,
        ),
      );
      continue;
    }

    const representativeReviewItemId =
      reviewItemIds[0] ??
      answer.affectedReviewItemIdsSnapshot.find((id) => {
        const item = input.reviewItemsById.get(id);
        return item?.affectedObjects.some((a) => a.objectId === objectId);
      }) ??
      userDecision.reviewItemId;

    const reviewItem = input.reviewItemsById.get(representativeReviewItemId);
    if (!reviewItem) {
      dependents.push(
        dependentResult(
          objectId,
          reviewItemIds,
          "NO_LONGER_APPLICABLE",
          `No ReviewItem remains for object ${objectId} under governing answer ${answer.id}.`,
        ),
      );
      continue;
    }

    if (
      reviewItem.action.targetProperty != null &&
      reviewItem.action.targetProperty !== propertyPath
    ) {
      dependents.push(
        dependentResult(
          objectId,
          reviewItemIds,
          "INELIGIBLE",
          `ReviewItem ${reviewItem.id} targets ${reviewItem.action.targetProperty}, not ${propertyPath}.`,
        ),
      );
      continue;
    }

    applications.push({
      decision: userDecision,
      reviewItem,
      objectId,
      propertyPath,
      subjectKey: binding.subjectKey,
      value: normalized,
      resolutionKind: "value-provided",
      acceptedEvidenceIds: [],
      rejectedEvidenceIds: [],
    });
    appliedObjectIds.push(objectId);
    dependents.push(
      dependentResult(
        objectId,
        reviewItemIds.length > 0 ? reviewItemIds : [reviewItem.id],
        "APPLIED",
        `Applied governing User Decision ${userDecision.id} to ${objectId}.${propertyPath}.`,
      ),
    );
  }

  const appliedCount = appliedObjectIds.length;
  const skippedCount = dependents.length - appliedCount;
  const status =
    appliedCount === 0 && dependents.length > 0
      ? skippedCount === dependents.length
        ? "APPLIED_PARTIAL"
        : "APPLIED_PARTIAL"
      : appliedCount === dependents.length
        ? "APPLIED_FULL"
        : appliedCount === 0
          ? "REJECTED"
          : "APPLIED_PARTIAL";

  // If every dependent was skipped with zero applies, treat as partial success
  // of the decision attempt (eligibility worked) unless the group was rejected above.
  const finalStatus =
    appliedCount === 0 && dependents.length > 0 ? "APPLIED_PARTIAL" : status;

  const propagationResult = governingPropagationResultSchema.parse({
    id: `GPR-${answer.id}`,
    governingDecisionAnswerId: answer.id,
    userDecisionId: userDecision.id,
    rootCauseId: answer.rootCauseId,
    targetProperty: answer.targetProperty,
    status: finalStatus === "REJECTED" && appliedCount > 0 ? "APPLIED_PARTIAL" : finalStatus,
    rejectionReason: null,
    dependents,
    appliedObjectIds: appliedObjectIds.sort(compareIds),
    appliedCount,
    skippedCount,
  });

  return { propagationResult, applications };
}

/**
 * Merge derived governing applications into a UserDecision index.
 *
 * Conflicts with an existing object-specific decision for the same key throw.
 * Governing UserDecision IDs should be excluded from ordinary 1:1 indexing
 * before calling this (see filterOutGoverningUserDecisions).
 */
export function mergeGoverningApplicationsIntoIndex(
  index: UserDecisionIndex,
  applications: readonly AppliedUserDecision[],
): UserDecisionIndex {
  if (applications.length === 0) {
    return index;
  }

  const merged = new Map(index);
  for (const applied of applications) {
    const key = decisionTargetKey(applied.objectId, applied.propertyPath);
    if (merged.has(key)) {
      throw new Error(
        `Governing application conflicts with existing override for ${applied.objectId}.${applied.propertyPath}.`,
      );
    }
    merged.set(key, applied);
  }
  return merged;
}

export function filterOutGoverningUserDecisions(
  userDecisions: readonly UserDecision[],
  governingAnswers: readonly GoverningDecisionAnswer[],
): UserDecision[] {
  if (governingAnswers.length === 0) {
    return [...userDecisions];
  }
  const governingIds = new Set(
    governingAnswers.map((answer) => answer.userDecisionId),
  );
  return userDecisions.filter((decision) => !governingIds.has(decision.id));
}

/**
 * Build a combined override index: object-specific UserDecisions plus
 * eligibility-checked governing fan-out applications.
 */
export function buildCombinedOverrideIndex(input: {
  ordinaryIndex: UserDecisionIndex;
  governingAnswers: readonly GoverningDecisionAnswer[];
  userDecisions: readonly UserDecision[];
  rootCausesById: ReadonlyMap<string, ReviewRootCause>;
  reviewItemsById: ReadonlyMap<ReviewItemId, ReviewItem>;
  subjectBindingByObjectId: ReadonlyMap<ObjectId, SubjectBinding>;
  eligibilityByAnswerId?: ReadonlyMap<string, GoverningApplyEligibility>;
}): {
  index: UserDecisionIndex;
  propagationResults: GoverningPropagationResult[];
} {
  const propagationResults: GoverningPropagationResult[] = [];
  let index = input.ordinaryIndex;
  const decisionsById = new Map(
    input.userDecisions.map((decision) => [decision.id, decision]),
  );

  for (const answer of input.governingAnswers) {
    const parsed = governingDecisionAnswerSchema.parse(answer);
    const userDecision = decisionsById.get(parsed.userDecisionId);
    if (!userDecision) {
      throw new Error(
        `Governing answer ${parsed.id} references missing User Decision ${parsed.userDecisionId}.`,
      );
    }
    const rootCause = input.rootCausesById.get(parsed.rootCauseId);
    if (!rootCause) {
      throw new Error(
        `Governing answer ${parsed.id} references missing root cause ${parsed.rootCauseId}.`,
      );
    }

    const { propagationResult, applications } = applyGoverningDecision({
      answer: parsed,
      userDecision,
      rootCause,
      reviewItemsById: input.reviewItemsById,
      subjectBindingByObjectId: input.subjectBindingByObjectId,
      eligibility: input.eligibilityByAnswerId?.get(parsed.id),
    });
    propagationResults.push(propagationResult);
    index = mergeGoverningApplicationsIntoIndex(index, applications);
  }

  return { index, propagationResults };
}
