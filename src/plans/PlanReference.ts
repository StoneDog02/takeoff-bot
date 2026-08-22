import { z } from "zod";

import { evidenceIdSchema } from "../core/schemas/identity.schema.js";
import { sourceLocationSchema } from "../core/schemas/source.schema.js";

/**
 * Navigation/reference facts discovered from plan source text.
 * Distinct from construction Evidence candidates — these authorize
 * inspecting another sheet/detail; they do not assign ownership of
 * every fact on the target page to the originating subject.
 */
export const planReferenceKindSchema = z.enum([
  "detail",
  "sheet",
  "section",
  "schedule",
  "other",
]);

export const planReferenceStatusSchema = z.enum([
  /** Parsed components present; target page may still be unresolved. */
  "parsed",
  /** Target sheet uniquely resolved to a plan page. */
  "resolved",
  /** Label could not be safely parsed as a plan reference. */
  "unresolved",
  /** Multiple possible targets or incomplete/ambiguous syntax. */
  "ambiguous",
]);

export const planReferenceSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
  /** Exact source label as observed (preserve original text). */
  originalText: z.string().trim().min(1),
  kind: planReferenceKindSchema,
  status: planReferenceStatusSchema,
  /** Detail/callout number when explicitly present (e.g. "5" in 5/S5.2). */
  detailNumber: z.string().trim().min(1).nullable().default(null),
  /**
   * Inclusive detail range when the source uses THRU syntax (e.g. 6 thru 9).
   * Preserves navigation honesty without selecting a single detailNumber.
   * V1 queue keeps such items ambiguous — does not auto-extract each detail.
   */
  detailNumberFrom: z.string().trim().min(1).nullable().default(null),
  detailNumberTo: z.string().trim().min(1).nullable().default(null),
  /** Architectural sheet id when parseable (e.g. S5.2). */
  targetSheetId: z.string().trim().min(1).nullable().default(null),
  /** Resolved plan page number when uniquely matched. */
  targetPageNumber: z.number().int().positive().nullable().default(null),
  /** Where the reference was observed. */
  source: sourceLocationSchema,
  /** Optional originating Evidence id that carried the reference. */
  originatingEvidenceId: evidenceIdSchema.nullable().default(null),
  originatingSubjectKind: z.string().trim().min(1).nullable().default(null),
  originatingSubjectKey: z.string().trim().min(1).nullable().default(null),
  notes: z.array(z.string().trim().min(1)).default([]),
});

export type PlanReferenceKind = z.infer<typeof planReferenceKindSchema>;
export type PlanReferenceStatus = z.infer<typeof planReferenceStatusSchema>;
export type PlanReference = z.infer<typeof planReferenceSchema>;

export const planReferenceInventorySchema = z.object({
  references: z.array(planReferenceSchema),
});

export type PlanReferenceInventory = z.infer<typeof planReferenceInventorySchema>;
