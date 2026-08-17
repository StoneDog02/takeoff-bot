import { z } from "zod";

import {
  assumptionIdSchema,
  evidenceIdSchema,
  objectIdSchema,
  reviewItemIdSchema,
  userDecisionIdSchema,
} from "./identity.schema.js";

/**
 * Identifies the precedence class of a value used in place of unresolved
 * project information.
 *
 * Explicit project values and user overrides are intentionally excluded:
 * they are resolved values, not assumptions.
 */
export const assumptionCategorySchema = z.enum([
  "industry-default",
  "user-default",
  "organization-default",
]);

/**
 * Identifies the system that supplied the assumption definition.
 *
 * Category determines precedence. Source type preserves provenance.
 */
export const assumptionSourceTypeSchema = z.enum([
  "construction-brain",
  "user-configuration",
  "organization-configuration",
]);

export const assumptionSourceSchema = z.object({
  type: assumptionSourceTypeSchema,
  reference: z.string().trim().min(1).nullable().default(null),
  explanation: z.string().trim().min(1),
});

/**
 * Assumption values are intentionally atomic. Structured domain state belongs
 * in the resolved construction object rather than inside an assumption record.
 */
export const assumptionValueSchema = z.union([
  z.string().trim().min(1),
  z.number().finite(),
  z.boolean(),
]);

/**
 * Identifies the single resolved-object property affected by an assumption.
 * One assumption record owns one target property so replacement and quantity
 * recalculation remain deterministic.
 */
export const assumptionTargetSchema = z.object({
  objectId: objectIdSchema,
  objectType: z.string().trim().min(1),
  propertyPath: z.string().trim().min(1),
});

export const assumptionRiskLevelSchema = z.enum([
  "low",
  "medium",
  "high",
]);

export const assumptionMaterialImpactLevelSchema = z.enum([
  "none",
  "low",
  "medium",
  "high",
  "unknown",
]);

export const assumptionMaterialImpactSchema = z.object({
  level: assumptionMaterialImpactLevelSchema,
  explanation: z.string().trim().min(1),
  affectedQuantityKeys: z
    .array(z.string().trim().min(1))
    .default([]),
});

export const assumptionConfidenceImpactLevelSchema = z.enum([
  "none",
  "minor",
  "material",
]);

export const assumptionConfidenceImpactSchema = z.object({
  level: assumptionConfidenceImpactLevelSchema,
  explanation: z.string().trim().min(1),
});

/**
 * Lifecycle is represented in new immutable artifact snapshots.
 *
 * Replacement values are owned exclusively by the referenced User Decision.
 */
export const assumptionStatusSchema = z.enum([
  "active",
  "confirmed",
  "replaced",
]);

function addDuplicateIdIssue(
  ids: readonly string[],
  path: (string | number)[],
  label: string,
  context: z.RefinementCtx,
): void {
  if (new Set(ids).size !== ids.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path,
      message: `${label} must not contain duplicate IDs.`,
    });
  }
}

/**
 * Core, scope-agnostic record for one deterministic assumption applied to one
 * resolved-object property.
 *
 * Construction-specific eligibility, precedence, risk, and confidence rules
 * belong to the owning scope's Construction Brain and resolvers. This schema
 * preserves the resulting state and traceability without redefining behavior.
 */
export const assumptionSchema = z
  .object({
    id: assumptionIdSchema,
    category: assumptionCategorySchema,
    target: assumptionTargetSchema,
    assumedValue: assumptionValueSchema,

    source: assumptionSourceSchema,
    reasonUsed: z.string().trim().min(1),

    materialImpact: assumptionMaterialImpactSchema,
    riskLevel: assumptionRiskLevelSchema,
    userEditable: z.boolean(),
    reviewRequired: z.boolean(),
    confidenceImpact: assumptionConfidenceImpactSchema,

    evidenceIds: z.array(evidenceIdSchema).default([]),
    reviewItemIds: z.array(reviewItemIdSchema).default([]),

    status: assumptionStatusSchema,
    userDecisionId: userDecisionIdSchema.nullable().default(null),
  })
  .superRefine((assumption, context) => {
    addDuplicateIdIssue(
      assumption.evidenceIds,
      ["evidenceIds"],
      "evidenceIds",
      context,
    );
    addDuplicateIdIssue(
      assumption.reviewItemIds,
      ["reviewItemIds"],
      "reviewItemIds",
      context,
    );
    addDuplicateIdIssue(
      assumption.materialImpact.affectedQuantityKeys,
      ["materialImpact", "affectedQuantityKeys"],
      "affectedQuantityKeys",
      context,
    );

    if (
      assumption.status !== "active" &&
      assumption.userDecisionId === null
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["userDecisionId"],
        message:
          "A confirmed or replaced assumption must reference its User Decision.",
      });
    }

    if (
      assumption.status === "active" &&
      assumption.userDecisionId !== null
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["userDecisionId"],
        message:
          "An active assumption cannot reference a resolving User Decision.",
      });
    }

    if (
      assumption.status === "replaced" &&
      !assumption.userEditable
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["userEditable"],
        message: "A non-editable assumption cannot be replaced.",
      });
    }
  });

export type AssumptionCategory = z.infer<
  typeof assumptionCategorySchema
>;
export type AssumptionSourceType = z.infer<
  typeof assumptionSourceTypeSchema
>;
export type AssumptionSource = z.infer<typeof assumptionSourceSchema>;
export type AssumptionValue = z.infer<typeof assumptionValueSchema>;
export type AssumptionTarget = z.infer<typeof assumptionTargetSchema>;
export type AssumptionRiskLevel = z.infer<
  typeof assumptionRiskLevelSchema
>;
export type AssumptionMaterialImpactLevel = z.infer<
  typeof assumptionMaterialImpactLevelSchema
>;
export type AssumptionMaterialImpact = z.infer<
  typeof assumptionMaterialImpactSchema
>;
export type AssumptionConfidenceImpactLevel = z.infer<
  typeof assumptionConfidenceImpactLevelSchema
>;
export type AssumptionConfidenceImpact = z.infer<
  typeof assumptionConfidenceImpactSchema
>;
export type AssumptionStatus = z.infer<typeof assumptionStatusSchema>;
export type Assumption = z.infer<typeof assumptionSchema>;
