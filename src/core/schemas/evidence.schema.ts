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
 * Preserves one atomic evidence record.
 *
 * Evidence records describe what was found and where it came from.
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
});

/**
 * Reusable collection for objects supported by multiple evidence records.
 */
export const evidenceCollectionSchema = z.array(evidenceSchema).default([]);

export type EvidenceType = z.infer<typeof evidenceTypeSchema>;
export type EvidenceRelationship = z.infer<
  typeof evidenceRelationshipSchema
>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type EvidenceCollection = z.infer<
  typeof evidenceCollectionSchema
>;