import { z } from "zod";

import {
  assumptionIdSchema,
  objectIdSchema,
} from "./identity.schema.js";

/**
 * Describes how a construction object property obtained its current value.
 *
 * The method describes the resolution mechanism, not source precedence
 * or confidence evaluation.
 */
export const resolutionMethodSchema = z.enum([
  "explicit-project-value",
  "deterministic-calculation",
  "approved-default",
  "user-override",
  "supported-inference",
  "semantic-cluster-pending-physical-link",
  /** Explicit identity.boundSubjectKey Evidence merged two opening subjects. */
  "identity-binding-merge",
  "unresolved",
]);

/**
 * Preserves explainable resolution provenance for one object property.
 *
 * propertyPath uses a stable object-relative path such as:
 * - assembly.studSize
 * - geometry.length
 * - classification.bearing
 */
export const propertyResolutionTraceSchema = z.object({
  propertyPath: z.string().trim().min(1),
  method: resolutionMethodSchema,
  explanation: z.string().trim().min(1),
  assumptionIds: z.array(assumptionIdSchema).default([]),
});

/**
 * Shared identity and resolution foundation for construction objects.
 *
 * This schema is intended to be extended by scope-owned construction
 * schemas. It is not a standalone construction object.
 *
 * Scope schemas should narrow objectType to a literal value:
 *
 * objectType: z.literal("wall")
 */
export const resolvedObjectBaseSchema = z.object({
  id: objectIdSchema,

  /**
   * Generic here so the core schema remains scope-agnostic.
   * Concrete domain schemas should override this with a literal.
   */
  objectType: z.string().trim().min(1),

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
