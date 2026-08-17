import { z } from "zod";

import {
  artifactIdSchema,
  identifierSchema,
  pipelineRunIdSchema,
} from "./identity.schema.js";

/**
 * Identifies the kind of producer that created an artifact.
 *
 * Producer provenance describes who or what created the artifact.
 * It does not describe evidence provenance or resolution method.
 */
export const artifactProducerTypeSchema = z.enum([
  "system",
  "claude",
  "user",
  "import",
]);

/**
 * Preserves structured provenance for the producer of an artifact.
 *
 * identifier may contain a stable user ID, service name, model identifier,
 * importer name, or other producer-specific identifier when available.
 */
export const artifactProducerSchema = z.object({
  type: artifactProducerTypeSchema,
  identifier: z.string().trim().min(1).nullable().default(null),
});

/**
 * Semantic version used for artifact schemas and engine releases.
 */
export const semanticVersionSchema = z
  .string()
  .trim()
  .regex(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/,
    "Version must be a valid semantic version.",
  );

/**
 * Describes the version state of one persisted artifact snapshot.
 *
 * schemaVersion identifies the validation contract.
 * artifactVersion identifies the revision within the logical artifact lineage.
 * engineVersion identifies the engine release that produced the artifact.
 */
export const artifactVersionSchema = z.object({
  schemaVersion: semanticVersionSchema,
  artifactVersion: z.number().int().positive(),
  engineVersion: semanticVersionSchema.nullable().default(null),
});

/**
 * Preserves computation dependencies and artifact derivation lineage.
 *
 * inputArtifactIds identify artifacts consumed to produce this artifact.
 * parentArtifactIds identify direct predecessor or derivation artifacts.
 */
export const artifactLineageSchema = z
  .object({
    inputArtifactIds: z.array(artifactIdSchema).default([]),
    parentArtifactIds: z.array(artifactIdSchema).default([]),
  })
  .superRefine((lineage, context) => {
    const duplicateInputIds = lineage.inputArtifactIds.filter(
      (artifactId, index, artifactIds) =>
        artifactIds.indexOf(artifactId) !== index,
    );

    if (duplicateInputIds.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["inputArtifactIds"],
        message: "inputArtifactIds must not contain duplicate artifact IDs.",
      });
    }

    const duplicateParentIds = lineage.parentArtifactIds.filter(
      (artifactId, index, artifactIds) =>
        artifactIds.indexOf(artifactId) !== index,
    );

    if (duplicateParentIds.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["parentArtifactIds"],
        message: "parentArtifactIds must not contain duplicate artifact IDs.",
      });
    }
  });

type ArtifactEnvelopeRefinementInput = {
  artifactId: z.infer<typeof artifactIdSchema>;
  createdAt: string;
  lastModifiedAt: string;
  inputArtifactIds: z.infer<typeof artifactIdSchema>[];
  parentArtifactIds: z.infer<typeof artifactIdSchema>[];
};

function refineArtifactEnvelope(
  artifact: ArtifactEnvelopeRefinementInput,
  context: z.RefinementCtx,
): void {
  const createdAt = Date.parse(artifact.createdAt);
  const lastModifiedAt = Date.parse(artifact.lastModifiedAt);

  if (lastModifiedAt < createdAt) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["lastModifiedAt"],
      message: "lastModifiedAt cannot be earlier than createdAt.",
    });
  }

  const duplicateInputIds = artifact.inputArtifactIds.filter(
    (artifactId, index, artifactIds) =>
      artifactIds.indexOf(artifactId) !== index,
  );

  if (duplicateInputIds.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["inputArtifactIds"],
      message: "inputArtifactIds must not contain duplicate artifact IDs.",
    });
  }

  const duplicateParentIds = artifact.parentArtifactIds.filter(
    (artifactId, index, artifactIds) =>
      artifactIds.indexOf(artifactId) !== index,
  );

  if (duplicateParentIds.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["parentArtifactIds"],
      message: "parentArtifactIds must not contain duplicate artifact IDs.",
    });
  }

  if (artifact.inputArtifactIds.includes(artifact.artifactId)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["inputArtifactIds"],
      message: "An artifact cannot reference itself as an input artifact.",
    });
  }

  if (artifact.parentArtifactIds.includes(artifact.artifactId)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["parentArtifactIds"],
      message: "An artifact cannot reference itself as a parent artifact.",
    });
  }
}

/**
 * Shared persistence, provenance, versioning, and lineage foundation for
 * deterministic engine artifacts.
 *
 * This schema does not contain payload data. Use
 * createArtifactEnvelopeSchema(payloadSchema) to create a complete,
 * strongly typed artifact envelope.
 *
 * Concrete artifact schemas should narrow artifactType to a literal value.
 */
export const artifactEnvelopeBaseObjectSchema = z.object({
  artifactId: artifactIdSchema,

  /**
   * Generic here so the core schema remains scope-agnostic.
   * Concrete artifact schemas should override this with a literal.
   */
  artifactType: z.string().trim().min(1),

  schemaVersion: semanticVersionSchema,
  artifactVersion: z.number().int().positive(),
  engineVersion: semanticVersionSchema.nullable().default(null),

  pipelineRunId: pipelineRunIdSchema,

  /**
   * Nullable until the engine establishes a dedicated branded ProjectId.
   */
  projectId: identifierSchema.nullable().default(null),

  createdAt: z.string().datetime({ offset: true }),
  lastModifiedAt: z.string().datetime({ offset: true }),

  producer: artifactProducerSchema,

  inputArtifactIds: z.array(artifactIdSchema).default([]),
  parentArtifactIds: z.array(artifactIdSchema).default([]),
});

export const artifactEnvelopeBaseSchema =
  artifactEnvelopeBaseObjectSchema.superRefine(refineArtifactEnvelope);

/**
 * Creates a complete artifact-envelope schema for a typed payload.
 *
 * The payload schema is supplied by the owning scope or subsystem while the
 * shared envelope preserves universal persistence and execution metadata.
 */
export const createArtifactEnvelopeSchema = <
  TPayloadSchema extends z.ZodTypeAny,
>(
  payloadSchema: TPayloadSchema,
) =>
  artifactEnvelopeBaseObjectSchema
    .extend({
      payload: payloadSchema,
    })
    .superRefine(refineArtifactEnvelope);

/**
 * Creates a complete envelope whose artifact type is narrowed to a stable
 * literal. Scope-owned artifacts should prefer this helper.
 */
export const createTypedArtifactEnvelopeSchema = <
  TArtifactType extends string,
  TPayloadSchema extends z.ZodTypeAny,
>(artifactType: TArtifactType, payloadSchema: TPayloadSchema) =>
  artifactEnvelopeBaseObjectSchema
    .extend({
      artifactType: z.literal(artifactType),
      payload: payloadSchema,
    })
    .superRefine(refineArtifactEnvelope);

export type ArtifactProducerType = z.infer<
  typeof artifactProducerTypeSchema
>;
export type ArtifactProducer = z.infer<typeof artifactProducerSchema>;
export type SemanticVersion = z.infer<typeof semanticVersionSchema>;
export type ArtifactVersion = z.infer<typeof artifactVersionSchema>;
export type ArtifactLineage = z.infer<typeof artifactLineageSchema>;
export type ArtifactEnvelopeBase = z.infer<
  typeof artifactEnvelopeBaseSchema
>;

export type ArtifactEnvelope<TPayload> = ArtifactEnvelopeBase & {
  payload: TPayload;
};
