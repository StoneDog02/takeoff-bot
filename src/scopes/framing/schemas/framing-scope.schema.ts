import { z } from "zod";

import {
  artifactIdSchema,
  confidenceEvaluationIdSchema,
  reviewItemIdSchema,
  validationIssueIdSchema,
  validationResultIdSchema,
} from "../../../core/schemas/identity.schema.js";

function hasDuplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

/**
 * Artifact IDs for the framing subsystems this scope coordinates.
 *
 * Each slot is nullable until that subsystem artifact exists. Construction
 * objects, review items, validation records, and confidence evaluations are
 * not embedded here.
 */
export const framingScopeSubsystemArtifactIdsSchema = z.object({
  wallFraming: artifactIdSchema.nullable().default(null),
  floorFraming: artifactIdSchema.nullable().default(null),
  roofFraming: artifactIdSchema.nullable().default(null),
  openings: artifactIdSchema.nullable().default(null),
  structuralMembers: artifactIdSchema.nullable().default(null),
  sheathing: artifactIdSchema.nullable().default(null),
  blocking: artifactIdSchema.nullable().default(null),
  connectorsHardware: artifactIdSchema.nullable().default(null),
  assumptions: artifactIdSchema.nullable().default(null),
  validation: artifactIdSchema.nullable().default(null),
  confidence: artifactIdSchema.nullable().default(null),
});

/**
 * Coordinator snapshot for one framing pipeline run.
 *
 * This is a container object, not a resolved construction object. Material
 * quantities and object ID lists belong on Framing Takeoff. Envelope lineage
 * still records inputs and parents.
 */
export const framingScopeSchema = z
  .object({
    scopeName: z.literal("framing"),
    subsystemArtifactIds: framingScopeSubsystemArtifactIdsSchema.default(
      {},
    ),
    reviewItemIds: z.array(reviewItemIdSchema).default([]),
    validationIssueIds: z.array(validationIssueIdSchema).default([]),
    validationResultIds: z.array(validationResultIdSchema).default([]),
    confidenceEvaluationIds: z
      .array(confidenceEvaluationIdSchema)
      .default([]),
  })
  .superRefine((scope, context) => {
    const subsystemArtifactIds = Object.values(
      scope.subsystemArtifactIds,
    ).filter((artifactId): artifactId is NonNullable<typeof artifactId> =>
      artifactId !== null,
    );

    if (hasDuplicates(subsystemArtifactIds)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["subsystemArtifactIds"],
        message:
          "subsystemArtifactIds must not contain duplicate artifact IDs.",
      });
    }

    const relationshipCollections: Array<[string, readonly string[]]> = [
      ["reviewItemIds", scope.reviewItemIds],
      ["validationIssueIds", scope.validationIssueIds],
      ["validationResultIds", scope.validationResultIds],
      ["confidenceEvaluationIds", scope.confidenceEvaluationIds],
    ];

    for (const [path, ids] of relationshipCollections) {
      if (hasDuplicates(ids)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [path],
          message: `${path} must not contain duplicate IDs.`,
        });
      }
    }
  });

export type FramingScopeSubsystemArtifactIds = z.infer<
  typeof framingScopeSubsystemArtifactIdsSchema
>;
export type FramingScope = z.infer<typeof framingScopeSchema>;
