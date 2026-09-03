import { z } from "zod";

import { semanticTextCategorySchema } from "../type-marks/classifySemanticTextCandidate.js";

const semanticTextCategoryZod = z.enum(semanticTextCategorySchema);

export const semanticBindingAuthorityGradeSchema = z.enum(["A", "B"]);
export const semanticBindingRelationshipSchema = z.enum([
  "direct-mark",
  "dereferenced-reference",
  "graphic-convention",
]);
export const semanticBindingStatusSchema = z.enum([
  "assigned",
  "ambiguous",
  "conflict",
  "rejected",
]);

export const semanticBindingAuthorityMethodSchema = z.enum([
  "mark-spatial-ownership",
  "mark-enclosure-unique",
  "tag-anchored-leader",
  "tag-spatial-proximity",
  "graphic-convention-coincidence",
  "dereferenced-key-equality",
]);

export const physicalRunSemanticBindingSchema = z.object({
  bindingId: z.string().trim().min(1),
  physicalRunKey: z.string().trim().min(1),
  semanticSubjectKey: z.string().trim().min(1),
  semanticTextCategory: z.literal("type-or-assembly-identifier"),
  relationship: semanticBindingRelationshipSchema,
  authorityMethod: semanticBindingAuthorityMethodSchema,
  authorityGrade: semanticBindingAuthorityGradeSchema,
  status: semanticBindingStatusSchema,
  emit: z.boolean(),
  sourcePageNumber: z.number().int().positive(),
  sourceTextPrimitiveId: z.string().trim().min(1).nullable(),
  spatialScore: z.number().nullable(),
  uniquenessMargin: z.number().nullable(),
  competingCandidates: z.array(
    z.object({
      semanticSubjectKey: z.string(),
      score: z.number(),
      reason: z.string(),
    }),
  ),
  notes: z.array(z.string().trim().min(1)).default([]),
});

export const topologicalPropagationOpportunitySchema = z.object({
  physicalRunKey: z.string().trim().min(1),
  connectedRunKey: z.string().trim().min(1),
  seedBindingId: z.string().trim().min(1).nullable(),
  reasonNotEmitted: z.literal("propagation-deferred-to-L.1"),
  junctionKind: z.string().nullable(),
  notes: z.array(z.string().trim().min(1)).default([]),
});

export const typeMarkOwnershipAssociationSchema = z.object({
  textPrimitiveId: z.string(),
  semanticSubjectKey: z.string(),
  semanticTextCategory: semanticTextCategoryZod,
  runId: z.string().optional(),
  physicalRunKey: z.string().optional(),
  orientation: z.enum(["H", "V"]).optional(),
  status: z.enum(["associated", "ambiguous", "unassociated", "rejected-category"]),
  spatialScore: z.number().optional(),
  uniquenessMargin: z.number().optional(),
  normalDist: z.number().optional(),
  rawText: z.string(),
});

export const semanticBindingAuditSchema = z.object({
  typeIdentifierCount: z.number().int().nonnegative(),
  propertyPhraseCount: z.number().int().nonnegative(),
  generalNoteCount: z.number().int().nonnegative(),
  directEmitCount: z.number().int().nonnegative(),
  ambiguousCount: z.number().int().nonnegative(),
  conflictCount: z.number().int().nonnegative(),
  rejectedCategoryCount: z.number().int().nonnegative(),
  propagationOpportunityCount: z.number().int().nonnegative(),
  eligibleButUnboundRuns: z.number().int().nonnegative(),
  emitBindingIds: z.array(z.string()),
  bindings: z.array(physicalRunSemanticBindingSchema),
  propagationOpportunities: z.array(topologicalPropagationOpportunitySchema),
  ownershipAssociations: z.array(typeMarkOwnershipAssociationSchema),
});

export type PhysicalRunSemanticBinding = z.infer<
  typeof physicalRunSemanticBindingSchema
>;
export type TopologicalPropagationOpportunity = z.infer<
  typeof topologicalPropagationOpportunitySchema
>;
export type SemanticBindingAudit = z.infer<typeof semanticBindingAuditSchema>;
export type TypeMarkOwnershipAssociation = z.infer<
  typeof typeMarkOwnershipAssociationSchema
>;
