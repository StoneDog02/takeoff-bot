import { z } from "zod";

import { evidenceIdSchema } from "./identity.schema.js";
import {
  sourceLocationSchema,
  sourceReferenceSchema,
} from "./source.schema.js";

/**
 * Describes the kind of source evidence supporting a resolved value or object.
 */
export const evidenceTypeSchema = z.enum([
  "geometry",
  "tag",
  "dimension",
  "schedule",
  "detail",
  "section",
  "note",
  "callout",
  "specification",
  "manufacturer-document",
  "cross-sheet-agreement",
  "repetition-pattern",
  "user-input",
  "other",
]);

/**
 * Describes whether evidence supports or conflicts with the affected value.
 */
export const evidenceRelationshipSchema = z.enum([
  "supports",
  "conflicts",
  "context",
]);

/**
 * Extraction-stable subject/cluster key.
 *
 * Identifies the extraction-time subject this record concerns so evidence
 * from multiple pages or sheets can refer to the same future object. It
 * may be a plan tag, schedule key, or other stable extraction identifier.
 *
 * This is not a resolved ObjectId and does not mean object identity has
 * been assigned.
 */
export const evidenceSubjectKeySchema = z
  .string()
  .trim()
  .min(1, "Evidence subject key is required.")
  .max(128, "Evidence subject key must not exceed 128 characters.");

/**
 * Extraction domain for the future resolved object cluster.
 *
 * Together with subjectKey this identifies which resolver owns a record.
 * Values are limited to domains with an implemented extraction/resolution
 * path; extend the enum when a new domain resolver is added.
 */
export const evidenceSubjectKindSchema = z.enum([
  "wall",
  "structural-member",
  "opening",
  "sheathing-system",
  "sheathing-area",
  "floor-framing-system",
  "floor-framing-area",
  "roof-framing-system",
  "roof-plane",
]);

/**
 * Object-relative property path for the extracted candidate.
 *
 * Uses the same string convention as property resolution traces, such as
 * `assembly.studSize`. Core evidence remains construction-agnostic and does
 * not enumerate domain properties.
 */
export const evidencePropertyPathSchema = z
  .string()
  .trim()
  .min(1, "Evidence property path is required.");

/**
 * Extracted candidate value supported by one evidence record.
 *
 * This is not resolved construction state. Multiple records may target the
 * same subjectKey and propertyPath with different candidate values.
 * Deterministic Resolution later decides which candidate, if any, wins.
 */
export const evidenceCandidateValueSchema = z.union([
  z.string().trim().min(1),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

/**
 * Preserves one atomic extracted candidate fact.
 *
 * Evidence records describe what was found, where it came from, which
 * extraction subject and property they concern, and the candidate value
 * supported by this record. They may support, conflict with, or provide
 * context for that candidate.
 *
 * Multiple records may target the same subjectKind + subjectKey + propertyPath
 * with different candidate values. That is expected: Resolution later detects
 * corroboration and conflict. Evidence does not decide which candidate
 * wins.
 *
 * Confidence evaluation belongs to the Confidence subsystem.
 */
export const evidenceSchema = z.object({
  id: evidenceIdSchema,
  type: evidenceTypeSchema,
  relationship: evidenceRelationshipSchema,
  description: z.string().trim().min(1),
  source: sourceLocationSchema,
  originalText: z.string().trim().min(1).nullable().default(null),
  references: z.array(sourceReferenceSchema).default([]),
  subjectKind: evidenceSubjectKindSchema,
  subjectKey: evidenceSubjectKeySchema,
  propertyPath: evidencePropertyPathSchema,
  candidateValue: evidenceCandidateValueSchema,
});

/**
 * Reusable collection for objects supported by multiple evidence records.
 */
export const evidenceCollectionSchema = z.array(evidenceSchema).default([]);

export type EvidenceType = z.infer<typeof evidenceTypeSchema>;
export type EvidenceRelationship = z.infer<
  typeof evidenceRelationshipSchema
>;
export type EvidenceSubjectKey = z.infer<typeof evidenceSubjectKeySchema>;
export type EvidenceSubjectKind = z.infer<typeof evidenceSubjectKindSchema>;
export type EvidencePropertyPath = z.infer<typeof evidencePropertyPathSchema>;
export type EvidenceCandidateValue = z.infer<
  typeof evidenceCandidateValueSchema
>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type EvidenceCollection = z.infer<
  typeof evidenceCollectionSchema
>;
