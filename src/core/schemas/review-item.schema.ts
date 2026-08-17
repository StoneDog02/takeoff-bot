import { z } from "zod";

import {
  artifactIdSchema,
  assumptionIdSchema,
  evidenceIdSchema,
  objectIdSchema,
  reviewItemIdSchema,
  validationIssueIdSchema,
} from "./identity.schema.js";
import {
  blockingStatusSchema,
  reviewStatusSchema,
} from "./status.schema.js";

/**
 * Distinguishes passive information from a review item that requires
 * user interaction.
 */
export const reviewItemKindSchema = z.enum([
  "informational",
  "actionable",
]);

/**
 * Identifies the subsystem or process that created a review item.
 *
 * Origin describes where the item came from. It does not determine
 * ownership of the affected object or the eventual user decision.
 */
export const reviewItemOriginSchema = z.enum([
  "validation",
  "assumption",
  "confidence",
  "calculation",
  "output",
  "user",
  "other",
]);

/**
 * Describes the primary reason review was surfaced.
 */
export const reviewItemReasonSchema = z.enum([
  "missing-information",
  "conflicting-evidence",
  "low-confidence",
  "assumption-confirmation",
  "calculation-blocked",
  "output-confirmation",
  "informational",
  "user-request",
  "other",
]);

/**
 * Describes the interaction requested from the user.
 *
 * Domain-specific values and selectable options belong to the originating
 * subsystem or a review-workspace view model rather than this core schema.
 */
export const reviewActionTypeSchema = z.enum([
  "none",
  "acknowledge",
  "confirm",
  "provide-value",
  "select-option",
  "inspect-source",
  "resolve-conflict",
]);

const reviewActionBaseSchema = z.object({
  instruction: z.string().trim().min(1),
  targetProperty: z.string().trim().min(1).nullable().default(null),
});

/**
 * Structured action requested by a review item.
 *
 * The discriminator allows downstream code to route each interaction
 * deterministically without parsing user-facing text.
 */
export const reviewActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("none"),
    instruction: z.string().trim().min(1),
    targetProperty: z.null().default(null),
  }),
  reviewActionBaseSchema.extend({
    type: z.literal("acknowledge"),
  }),
  reviewActionBaseSchema.extend({
    type: z.literal("confirm"),
  }),
  reviewActionBaseSchema.extend({
    type: z.literal("provide-value"),
  }),
  reviewActionBaseSchema.extend({
    type: z.literal("select-option"),
  }),
  reviewActionBaseSchema.extend({
    type: z.literal("inspect-source"),
  }),
  reviewActionBaseSchema.extend({
    type: z.literal("resolve-conflict"),
  }),
]);

/**
 * Identifies an affected resolved construction object without embedding it.
 *
 * objectType remains scope-defined so this shared schema can support
 * framing and future construction scopes.
 */
export const reviewAffectedObjectSchema = z.object({
  objectId: objectIdSchema,
  objectType: z.string().trim().min(1),
});

/**
 * Identifies an affected artifact without embedding artifact state.
 */
export const reviewAffectedArtifactSchema = z.object({
  artifactId: artifactIdSchema,
  artifactType: z.string().trim().min(1).nullable().default(null),
});

/**
 * Describes how a review item affects a material or calculation quantity.
 */
export const reviewQuantityImpactLevelSchema = z.enum([
  "none",
  "may-change",
  "incomplete",
  "excluded",
  "blocked",
]);

/**
 * Preserves calculation impact at the smallest practical quantity area.
 *
 * quantityKey is an optional stable machine-readable identifier.
 * description remains required for user-facing explainability.
 */
export const reviewQuantityImpactSchema = z
  .object({
    quantityKey: z.string().trim().min(1).nullable().default(null),
    description: z.string().trim().min(1),
    impact: reviewQuantityImpactLevelSchema,
    canCalculate: z.boolean(),
  })
  .superRefine((quantityImpact, context) => {
    if (
      quantityImpact.impact === "blocked" &&
      quantityImpact.canCalculate
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["canCalculate"],
        message:
          "A blocked quantity impact cannot be marked as calculable.",
      });
    }
  });

/**
 * Represents one immutable request for inspection, confirmation,
 * information, or conflict resolution.
 *
 * User decisions do not mutate this record. They belong in a separate
 * User Decisions Artifact that references this review-item ID.
 */
export const reviewItemSchema = z
  .object({
    id: reviewItemIdSchema,
    kind: reviewItemKindSchema,
    origin: reviewItemOriginSchema,
    reason: reviewItemReasonSchema,

    title: z.string().trim().min(1),
    description: z.string().trim().min(1),

    action: reviewActionSchema,
    reviewStatus: reviewStatusSchema,
    blockingStatus: blockingStatusSchema,

    affectedObjects: z
      .array(reviewAffectedObjectSchema)
      .default([]),
    affectedArtifacts: z
      .array(reviewAffectedArtifactSchema)
      .default([]),
    affectedCalculationAreas: z
      .array(z.string().trim().min(1))
      .default([]),
    quantityImpacts: z
      .array(reviewQuantityImpactSchema)
      .default([]),

    evidenceIds: z.array(evidenceIdSchema).default([]),
    assumptionIds: z.array(assumptionIdSchema).default([]),
    validationIssueIds: z
      .array(validationIssueIdSchema)
      .default([]),
  })
  .superRefine((reviewItem, context) => {
    if (reviewItem.kind === "informational") {
      if (reviewItem.action.type !== "none") {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["action", "type"],
          message:
            "An informational review item must use the none action.",
        });
      }

      if (reviewItem.blockingStatus !== "not-blocked") {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["blockingStatus"],
          message:
            "An informational review item cannot block calculation.",
        });
      }
    }

    if (reviewItem.kind === "actionable") {
      if (reviewItem.action.type === "none") {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["action", "type"],
          message:
            "An actionable review item must request a user action.",
        });
      }

      if (reviewItem.reviewStatus === "no-review-required") {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["reviewStatus"],
          message:
            "An actionable review item cannot be marked as no review required.",
        });
      }
    }

    if (
      reviewItem.blockingStatus === "blocked" &&
      reviewItem.kind !== "actionable"
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["kind"],
        message: "A blocked review item must be actionable.",
      });
    }
  });

export type ReviewItemKind = z.infer<typeof reviewItemKindSchema>;
export type ReviewItemOrigin = z.infer<
  typeof reviewItemOriginSchema
>;
export type ReviewItemReason = z.infer<
  typeof reviewItemReasonSchema
>;
export type ReviewActionType = z.infer<
  typeof reviewActionTypeSchema
>;
export type ReviewAction = z.infer<typeof reviewActionSchema>;
export type ReviewAffectedObject = z.infer<
  typeof reviewAffectedObjectSchema
>;
export type ReviewAffectedArtifact = z.infer<
  typeof reviewAffectedArtifactSchema
>;
export type ReviewQuantityImpactLevel = z.infer<
  typeof reviewQuantityImpactLevelSchema
>;
export type ReviewQuantityImpact = z.infer<
  typeof reviewQuantityImpactSchema
>;
export type ReviewItem = z.infer<typeof reviewItemSchema>;