import { z } from "zod";

import { objectIdSchema } from "../../../core/schemas/identity.schema.js";
import { resolvedObjectBaseSchema } from "../../../core/schemas/resolved-object.schema.js";

export const roofConstructionPhaseSchema = z.enum([
  "new",
  "existing",
  "demolition",
  "unknown",
]);

/**
 * Typical roof-assembly properties for a system.
 *
 * Individual rafters, trusses, ridge/hip/valley members, sheathing,
 * blocking, and connectors are referenced by ID from planes. They are
 * not owned here.
 */
export const roofFramingAssemblySchema = z.object({
  framingType: z.string().trim().min(1).nullable().default(null),
  memberSize: z.string().trim().min(1).nullable().default(null),
  memberSpacingInches: z.number().finite().positive().nullable().default(null),
});

export const roofFramingSystemSchema = resolvedObjectBaseSchema.extend({
  objectType: z.literal("roof-framing-system"),
  name: z.string().trim().min(1),
  level: z.string().trim().min(1),
  constructionPhase: roofConstructionPhaseSchema,
  assembly: roofFramingAssemblySchema,
  planeIds: z.array(objectIdSchema).default([]),
});

export const roofPlaneSchema = resolvedObjectBaseSchema.extend({
  objectType: z.literal("roof-plane"),
  parentSystemId: objectIdSchema,
  layout: z.string().trim().min(1).nullable().default(null),
  framingDirection: z.string().trim().min(1).nullable().default(null),
  spanDirection: z.string().trim().min(1).nullable().default(null),
  pitch: z.string().trim().min(1).nullable().default(null),
  areaSquareFeet: z.number().finite().positive().nullable().default(null),
  boundingWallIds: z.array(objectIdSchema).default([]),
  openingIds: z.array(objectIdSchema).default([]),
  structuralMemberIds: z.array(objectIdSchema).default([]),
});

export type RoofConstructionPhase = z.infer<typeof roofConstructionPhaseSchema>;
export type RoofFramingAssembly = z.infer<typeof roofFramingAssemblySchema>;
export type RoofFramingSystem = z.infer<typeof roofFramingSystemSchema>;
export type RoofPlane = z.infer<typeof roofPlaneSchema>;
