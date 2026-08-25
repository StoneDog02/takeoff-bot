import { z } from "zod";

import {
  objectIdSchema,
  reviewItemIdSchema,
  userDecisionIdSchema,
  type ObjectId,
} from "./identity.schema.js";
import { decisionReadinessSchema } from "./review-root-cause.schema.js";
import { userDecisionValueSchema } from "./user-decision.schema.js";

/**
 * Per-dependent outcome of a governing-decision fan-out.
 *
 * APPLIED means the derived override was eligible and will be consulted by
 * resolvers. Other values are fail-closed skips — never silent writes.
 */
export const governingPropagationDependentResultSchema = z.enum([
  "APPLIED",
  "ALREADY_RESOLVED_STRONGER_AUTHORITY",
  "CONFLICT",
  "INELIGIBLE",
  "FAILED_VALIDATION",
  "NO_LONGER_APPLICABLE",
]);

export const governingPropagationStatusSchema = z.enum([
  "APPLIED_FULL",
  "APPLIED_PARTIAL",
  "REJECTED",
]);

/**
 * One contractor answer bound to an M.9 root-cause scope.
 *
 * Provenance remains a single UserDecision. Snapshot ID lists are audit
 * intent only — eligibility is revalidated at apply time.
 */
export const governingDecisionAnswerSchema = z.object({
  id: z.string().trim().min(1),
  userDecisionId: userDecisionIdSchema,
  rootCauseId: z.string().trim().min(1),
  governingGroupId: z.string().trim().min(1).nullable().default(null),
  decisionReadinessAtSubmit: decisionReadinessSchema,
  targetProperty: z.string().trim().min(1),
  value: userDecisionValueSchema,
  affectedObjectIdsSnapshot: z.array(objectIdSchema).min(1),
  affectedReviewItemIdsSnapshot: z.array(reviewItemIdSchema).min(1),
  groupingAuthorityKind: z.string().trim().min(1).nullable().default(null),
  groupingAuthorityKey: z.string().trim().min(1).nullable().default(null),
});

export const governingPropagationDependentSchema = z.object({
  objectId: objectIdSchema,
  reviewItemIds: z.array(reviewItemIdSchema).default([]),
  result: governingPropagationDependentResultSchema,
  explanation: z.string().trim().min(1),
});

/**
 * Immutable record of what a governing answer did (and refused) on a run.
 */
export const governingPropagationResultSchema = z.object({
  id: z.string().trim().min(1),
  governingDecisionAnswerId: z.string().trim().min(1),
  userDecisionId: userDecisionIdSchema,
  rootCauseId: z.string().trim().min(1),
  targetProperty: z.string().trim().min(1),
  status: governingPropagationStatusSchema,
  rejectionReason: z.string().trim().min(1).nullable().default(null),
  dependents: z.array(governingPropagationDependentSchema),
  appliedObjectIds: z.array(objectIdSchema).default([]),
  appliedCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(),
});

export const governingPropagationResultPayloadSchema = z.object({
  result: governingPropagationResultSchema,
});

/**
 * Optional apply-time eligibility overlays (fixture / pipeline callers).
 * Not persisted on the answer artifact; used only during fan-out.
 */
export type GoverningApplyEligibility = {
  strongerAuthorityObjectIds?: ReadonlySet<ObjectId>;
  staleObjectIds?: ReadonlySet<ObjectId>;
  conflictObjectIds?: ReadonlySet<ObjectId>;
};

export type GoverningPropagationDependentResult = z.infer<
  typeof governingPropagationDependentResultSchema
>;
export type GoverningPropagationStatus = z.infer<
  typeof governingPropagationStatusSchema
>;
export type GoverningDecisionAnswer = z.infer<
  typeof governingDecisionAnswerSchema
>;
export type GoverningPropagationDependent = z.infer<
  typeof governingPropagationDependentSchema
>;
export type GoverningPropagationResult = z.infer<
  typeof governingPropagationResultSchema
>;
