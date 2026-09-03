import { z } from "zod";

import { objectIdSchema } from "../../../core/schemas/identity.schema.js";
import { framingMaterialLineItemSchema } from "./material.schema.js";

/**
 * Legacy Stage-16 takeoff envelope (kept only for frozen artifact parsing).
 * Production output is reset-takeoff.json (see reset/resetTakeoff.schema.ts).
 */
export const framingTakeoffStatusSchema = z.enum([
  "completed",
  "completed-with-review",
  "blocked",
  "failed",
]);

export const framingTakeoffSummarySchema = z.object({
  wallCount: z.number().int().nonnegative(),
  wallSegmentCount: z.number().int().nonnegative(),
  openingCount: z.number().int().nonnegative(),
  structuralMemberCount: z.number().int().nonnegative(),
  floorFramingSystemCount: z.number().int().nonnegative().default(0),
  floorFramingAreaCount: z.number().int().nonnegative().default(0),
  roofFramingSystemCount: z.number().int().nonnegative().default(0),
  roofPlaneCount: z.number().int().nonnegative().default(0),
  sheathingSystemCount: z.number().int().nonnegative().default(0),
  sheathingAreaCount: z.number().int().nonnegative().default(0),
  blockingCount: z.number().int().nonnegative().default(0),
  connectorCount: z.number().int().nonnegative().default(0),
  hardwareCount: z.number().int().nonnegative().default(0),
  fastenerCount: z.number().int().nonnegative().default(0),
  materialLineItemCount: z.number().int().nonnegative(),
  reviewItemCount: z.number().int().nonnegative().default(0),
  validationIssueCount: z.number().int().nonnegative().default(0),
});

export const framingTakeoffSchema = z.object({
  projectId: z.string().trim().min(1),
  scopeName: z.literal("framing"),
  executionMode: z.enum(["mock", "anthropic"]).optional(),
  status: framingTakeoffStatusSchema.optional(),
  wallIds: z.array(objectIdSchema).default([]),
  wallSegmentIds: z.array(objectIdSchema).default([]),
  openingIds: z.array(objectIdSchema).default([]),
  structuralMemberIds: z.array(objectIdSchema).default([]),
  floorFramingSystemIds: z.array(objectIdSchema).default([]),
  floorFramingAreaIds: z.array(objectIdSchema).default([]),
  roofFramingSystemIds: z.array(objectIdSchema).default([]),
  roofPlaneIds: z.array(objectIdSchema).default([]),
  sheathingSystemIds: z.array(objectIdSchema).default([]),
  sheathingAreaIds: z.array(objectIdSchema).default([]),
  blockingIds: z.array(objectIdSchema).default([]),
  connectorIds: z.array(objectIdSchema).default([]),
  hardwareIds: z.array(objectIdSchema).default([]),
  fastenerIds: z.array(objectIdSchema).default([]),
  materials: z.array(framingMaterialLineItemSchema).default([]),
  summary: framingTakeoffSummarySchema.optional(),
});

export type FramingTakeoffStatus = z.infer<
  typeof framingTakeoffStatusSchema
>;
export type FramingTakeoffSummary = z.infer<
  typeof framingTakeoffSummarySchema
>;
export type FramingTakeoff = z.infer<typeof framingTakeoffSchema>;
