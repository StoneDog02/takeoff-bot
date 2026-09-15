import { z } from "zod";

import { objectIdSchema } from "../../core/schemas/identity.schema.js";
import { resolvedObjectBaseSchema } from "../../core/schemas/resolved-object.schema.js";

/**
 * Foundation support type for a sill segment.
 *
 * Spec §17: Support type determines decay-protection condition.
 */
export const foundationSupportTypeSchema = z.enum([
  "concrete-foundation",
  "slab-on-grade",
  "masonry",
  "pier",
  "unknown",
]);

/**
 * Treatment status for a sill plate.
 *
 * Spec §17: FOUND-ASSUME-001 may mark PT when eligible from resolved
 * decay-protection condition. Does NOT assume plate size.
 */
export const sillTreatmentStatusSchema = z.enum([
  "pressure-treated",
  "untreated",
  "unknown",
]);

/**
 * Whether this sill segment is also the wall bottom plate (dual-role).
 *
 * Spec §7, §17: Identify foundation sills and wall bottom plates from actual
 * physical location and function. One plate serving as both concrete/foundation
 * interface and wall bottom plate is one physical plate with both roles;
 * foundation and wall taxonomy categories may reference that same object;
 * installation demand and purchasing occur once. Do NOT universally merge.
 */
export const sillBottomPlateRoleSchema = z.enum([
  "sill-only",
  "dual-role-sill-and-bottom-plate",
]);

/**
 * Typical sill-plate material specification.
 *
 * Spec §17: Missing size → Unresolved. Treatment may be rule/assumption-resolved
 * from an established decay-protection condition, but plate size is not taken
 * from a minimum-code size when the actual assembly is unresolved.
 */
export const sillMaterialSpecSchema = z.object({
  size: z.string().trim().min(1).nullable().default(null),
  treatment: sillTreatmentStatusSchema.default("unknown"),
  species: z.string().trim().min(1).nullable().default(null),
});

/**
 * A foundation sill segment — one physical run of sill plate material.
 *
 * Spec §17: Canonical physical/install demand LF = sum of resolved applicable
 * sill segments. Do NOT mint sills from wall plateCount or building perimeter.
 * Preserve individual segments before stock optimization.
 */
export const foundationSillSegmentSchema = resolvedObjectBaseSchema.extend({
  objectType: z.literal("foundation-sill-segment"),

  /**
   * Length of this segment in feet.
   * Authoritative input for sill LF calculation.
   */
  lengthFeet: z.number().finite().positive().nullable().default(null),

  /**
   * Foundation support type (concrete/slab/masonry/pier).
   */
  supportType: foundationSupportTypeSchema.default("unknown"),

  /**
   * Sill material specification.
   * Missing size results in Unresolved (spec §17).
   */
  material: sillMaterialSpecSchema.default({}),

  /**
   * Whether this segment is also the wall bottom plate.
   * When dual-role, the physicalId is shared with the wall plate.
   */
  plateRole: sillBottomPlateRoleSchema.default("sill-only"),

  /**
   * Associated wall ID when this sill is under a wall.
   */
  parentWallId: objectIdSchema.nullable().default(null),
});

/**
 * Foundation interface container — all foundation sill segments.
 *
 * Spec §17: This is the "foundation-sill bag" on FramingConstruction.
 */
export const foundationInterfacePayloadSchema = z.object({
  sillSegments: z.array(foundationSillSegmentSchema),
});

export type FoundationSupportType = z.infer<typeof foundationSupportTypeSchema>;
export type SillTreatmentStatus = z.infer<typeof sillTreatmentStatusSchema>;
export type SillBottomPlateRole = z.infer<typeof sillBottomPlateRoleSchema>;
export type SillMaterialSpec = z.infer<typeof sillMaterialSpecSchema>;
export type FoundationSillSegment = z.infer<typeof foundationSillSegmentSchema>;
export type FoundationInterfacePayload = z.infer<typeof foundationInterfacePayloadSchema>;
