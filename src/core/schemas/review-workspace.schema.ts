import { z } from "zod";

import {
  assumptionIdSchema,
  evidenceIdSchema,
  identifierSchema,
  objectIdSchema,
  reviewItemIdSchema,
  userDecisionIdSchema,
  validationIssueIdSchema,
} from "./identity.schema.js";
import { propertyResolutionTraceSchema } from "./resolved-object.schema.js";
import {
  reviewActionSchema,
  reviewItemReasonSchema,
  reviewQuantityImpactSchema,
} from "./review-item.schema.js";
import {
  blockingStatusSchema,
  reviewStatusSchema,
} from "./status.schema.js";
import { userDecisionResultTypeSchema } from "./user-decision.schema.js";
import { validationSeveritySchema } from "./validation.schema.js";

/**
 * Describes how the engine currently treats a reviewed property value.
 *
 * This is a read-model classification for review workspace consumers. It does
 * not replace ResolutionTrace.method on resolved objects.
 */
export const reviewWorkspaceValueSourceSchema = z.enum([
  "explicit-project-value",
  "industry-default-assumption",
  "unresolved",
  "conflicted-unresolved",
  "user-override",
  "not-applicable",
]);

export const reviewWorkspaceMaterialLineSchema = z.object({
  materialLineId: identifierSchema,
  quantityKey: z.string().trim().min(1).nullable().default(null),
  description: z.string().trim().min(1),
  quantity: z.number().finite().positive().nullable().default(null),
  unit: z.string().trim().min(1).nullable().default(null),
  assumptionIds: z.array(assumptionIdSchema).default([]),
});

export const reviewWorkspaceItemSchema = z.object({
  reviewItemId: reviewItemIdSchema,
  objectId: objectIdSchema,
  objectType: z.string().trim().min(1),
  objectDomain: z.string().trim().min(1),
  targetProperty: z.string().trim().min(1).nullable().default(null),
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),

  status: z.object({
    reviewStatus: reviewStatusSchema,
    blockingStatus: blockingStatusSchema,
    reason: reviewItemReasonSchema,
    severity: validationSeveritySchema.nullable().default(null),
    queueState: z.literal("active"),
  }),

  currentState: z.object({
    resolvedPropertyValue: z.unknown().nullable().default(null),
    calculationValueUsed: z
      .union([z.string(), z.number(), z.boolean()])
      .nullable()
      .default(null),
    valueSource: reviewWorkspaceValueSourceSchema,
    explanation: z.string().trim().min(1),
  }),

  provenance: z.object({
    evidenceIds: z.array(evidenceIdSchema).default([]),
    assumptionIds: z.array(assumptionIdSchema).default([]),
    userDecisionIds: z.array(userDecisionIdSchema).default([]),
    validationIssueIds: z.array(validationIssueIdSchema).default([]),
    resolutionTrace: propertyResolutionTraceSchema.nullable().default(null),
  }),

  calculationImpact: z.object({
    quantityImpacts: z.array(reviewQuantityImpactSchema).default([]),
    materialLines: z.array(reviewWorkspaceMaterialLineSchema).default([]),
    isCalculationBlocked: z.boolean(),
  }),

  action: reviewActionSchema,

  decision: z.object({
    activeUserDecisionId: userDecisionIdSchema.nullable().default(null),
    supersedesUserDecisionId: userDecisionIdSchema.nullable().default(null),
  }),
});

export const reviewWorkspaceResolvedItemSchema = z.object({
  reviewItemId: reviewItemIdSchema,
  objectId: objectIdSchema,
  objectType: z.string().trim().min(1),
  objectDomain: z.string().trim().min(1),
  targetProperty: z.string().trim().min(1).nullable().default(null),
  title: z.string().trim().min(1),
  userDecisionId: userDecisionIdSchema,
  userDecisionResultType: userDecisionResultTypeSchema,
  resolvedPropertyValue: z.unknown().nullable().default(null),
  calculationValueUsed: z
    .union([z.string(), z.number(), z.boolean()])
    .nullable()
    .default(null),
  valueSource: z.literal("user-override"),
  explanation: z.string().trim().min(1),
  provenance: z.object({
    evidenceIds: z.array(evidenceIdSchema).default([]),
    assumptionIds: z.array(assumptionIdSchema).default([]),
    userDecisionIds: z.array(userDecisionIdSchema).default([]),
    validationIssueIds: z.array(validationIssueIdSchema).default([]),
    resolutionTrace: propertyResolutionTraceSchema.nullable().default(null),
  }),
  calculationImpact: z.object({
    quantityImpacts: z.array(reviewQuantityImpactSchema).default([]),
    materialLines: z.array(reviewWorkspaceMaterialLineSchema).default([]),
    isCalculationBlocked: z.boolean(),
  }),
});

export const reviewWorkspaceSummarySchema = z.object({
  activeReviewItemCount: z.number().int().nonnegative(),
  blockingReviewItemCount: z.number().int().nonnegative(),
  reviewRecommendedCount: z.number().int().nonnegative(),
  affectedObjectCount: z.number().int().nonnegative(),
  calculatedUnderAssumptionCount: z.number().int().nonnegative(),
  resolvedByUserDecisionCount: z.number().int().nonnegative(),
});

export const reviewWorkspacePayloadSchema = z.object({
  items: z.array(reviewWorkspaceItemSchema),
  resolvedItems: z.array(reviewWorkspaceResolvedItemSchema).default([]),
  summary: reviewWorkspaceSummarySchema,
});

export type ReviewWorkspaceValueSource = z.infer<
  typeof reviewWorkspaceValueSourceSchema
>;
export type ReviewWorkspaceMaterialLine = z.infer<
  typeof reviewWorkspaceMaterialLineSchema
>;
export type ReviewWorkspaceItem = z.infer<typeof reviewWorkspaceItemSchema>;
export type ReviewWorkspaceResolvedItem = z.infer<
  typeof reviewWorkspaceResolvedItemSchema
>;
export type ReviewWorkspaceSummary = z.infer<
  typeof reviewWorkspaceSummarySchema
>;
export type ReviewWorkspacePayload = z.infer<
  typeof reviewWorkspacePayloadSchema
>;
