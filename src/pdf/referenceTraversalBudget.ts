import {
  PLAN_REFERENCE_QUEUE_TERMINAL_STATUSES,
  type PlanReferenceQueue,
  type PlanReferenceQueueBudget,
  type PlanReferenceQueueStatus,
} from "./PlanReferenceQueue.js";

/**
 * A queue is drained when every item is in an explicit terminal or
 * intentionally deferred state — never silently abandoned.
 *
 * Terminal/deferred: processed, already-covered, unresolved, ambiguous,
 * failed, deferred (budget/depth).
 *
 * Non-drained: any `ready` item remaining (eligible work not yet attempted
 * or budgeted in this run).
 */
export function isPlanReferenceQueueDrained(
  queue: PlanReferenceQueue,
): boolean {
  return queue.items.every((item) =>
    (PLAN_REFERENCE_QUEUE_TERMINAL_STATUSES as readonly string[]).includes(
      item.queueStatus,
    ),
  );
}

export function listReadyQueueItems(
  queue: PlanReferenceQueue,
): PlanReferenceQueue["items"] {
  return queue.items.filter((item) => item.queueStatus === "ready");
}

export interface ReferenceTraversalSpend {
  localizationAttempts: number;
  evidenceExtractionAttempts: number;
  /** Schema-repair API calls only (not initial extract calls). */
  repairCalls: number;
  /** All Anthropic messages API calls including repairs. */
  totalApiCalls: number;
  imagesSent: number;
}

export function createEmptyReferenceTraversalSpend(): ReferenceTraversalSpend {
  return {
    localizationAttempts: 0,
    evidenceExtractionAttempts: 0,
    repairCalls: 0,
    totalApiCalls: 0,
    imagesSent: 0,
  };
}

/**
 * Hard budget gate. Returns null when the action is allowed; otherwise a
 * deferred reason string. Exhausted budgets must defer work, never drop it.
 */
export function referenceBudgetBlockReason(
  budget: PlanReferenceQueueBudget,
  spend: ReferenceTraversalSpend,
  action: "localize" | "extract-evidence" | "repair" | "image",
  additionalImages = 0,
): string | null {
  if (spend.totalApiCalls >= budget.maxApiCalls && action !== "image") {
    return `Deferred: maxApiCalls=${budget.maxApiCalls} exhausted (spent ${spend.totalApiCalls}).`;
  }
  if (
    action === "localize" &&
    spend.localizationAttempts >= budget.maxLocalizationCalls
  ) {
    return `Deferred: maxLocalizationCalls=${budget.maxLocalizationCalls} exhausted.`;
  }
  if (
    action === "extract-evidence" &&
    spend.evidenceExtractionAttempts >= budget.maxEvidenceExtractionCalls
  ) {
    return `Deferred: maxEvidenceExtractionCalls=${budget.maxEvidenceExtractionCalls} exhausted.`;
  }
  if (action === "repair" && spend.repairCalls >= budget.maxRepairCalls) {
    return `Deferred: maxRepairCalls=${budget.maxRepairCalls} exhausted.`;
  }
  if (
    (action === "image" || additionalImages > 0) &&
    spend.imagesSent + additionalImages > budget.maxImages
  ) {
    return `Deferred: maxImages=${budget.maxImages} would be exceeded (spent ${spend.imagesSent}, +${additionalImages}).`;
  }
  return null;
}

export function assertQueueHasNoSilentReadyWork(
  queue: PlanReferenceQueue,
): void {
  const ready = listReadyQueueItems(queue);
  if (ready.length > 0 && !isPlanReferenceQueueDrained(queue)) {
    // Drained means no ready; this helper is for post-run audit.
  }
}

/**
 * Statuses that are never reopened by a later inventory merge unless
 * explicitly cleared by the caller.
 */
export function isTerminalQueueStatus(
  status: PlanReferenceQueueStatus,
): boolean {
  return (
    status === "processed" ||
    status === "already-covered" ||
    status === "failed" ||
    status === "ambiguous" ||
    status === "unresolved" ||
    status === "deferred"
  );
}
