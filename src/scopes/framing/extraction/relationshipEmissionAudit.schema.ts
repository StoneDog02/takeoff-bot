import { z } from "zod";

import { createTypedArtifactEnvelopeSchema } from "../../../core/schemas/artifact-envelope.schema.js";

export const relationshipEmissionAuditEntrySchema = z.object({
  areaSubjectKey: z.string().trim().min(1),
  domain: z.enum(["floor", "sheathing", "roof"]),
  proofClass: z
    .enum(["P1", "P2", "P3", "P4", "extraction", "CONSTRUCTION_SEMANTIC", "none"])
    .optional(),
  systemTag: z.string().trim().min(1).nullable(),
  bridgeEvidenceId: z.string().trim().min(1).nullable(),
  authorizingEvidenceIds: z.array(z.string().trim().min(1)),
});

export const constructionSemanticAuditEntrySchema = z.object({
  pageNumber: z.number().int().positive(),
  regionLabel: z.string(),
  areaSubjectKey: z.string().nullable(),
  systemSubjectKey: z.string().nullable(),
  status: z.enum(["accepted", "rejected", "candidate"]),
  reason: z.string().nullable(),
  supportScore: z.number().nullable(),
  conflictCandidates: z.array(z.string()),
  authorizingEvidenceIds: z.array(z.string().trim().min(1)),
});

export const relationshipEmissionAuditPayloadSchema = z.object({
  parentSystemTagCount: z.number().int().nonnegative(),
  parentSystemTagBySubjectKind: z.record(z.string(), z.number().int().nonnegative()),
  bridgeEmissionCount: z.number().int().nonnegative(),
  bridgeByProofClass: z.record(z.string(), z.number().int().nonnegative()),
  semanticAuthorityCandidates: z.number().int().nonnegative().optional(),
  semanticAuthorityAccepted: z.number().int().nonnegative().optional(),
  semanticAuthorityRejected: z.record(z.string(), z.number().int().nonnegative()).optional(),
  constructionSemanticEmissionCount: z.number().int().nonnegative().optional(),
  relationshipsByAuthorityClass: z.record(z.string(), z.number().int().nonnegative()).optional(),
  ambiguousAuthorityCount: z.number().int().nonnegative().optional(),
  conflictCandidatesPreserved: z.array(z.string()).optional(),
  constructionSemanticEntries: z.array(constructionSemanticAuditEntrySchema).optional(),
  entries: z.array(relationshipEmissionAuditEntrySchema),
});

export type RelationshipEmissionAuditPayload = z.infer<
  typeof relationshipEmissionAuditPayloadSchema
>;

export const relationshipEmissionAuditArtifactSchema =
  createTypedArtifactEnvelopeSchema(
    "relationship-emission-audit",
    relationshipEmissionAuditPayloadSchema,
  );
