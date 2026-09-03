import { z } from "zod";

import { objectIdSchema } from "../../core/schemas/identity.schema.js";
import { resolvedObjectBaseSchema } from "../../core/schemas/resolved-object.schema.js";

export const openingCategorySchema = z.enum([
  "door",
  "window",
  "garage-door",
  "cased",
  "stair",
  "floor",
  "roof",
  "mechanical",
  "other",
  "unknown",
]);

/**
 * M3 identity role. Occurrences may emit framing materials when claim-critical
 * inputs resolve. Schedule definitions and unresolved identity do not emit.
 */
export const openingIdentityRoleSchema = z.enum([
  "occurrence",
  "schedule_definition",
  "unresolved_identity",
]);

export const openingDimensionsSchema = z.object({
  nominalWidthFeet: z.number().finite().positive().nullable().default(null),
  nominalHeightFeet: z.number().finite().positive().nullable().default(null),
  roughWidthFeet: z.number().finite().positive().nullable().default(null),
  roughHeightFeet: z.number().finite().positive().nullable().default(null),
});

export const openingSchema = resolvedObjectBaseSchema.extend({
  objectType: z.literal("opening"),
  category: openingCategorySchema,
  /**
   * Occurrence vs schedule-definition vs unresolved. Never inferred from
   * ObjectId orthography — only Evidence / host / geometry subject authority.
   */
  identityRole: openingIdentityRoleSchema.default("unresolved_identity"),
  /**
   * SubjectKeys absorbed into this opening via explicit identity-binding
   * Evidence. Empty when no cross-subject merge occurred.
   */
  absorbedSubjectKeys: z.array(z.string().trim().min(1)).default([]),
  parentObjectId: objectIdSchema.nullable().default(null),
  parentWallId: objectIdSchema.nullable().default(null),
  dimensions: openingDimensionsSchema,
  quantity: z.number().int().positive().nullable().default(null),
  scheduleReference: z.string().trim().min(1).nullable().default(null),
  detailReference: z.string().trim().min(1).nullable().default(null),
  headerMemberId: objectIdSchema.nullable().default(null),
  fireRating: z.string().trim().min(1).nullable().default(null),
  /**
   * Explicit king stud count for this opening when project evidence resolves it.
   * Null until evidence or an approved assumption path supplies a value.
   */
  kingStudCount: z.number().int().positive().nullable().default(null),
  /**
   * Explicit jack/trimmer stud count per opening occurrence when project
   * evidence resolves it. Null when silent — never defaulted.
   * See `knowledge/framing/13-opening-wall-framing-calculations.md`.
   */
  jackStudCount: z.number().int().positive().nullable().default(null),
  /**
   * Distance from segment start to rough-opening left edge (feet).
   * Required for net regular-stud deductions per ch.13 Layer 2.
   */
  positionOffsetFeetFromSegmentStart: z
    .number()
    .finite()
    .nonnegative()
    .nullable()
    .default(null),
});

export type OpeningCategory = z.infer<typeof openingCategorySchema>;
export type OpeningIdentityRole = z.infer<typeof openingIdentityRoleSchema>;
export type OpeningDimensions = z.infer<typeof openingDimensionsSchema>;
export type Opening = z.infer<typeof openingSchema>;
