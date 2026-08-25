import { z } from "zod";

import {
  objectIdSchema,
  reviewItemIdSchema,
  validationIssueIdSchema,
} from "./identity.schema.js";
import { blockingStatusSchema } from "./status.schema.js";

/**
 * Whether a root-cause family is ready for one contractor answer.
 *
 * Distinct from ReviewItem.blockingStatus: readiness concerns governing
 * decision safety, not per-object calculation blockage.
 */
export const decisionReadinessSchema = z.enum([
  "ACTIONABLE_SINGLE_DECISION",
  "ACTIONABLE_PARTITIONED",
  "NEEDS_PARTITIONING",
  "OBJECT_SPECIFIC",
  "INFORMATIONAL",
]);

export const reviewRootCauseScopeSchema = z.enum([
  "project",
  "system",
  "population",
  "object",
]);

export const groupingAuthorityStrengthSchema = z.enum(["strong", "weak"]);

/**
 * Records why reviews were grouped. Strong authority may produce an
 * actionable governing decision; weak authority only identifies a family.
 */
export const groupingAuthoritySchema = z.object({
  strength: groupingAuthorityStrengthSchema,
  kind: z.string().trim().min(1),
  key: z.string().trim().min(1),
  explanation: z.string().trim().min(1),
});

export const reviewRootCauseResolutionStateSchema = z.enum([
  "unresolved",
  "resolved",
]);

/**
 * A contractor-facing governing decision within a root-cause family.
 *
 * M.9 may emit one group per family. Later partitioning can emit several
 * groups under the same family without collapsing raw ReviewItems.
 */
export const governingDecisionGroupSchema = z.object({
  id: z.string().trim().min(1),
  decisionReadiness: decisionReadinessSchema,
  contractorSummary: z.string().trim().min(1),
  affectedReviewItemIds: z.array(reviewItemIdSchema).min(1),
  affectedObjectIds: z.array(objectIdSchema).min(1),
  affectedObjectCount: z.number().int().positive(),
});

/**
 * Read-model grouping of ReviewItems that share a technical root cause.
 *
 * This is a projection, not authoritative Stage-13 state. Raw ReviewItems
 * remain the audit inventory; this record does not invent construction values.
 */
export const reviewRootCauseSchema = z.object({
  id: z.string().trim().min(1),
  code: z.string().trim().min(1),
  ruleIds: z.array(z.string().trim().min(1)).min(1),
  propertyPaths: z.array(z.string().trim().min(1)).default([]),
  domain: z.string().trim().min(1),
  scope: reviewRootCauseScopeSchema,
  decisionReadiness: decisionReadinessSchema,
  groupingConfidence: z.enum(["high", "medium", "low"]),
  contractorSummary: z.string().trim().min(1),
  blockingStatus: blockingStatusSchema,
  materialRelevant: z.boolean(),
  affectedReviewItemIds: z.array(reviewItemIdSchema).min(1),
  affectedObjectIds: z.array(objectIdSchema).min(1),
  affectedObjectCount: z.number().int().positive(),
  validationIssueIds: z.array(validationIssueIdSchema).default([]),
  groupingAuthority: groupingAuthoritySchema,
  governingGroups: z.array(governingDecisionGroupSchema).default([]),
  resolutionState: reviewRootCauseResolutionStateSchema.default("unresolved"),
});

/**
 * One entry in the contractor-facing primary decision queue.
 *
 * Governing root causes occupy the queue as groups; ungrouped
 * object-specific actionable reviews remain individual entries.
 */
export const contractorPrimaryQueueEntrySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("governing-issue"),
    rootCauseId: z.string().trim().min(1),
    governingGroupId: z.string().trim().min(1),
    decisionReadiness: decisionReadinessSchema,
    title: z.string().trim().min(1),
    affectedObjectCount: z.number().int().positive(),
    dependentReviewItemCount: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal("object-specific-review"),
    reviewItemId: reviewItemIdSchema,
    objectId: objectIdSchema,
    targetProperty: z.string().trim().min(1).nullable(),
    title: z.string().trim().min(1),
    blockingStatus: blockingStatusSchema,
  }),
]);

export const reviewRootCauseProjectionSummarySchema = z.object({
  rawReviewItems: z.number().int().nonnegative(),
  blockingReviewItems: z.number().int().nonnegative(),
  dependentReviewItems: z.number().int().nonnegative(),
  rootCauseFamilies: z.number().int().nonnegative(),
  actionableGoverningDecisions: z.number().int().nonnegative(),
  needsPartitioningGroups: z.number().int().nonnegative(),
  objectSpecificDecisions: z.number().int().nonnegative(),
  informationalIssues: z.number().int().nonnegative(),
  contractorPrimaryQueueCount: z.number().int().nonnegative(),
  objectsCoveredByGroupedDecisions: z.number().int().nonnegative(),
  largestGroupSize: z.number().int().nonnegative(),
  groupingCoveragePercent: z.number().finite().nonnegative(),
});

export const reviewRootCauseProjectionSchema = z.object({
  rootCauses: z.array(reviewRootCauseSchema),
  primaryQueue: z.array(contractorPrimaryQueueEntrySchema),
  secondaryInformationalRootCauseIds: z.array(z.string().trim().min(1)),
  dependentReviewItemIds: z.array(reviewItemIdSchema),
  summary: reviewRootCauseProjectionSummarySchema,
});

export type DecisionReadiness = z.infer<typeof decisionReadinessSchema>;
export type GroupingAuthority = z.infer<typeof groupingAuthoritySchema>;
export type GoverningDecisionGroup = z.infer<
  typeof governingDecisionGroupSchema
>;
export type ReviewRootCause = z.infer<typeof reviewRootCauseSchema>;
export type ContractorPrimaryQueueEntry = z.infer<
  typeof contractorPrimaryQueueEntrySchema
>;
export type ReviewRootCauseProjectionSummary = z.infer<
  typeof reviewRootCauseProjectionSummarySchema
>;
export type ReviewRootCauseProjection = z.infer<
  typeof reviewRootCauseProjectionSchema
>;
