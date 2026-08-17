import { z } from "zod";

import { objectIdSchema } from "../../../core/schemas/identity.schema.js";
import { resolvedObjectBaseSchema } from "../../../core/schemas/resolved-object.schema.js";

/**
 * Structural load-transfer devices associated with members.
 *
 * Hardware and fasteners are referenced by ID. They are not embedded
 * and are not classified as structural members.
 */
export const connectorSchema = resolvedObjectBaseSchema.extend({
  objectType: z.literal("connector"),
  connectorType: z.string().trim().min(1).nullable().default(null),
  model: z.string().trim().min(1).nullable().default(null),
  associatedObjectIds: z.array(objectIdSchema).default([]),
  hardwareIds: z.array(objectIdSchema).default([]),
  fastenerIds: z.array(objectIdSchema).default([]),
});

/**
 * Mechanical fastening. Quantity is stored only when specified on the
 * plans; fastener schedules are not inferred here.
 */
export const fastenerSchema = resolvedObjectBaseSchema.extend({
  objectType: z.literal("fastener"),
  fastenerType: z.string().trim().min(1).nullable().default(null),
  diameter: z.string().trim().min(1).nullable().default(null),
  length: z.string().trim().min(1).nullable().default(null),
  coating: z.string().trim().min(1).nullable().default(null),
  quantity: z.number().int().positive().nullable().default(null),
  associatedObjectIds: z.array(objectIdSchema).default([]),
});

/**
 * Miscellaneous framing hardware extracted only when relevant to
 * framing scope.
 */
export const hardwareSchema = resolvedObjectBaseSchema.extend({
  objectType: z.literal("hardware"),
  hardwareType: z.string().trim().min(1).nullable().default(null),
  associatedObjectIds: z.array(objectIdSchema).default([]),
});

export type Connector = z.infer<typeof connectorSchema>;
export type Fastener = z.infer<typeof fastenerSchema>;
export type Hardware = z.infer<typeof hardwareSchema>;
