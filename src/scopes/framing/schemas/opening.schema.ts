import { z } from "zod";

import { objectIdSchema } from "../../../core/schemas/identity.schema.js";
import { resolvedObjectBaseSchema } from "../../../core/schemas/resolved-object.schema.js";

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

export const openingDimensionsSchema = z.object({
  nominalWidthFeet: z.number().finite().positive().nullable().default(null),
  nominalHeightFeet: z.number().finite().positive().nullable().default(null),
  roughWidthFeet: z.number().finite().positive().nullable().default(null),
  roughHeightFeet: z.number().finite().positive().nullable().default(null),
});

export const openingSchema = resolvedObjectBaseSchema.extend({
  objectType: z.literal("opening"),
  category: openingCategorySchema,
  parentObjectId: objectIdSchema,
  parentWallId: objectIdSchema.nullable().default(null),
  dimensions: openingDimensionsSchema,
  quantity: z.number().int().positive(),
  scheduleReference: z.string().trim().min(1).nullable().default(null),
  detailReference: z.string().trim().min(1).nullable().default(null),
  headerMemberId: objectIdSchema.nullable().default(null),
  fireRating: z.string().trim().min(1).nullable().default(null),
});

export type OpeningCategory = z.infer<typeof openingCategorySchema>;
export type OpeningDimensions = z.infer<typeof openingDimensionsSchema>;
export type Opening = z.infer<typeof openingSchema>;
