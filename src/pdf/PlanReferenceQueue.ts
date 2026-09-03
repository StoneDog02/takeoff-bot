import { z } from "zod";

import { evidenceIdSchema } from "../core/schemas/identity.schema.js";
import {
  planReferenceKindSchema,
  planReferenceStatusSchema,
} from "./PlanReference.js";

/**
 * Worklist status for a destination navigation item.
 * Distinct from PlanReference parse/resolve status.
 */
export const planReferenceQueueStatusSchema = z.enum([
  /** Target sheet/page could not be resolved. */
  "unresolved",
  /** Parse or target match is ambiguous — surfaced, not forced. */
  "ambiguous",
  /** Resolved and eligible for localization/extraction under budget. */
  "ready",
  /** Successfully processed (localization and/or evidence hop completed). */
  "processed",
  /** Attempted and failed (localization or extraction). */
  "failed",
  /** Eligible but held due to budget / depth policy. */
  "deferred",
  /**
   * Destination already sufficiently covered by a prior extraction pass
   * (e.g. sheet already served as global/primary context).
   */
  "already-covered",
]);

export const planReferenceOriginObservationSchema = z.object({
  planReferenceId: z.string().trim().min(1),
  originalText: z.string().trim().min(1),
  originatingEvidenceId: evidenceIdSchema.nullable().default(null),
  originatingSubjectKind: z.string().trim().min(1).nullable().default(null),
  originatingSubjectKey: z.string().trim().min(1).nullable().default(null),
  sourcePageNumber: z.number().int().positive(),
  sourceTileId: z.string().trim().min(1).nullable().default(null),
});

/**
 * One deduplicated navigation destination in the reference worklist.
 * Multiple originating observations may point at the same destination.
 */
export const planReferenceQueueItemSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
  /**
   * Stable navigation key: targetSheetId|detailNumber|kind
   * (detailNumber empty string when sheet-only).
   */
  navigationKey: z.string().trim().min(1),
  kind: planReferenceKindSchema,
  /** Parse/resolve status from the representative PlanReference. */
  referenceStatus: planReferenceStatusSchema,
  queueStatus: planReferenceQueueStatusSchema,
  targetSheetId: z.string().trim().min(1).nullable().default(null),
  targetPageNumber: z.number().int().positive().nullable().default(null),
  detailNumber: z.string().trim().min(1).nullable().default(null),
  /** Deterministic sort rank (lower = sooner). */
  priority: z.number().int(),
  /** Stable 1-based position after sorting. */
  order: z.number().int().positive(),
  originatingObservations: z.array(planReferenceOriginObservationSchema).min(1),
  deferredReason: z.string().trim().min(1).nullable().default(null),
  statusReason: z.string().trim().min(1).nullable().default(null),
  localizationPassId: z.string().trim().min(1).nullable().default(null),
  extractionPassId: z.string().trim().min(1).nullable().default(null),
  bundleId: z.string().trim().min(1).nullable().default(null),
});

export const planReferenceQueueBudgetSchema = z.object({
  /** Max reference destinations processed in one run. */
  maxReferenceHops: z.number().int().positive().default(1),
  /** Max distinct target pages touched. */
  maxReferencedPages: z.number().int().positive().default(3),
  /**
   * Max Anthropic API calls for the whole reference drain run
   * (localization + evidence + repairs combined). Soft policy ceiling.
   */
  maxApiCalls: z.number().int().positive().default(4),
  /** Max localization attempts (each may include one schema repair). */
  maxLocalizationCalls: z.number().int().positive().default(1),
  /** Max referenced-detail Evidence extraction attempts. */
  maxEvidenceExtractionCalls: z.number().int().positive().default(1),
  /** Max schema-repair API calls across the run. */
  maxRepairCalls: z.number().int().positive().default(2),
  /** Max images across localization + evidence for the run. */
  maxImages: z.number().int().positive().default(20),
  /** Traversal depth; V1 remains one hop from primary graph. */
  maxDepth: z.number().int().positive().default(1),
});

export const planReferenceQueueSchema = z.object({
  items: z.array(planReferenceQueueItemSchema),
  budget: planReferenceQueueBudgetSchema,
  notes: z.array(z.string().trim().min(1)).default([]),
});

export type PlanReferenceQueueStatus = z.infer<
  typeof planReferenceQueueStatusSchema
>;
export type PlanReferenceOriginObservation = z.infer<
  typeof planReferenceOriginObservationSchema
>;
export type PlanReferenceQueueItem = z.infer<typeof planReferenceQueueItemSchema>;
export type PlanReferenceQueueBudget = z.infer<
  typeof planReferenceQueueBudgetSchema
>;
export type PlanReferenceQueue = z.infer<typeof planReferenceQueueSchema>;

/** Queue statuses that count as terminal for a drained run. */
export const PLAN_REFERENCE_QUEUE_TERMINAL_STATUSES = [
  "processed",
  "already-covered",
  "unresolved",
  "ambiguous",
  "failed",
  "deferred",
] as const satisfies readonly PlanReferenceQueueStatus[];

/** Default V1 budget: one-hop, bounded fanout, hard call caps. */
export const DEFAULT_PLAN_REFERENCE_QUEUE_BUDGET: PlanReferenceQueueBudget = {
  maxReferenceHops: 1,
  maxReferencedPages: 3,
  maxApiCalls: 4,
  maxLocalizationCalls: 1,
  maxEvidenceExtractionCalls: 1,
  maxRepairCalls: 2,
  maxImages: 20,
  maxDepth: 1,
};

export function navigationKeyForReference(input: {
  targetSheetId: string | null;
  detailNumber: string | null;
  kind: string;
}): string {
  return [
    (input.targetSheetId ?? "").toUpperCase(),
    input.detailNumber ?? "",
    input.kind,
  ].join("|");
}
