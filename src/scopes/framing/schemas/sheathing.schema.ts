import { z } from "zod";

import { objectIdSchema } from "../../../core/schemas/identity.schema.js";
import { resolvedObjectBaseSchema } from "../../../core/schemas/resolved-object.schema.js";

export const sheathingApplicationSchema = z.enum([
  "wall",
  "floor",
  "roof",
  "unknown",
]);

export const sheathingConstructionPhaseSchema = z.enum([
  "new",
  "existing",
  "demolition",
  "unknown",
]);

/**
 * Plan-stated panel specification for a sheathing system.
 *
 * These fields record extracted specification data. They do not define
 * material taxonomy or compute panel counts.
 */
export const sheathingPanelSpecificationSchema = z.object({
  panelType: z.string().trim().min(1).nullable().default(null),
  thickness: z.string().trim().min(1).nullable().default(null),
  grade: z.string().trim().min(1).nullable().default(null),
  spanRating: z.string().trim().min(1).nullable().default(null),
  exposureRating: z.string().trim().min(1).nullable().default(null),
  edgeTreatment: z.string().trim().min(1).nullable().default(null),
  specificationReference: z.string().trim().min(1).nullable().default(null),
});

export const sheathingSystemSchema = resolvedObjectBaseSchema.extend({
  objectType: z.literal("sheathing-system"),
  name: z.string().trim().min(1),
  level: z.string().trim().min(1),
  application: sheathingApplicationSchema,
  constructionPhase: sheathingConstructionPhaseSchema,
  panelSpecification: sheathingPanelSpecificationSchema,
  areaIds: z.array(objectIdSchema).default([]),
});

export const sheathingAreaSchema = resolvedObjectBaseSchema.extend({
  objectType: z.literal("sheathing-area"),
  parentSystemId: objectIdSchema,
  layout: z.string().trim().min(1).nullable().default(null),
  areaSquareFeet: z.number().finite().positive().nullable().default(null),
  coveredObjectIds: z.array(objectIdSchema).default([]),
  openingIds: z.array(objectIdSchema).default([]),
});

export type SheathingApplication = z.infer<typeof sheathingApplicationSchema>;
export type SheathingConstructionPhase = z.infer<
  typeof sheathingConstructionPhaseSchema
>;
export type SheathingPanelSpecification = z.infer<
  typeof sheathingPanelSpecificationSchema
>;
export type SheathingSystem = z.infer<typeof sheathingSystemSchema>;
export type SheathingArea = z.infer<typeof sheathingAreaSchema>;
