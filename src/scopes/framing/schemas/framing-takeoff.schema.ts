import { z } from "zod";

import {
  confidenceEvaluationIdSchema,
  objectIdSchema,
  reviewItemIdSchema,
  validationIssueIdSchema,
} from "../../../core/schemas/identity.schema.js";
import {
  blockingStatusSchema,
  completionSchema,
  confidenceLabelSchema,
  reviewStatusSchema,
} from "../../../core/schemas/status.schema.js";
import { framingMaterialLineItemSchema } from "./material.schema.js";

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
  materialLineItemCount: z.number().int().nonnegative(),
  reviewItemCount: z.number().int().nonnegative(),
  validationIssueCount: z.number().int().nonnegative(),
  completion: completionSchema,
  confidenceLabel: confidenceLabelSchema,
  reviewStatus: reviewStatusSchema,
  blockingStatus: blockingStatusSchema,
});

export const framingTakeoffSchema = z.object({
  projectId: z.string().trim().min(1),
  scopeName: z.literal("framing"),
  executionMode: z.enum(["mock", "anthropic"]),
  status: framingTakeoffStatusSchema,
  wallIds: z.array(objectIdSchema).default([]),
  wallSegmentIds: z.array(objectIdSchema).default([]),
  openingIds: z.array(objectIdSchema).default([]),
  structuralMemberIds: z.array(objectIdSchema).default([]),
  materials: z.array(framingMaterialLineItemSchema).default([]),
  reviewItemIds: z.array(reviewItemIdSchema).default([]),
  validationIssueIds: z.array(validationIssueIdSchema).default([]),
  confidenceEvaluationId: confidenceEvaluationIdSchema,
  summary: framingTakeoffSummarySchema,
});

export type FramingTakeoffStatus = z.infer<
  typeof framingTakeoffStatusSchema
>;
export type FramingTakeoffSummary = z.infer<
  typeof framingTakeoffSummarySchema
>;
export type FramingTakeoff = z.infer<typeof framingTakeoffSchema>;
