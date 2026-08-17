import { z } from "zod";

import { objectIdSchema } from "../../../core/schemas/identity.schema.js";
import { resolvedObjectBaseSchema } from "../../../core/schemas/resolved-object.schema.js";

export const blockingStructuralRoleSchema = z.enum([
  "structural",
  "non-structural",
  "unknown",
]);

export const blockingSchema = resolvedObjectBaseSchema.extend({
  objectType: z.literal("blocking"),
  blockingType: z.string().trim().min(1).nullable().default(null),
  purpose: z.string().trim().min(1).nullable().default(null),
  structuralRole: blockingStructuralRoleSchema,
  material: z.string().trim().min(1).nullable().default(null),
  size: z.string().trim().min(1).nullable().default(null),
  spacingInches: z.number().finite().positive().nullable().default(null),
  location: z.string().trim().min(1).nullable().default(null),
  detailReference: z.string().trim().min(1).nullable().default(null),
  associatedObjectIds: z.array(objectIdSchema).default([]),
});

export type BlockingStructuralRole = z.infer<
  typeof blockingStructuralRoleSchema
>;
export type Blocking = z.infer<typeof blockingSchema>;
