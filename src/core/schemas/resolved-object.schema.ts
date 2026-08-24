import { z } from "zod";

import {
  assumptionIdSchema,
  evidenceIdSchema,
  objectIdSchema,
  reviewItemIdSchema,
  userDecisionIdSchema,
  validationIssueIdSchema,
} from "./identity.schema.js";
import {
  blockingStatusSchema,
  completionSchema,
  reviewStatusSchema,
} from "./status.schema.js";

/**
 * Describes how a resolved object property obtained its current value.
 *
 * The method describes the resolution mechanism, not the source precedence
 * or confidence evaluation. Those responsibilities belong to their
 * respective subsystems.
 */
export const resolutionMethodSchema = z.enum([
  "explicit-project-value",
  "deterministic-calculation",
  "approved-default",
  "user-override",
  "supported-inference",
  "semantic-cluster-pending-physical-link",
  "unresolved",
]);

/**
 * Preserves explainable resolution provenance for one object property.
 *
 * propertyPath uses a stable object-relative path such as:
 * - assembly.studSize
 * - geometry.length
 * - classification.bearing
 *
 * Related records are referenced by ID to avoid embedding duplicated
 * evidence, assumptions, validation issues, or review items.
 */
export const propertyResolutionTraceSchema = z.object({
  propertyPath: z.string().trim().min(1),
  method: resolutionMethodSchema,
  explanation: z.string().trim().min(1),

  evidenceIds: z.array(evidenceIdSchema).default([]),
  assumptionIds: z.array(assumptionIdSchema).default([]),
  userDecisionIds: z.array(userDecisionIdSchema).default([]),
  validationIssueIds: z
    .array(validationIssueIdSchema)
    .default([]),
  reviewItemIds: z.array(reviewItemIdSchema).default([]),
});

/**
 * Shared lifecycle and provenance foundation for resolved domain objects.
 *
 * This schema is intended to be extended by scope-owned construction
 * schemas. It is not a standalone construction object.
 *
 * Scope schemas should narrow objectType to a literal value:
 *
 * objectType: z.literal("wall")
 *
 * Artifact metadata, execution provenance, timestamps, and schema versions
 * belong in the artifact envelope rather than individual resolved objects.
 */
export const resolvedObjectBaseSchema = z.object({
  id: objectIdSchema,

  /**
   * Generic here so the core schema remains scope-agnostic.
   * Concrete domain schemas should override this with a literal.
   */
  objectType: z.string().trim().min(1),

  /**
   * Current deterministic lifecycle state.
   *
   * Confidence is intentionally excluded because it is evaluated and
   * represented by the separate Confidence subsystem.
   */
  completion: completionSchema,
  reviewStatus: reviewStatusSchema,
  blockingStatus: blockingStatusSchema,

  /**
   * Object-wide relationships to supporting or affecting engine records.
   */
  evidenceIds: z.array(evidenceIdSchema).default([]),
  assumptionIds: z.array(assumptionIdSchema).default([]),
  validationIssueIds: z
    .array(validationIssueIdSchema)
    .default([]),
  reviewItemIds: z.array(reviewItemIdSchema).default([]),

  /**
   * Property-level explanation of how material-driving values were
   * resolved, calculated, defaulted, inferred, overridden, or left
   * unresolved.
   */
  resolutionTraces: z
    .array(propertyResolutionTraceSchema)
    .default([]),
});

export type ResolutionMethod = z.infer<
  typeof resolutionMethodSchema
>;
export type PropertyResolutionTrace = z.infer<
  typeof propertyResolutionTraceSchema
>;
export type ResolvedObjectBase = z.infer<
  typeof resolvedObjectBaseSchema
>;