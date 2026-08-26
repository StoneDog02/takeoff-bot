import { z } from "zod";

import { planReferenceQueueSchema } from "../../../plans/PlanReferenceQueue.js";

export const planReferenceFollowUpAuditSchema = z.object({
  referencesDiscovered: z.number().int().nonnegative(),
  referencesQueued: z.number().int().nonnegative(),
  referencesResolved: z.number().int().nonnegative(),
  referencesFollowed: z.number().int().nonnegative(),
  referencesSkipped: z.number().int().nonnegative(),
  skippedReasons: z.array(z.string().trim().min(1)),
  evidenceGainedCount: z.number().int().nonnegative(),
  domainsAffected: z.array(z.string().trim().min(1)),
  spend: z.object({
    localizationAttempts: z.number().int().nonnegative(),
    evidenceExtractionAttempts: z.number().int().nonnegative(),
    repairCalls: z.number().int().nonnegative(),
    totalApiCalls: z.number().int().nonnegative(),
    imagesSent: z.number().int().nonnegative(),
  }),
  queueDrained: z.boolean(),
});

export const planReferenceTraceSchema = z.object({
  inventoryReferenceCount: z.number().int().nonnegative(),
  queue: planReferenceQueueSchema,
  followUp: planReferenceFollowUpAuditSchema,
});

export type PlanReferenceFollowUpAudit = z.infer<
  typeof planReferenceFollowUpAuditSchema
>;
export type PlanReferenceTrace = z.infer<typeof planReferenceTraceSchema>;
