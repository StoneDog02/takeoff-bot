import { z } from "zod";

import { objectIdSchema } from "../../../core/schemas/identity.schema.js";
import { resolvedObjectBaseSchema } from "../../../core/schemas/resolved-object.schema.js";

export const floorConstructionPhaseSchema = z.enum([
  "new",
  "existing",
  "demolition",
  "unknown",
]);

/**
 * Typical floor-assembly properties for a system.
 *
 * Individual joists, beams, rim members, sheathing, blocking, and
 * connectors are referenced by ID from areas. They are not owned here.
 */
export const floorFramingAssemblySchema = z.object({
  joistType: z.string().trim().min(1).nullable().default(null),
  joistSize: z.string().trim().min(1).nullable().default(null),
  joistSpacingInches: z.number().finite().positive().nullable().default(null),
  rimBoard: z.string().trim().min(1).nullable().default(null),
});

export const floorFramingSystemSchema = resolvedObjectBaseSchema.extend({
  objectType: z.literal("floor-framing-system"),
  name: z.string().trim().min(1),
  level: z.string().trim().min(1),
  constructionPhase: floorConstructionPhaseSchema,
  assembly: floorFramingAssemblySchema,
  areaIds: z.array(objectIdSchema).default([]),
});

export const floorFramingAreaSchema = resolvedObjectBaseSchema.extend({
  objectType: z.literal("floor-framing-area"),
  parentSystemId: objectIdSchema,
  layout: z.string().trim().min(1).nullable().default(null),
  framingDirection: z.string().trim().min(1).nullable().default(null),
  spanDirection: z.string().trim().min(1).nullable().default(null),
  /**
   * Length of the floor area along the joist spacing axis (perpendicular to
   * span), in feet. Authoritative input for baseline joist count per
   * `knowledge/framing/14-floor-framing-calculations.md`.
   * Must not be reused as installed member length.
   */
  joistLayoutLengthFeet: z.number().finite().positive().nullable().default(null),
  /**
   * Installed material length of one baseline regularly spaced joist member
   * in this area, in feet. Authoritative input for simple-area baseline joist
   * LF per `knowledge/framing/14-floor-framing-calculations.md`.
   * Not clear span, bearing-to-bearing alone, layout length, or stock length.
   */
  joistMemberLengthFeet: z.number().finite().positive().nullable().default(null),
  areaSquareFeet: z.number().finite().positive().nullable().default(null),
  boundingWallIds: z.array(objectIdSchema).default([]),
  openingIds: z.array(objectIdSchema).default([]),
  structuralMemberIds: z.array(objectIdSchema).default([]),
});

export type FloorConstructionPhase = z.infer<
  typeof floorConstructionPhaseSchema
>;
export type FloorFramingAssembly = z.infer<typeof floorFramingAssemblySchema>;
export type FloorFramingSystem = z.infer<typeof floorFramingSystemSchema>;
export type FloorFramingArea = z.infer<typeof floorFramingAreaSchema>;
