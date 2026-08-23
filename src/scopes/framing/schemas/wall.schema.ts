import { z } from "zod";

import { objectIdSchema } from "../../../core/schemas/identity.schema.js";
import { resolvedObjectBaseSchema } from "../../../core/schemas/resolved-object.schema.js";

export const wallLocationSchema = z.enum([
  "exterior",
  "interior",
  "unknown",
]);

export const wallBearingStatusSchema = z.enum([
  "bearing",
  "non-bearing",
  "unknown",
]);

export const wallConstructionPhaseSchema = z.enum([
  "new",
  "existing",
  "demolition",
  "unknown",
]);

export const wallAssemblySchema = z.object({
  material: z.string().trim().min(1).nullable().default(null),
  studSize: z.string().trim().min(1).nullable().default(null),
  studSpacingInches: z.number().finite().positive().nullable().default(null),
  heightFeet: z.number().finite().positive().nullable().default(null),
  plateCount: z.number().int().positive().nullable().default(null),
  sheathing: z.string().trim().min(1).nullable().default(null),
});

export const semanticBindingAuthorityGradeSchema = z.enum(["A", "B"]);

export const buildingWallSchema = resolvedObjectBaseSchema.extend({
  objectType: z.literal("building-wall"),
  name: z.string().trim().min(1),
  /**
   * Building level is a construction fact. It stays null until Evidence
   * (or a later assumption slice) can resolve it. Do not invent a floor.
   */
  level: z.string().trim().min(1).nullable().default(null),
  wallType: z.string().trim().min(1).nullable().default(null),
  /** Governed semantic type identifier (e.g. SW2) bound to this physical instance. */
  semanticTypeKey: z.string().trim().min(1).nullable().default(null),
  bindingAuthorityGrade: semanticBindingAuthorityGradeSchema.nullable().default(null),
  location: wallLocationSchema,
  bearingStatus: wallBearingStatusSchema,
  isShearOrBraced: z.boolean().nullable().default(null),
  fireRating: z.string().trim().min(1).nullable().default(null),
  constructionPhase: wallConstructionPhaseSchema,
  assembly: wallAssemblySchema,
  segmentIds: z.array(objectIdSchema).default([]),
});

export const wallSegmentSchema = resolvedObjectBaseSchema.extend({
  objectType: z.literal("wall-segment"),
  parentWallId: objectIdSchema,
  lengthFeet: z.number().finite().positive().nullable().default(null),
  openingIds: z.array(objectIdSchema).default([]),
});

export type WallLocation = z.infer<typeof wallLocationSchema>;
export type WallBearingStatus = z.infer<typeof wallBearingStatusSchema>;
export type WallAssembly = z.infer<typeof wallAssemblySchema>;
export type BuildingWall = z.infer<typeof buildingWallSchema>;
export type WallSegment = z.infer<typeof wallSegmentSchema>;
