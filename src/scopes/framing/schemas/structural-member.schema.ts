import { z } from "zod";

import { objectIdSchema } from "../../../core/schemas/identity.schema.js";
import { resolvedObjectBaseSchema } from "../../../core/schemas/resolved-object.schema.js";

export const structuralMemberCategorySchema = z.enum([
  "header",
  "beam",
  "girder",
  "joist",
  "rim-board",
  "rafter",
  "truss",
  "post",
  "column",
  "built-up-member",
  "steel-member",
  "other",
  "unknown",
]);

export const structuralMemberSchema = resolvedObjectBaseSchema.extend({
  objectType: z.literal("structural-member"),
  category: structuralMemberCategorySchema,
  materialType: z.string().trim().min(1).nullable().default(null),
  size: z.string().trim().min(1).nullable().default(null),
  plyCount: z.number().int().positive().nullable().default(null),
  lengthFeet: z.number().finite().positive().nullable().default(null),
  quantity: z.number().int().positive(),
  location: z.string().trim().min(1),
  associatedObjectIds: z.array(objectIdSchema).default([]),
  supportedObjectIds: z.array(objectIdSchema).default([]),
  supportingObjectIds: z.array(objectIdSchema).default([]),
  connectorIds: z.array(objectIdSchema).default([]),
});

export type StructuralMemberCategory = z.infer<
  typeof structuralMemberCategorySchema
>;
export type StructuralMember = z.infer<typeof structuralMemberSchema>;
