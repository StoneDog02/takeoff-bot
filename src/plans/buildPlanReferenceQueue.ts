import type { PlanReference } from "./PlanReference.js";
import {
  DEFAULT_PLAN_REFERENCE_QUEUE_BUDGET,
  navigationKeyForReference,
  planReferenceQueueItemSchema,
  planReferenceQueueSchema,
  type PlanReferenceOriginObservation,
  type PlanReferenceQueue,
  type PlanReferenceQueueBudget,
  type PlanReferenceQueueItem,
  type PlanReferenceQueueStatus,
} from "./PlanReferenceQueue.js";

function sanitizeIdPart(value: string): string {
  return value.replace(/[^A-Za-z0-9._:-]+/g, "-").replace(/^-+|-+$/g, "");
}

function observationFromReference(
  reference: PlanReference,
): PlanReferenceOriginObservation {
  return {
    planReferenceId: reference.id,
    originalText: reference.originalText,
    originatingEvidenceId: reference.originatingEvidenceId,
    originatingSubjectKind: reference.originatingSubjectKind,
    originatingSubjectKey: reference.originatingSubjectKey,
    sourcePageNumber: reference.source.page.pageNumber,
    sourceTileId: reference.source.tileId,
  };
}

/**
 * Priority: lower sorts first.
 * Prefer exact resolved detail+sheet, then more originating observations,
 * then stable sheet/detail ordering. No takeoff-value / Burton signals.
 */
export function computeQueueItemPriority(input: {
  referenceStatus: PlanReference["status"];
  detailNumber: string | null;
  kind: PlanReference["kind"];
  observationCount: number;
}): number {
  let score = 1000;
  if (input.referenceStatus === "resolved" && input.detailNumber) {
    score = 100;
  } else if (input.referenceStatus === "resolved" && !input.detailNumber) {
    score = 300;
  } else if (input.referenceStatus === "ambiguous") {
    score = 800;
  } else if (input.referenceStatus === "parsed") {
    score = 700;
  } else {
    score = 900;
  }

  if (input.kind === "detail") {
    score -= 10;
  } else if (input.kind === "sheet" || input.kind === "schedule") {
    score += 20;
  }

  // More independent observations → slightly earlier (bounded).
  score -= Math.min(input.observationCount, 5);

  return score;
}

function initialQueueStatus(
  reference: PlanReference,
): PlanReferenceQueueStatus {
  if (reference.status === "unresolved") {
    return "unresolved";
  }
  if (reference.status === "ambiguous") {
    return "ambiguous";
  }
  if (reference.status === "resolved" && reference.targetPageNumber !== null) {
    return "ready";
  }
  if (reference.status === "parsed") {
    return "unresolved";
  }
  return "unresolved";
}

/**
 * Builds a deduplicated reference queue from PlanReference inventory.
 * Same navigation destination collapses to one item; all originating
 * observations are retained.
 */
export function buildPlanReferenceQueue(input: {
  references: readonly PlanReference[];
  budget?: Partial<PlanReferenceQueueBudget>;
  /**
   * Navigation keys already successfully processed (e.g. B1.7 5/S5.2).
   */
  processedNavigationKeys?: ReadonlySet<string>;
  /**
   * Pages already adequately covered by prior primary/global extraction.
   * Sheet-only / schedule refs targeting these pages become already-covered.
   */
  alreadyCoveredPageNumbers?: ReadonlySet<number>;
  notes?: string[];
}): PlanReferenceQueue {
  const budget: PlanReferenceQueueBudget = {
    ...DEFAULT_PLAN_REFERENCE_QUEUE_BUDGET,
    ...input.budget,
  };
  const processedKeys = input.processedNavigationKeys ?? new Set<string>();
  const coveredPages = input.alreadyCoveredPageNumbers ?? new Set<number>();

  const byKey = new Map<
    string,
    {
      representative: PlanReference;
      observations: PlanReferenceOriginObservation[];
    }
  >();

  for (const reference of input.references) {
    const key = navigationKeyForReference({
      targetSheetId: reference.targetSheetId,
      detailNumber: reference.detailNumber,
      kind: reference.kind,
    });
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        representative: reference,
        observations: [observationFromReference(reference)],
      });
      continue;
    }
    existing.observations.push(observationFromReference(reference));
    // Prefer a resolved representative when merging.
    if (
      reference.status === "resolved" &&
      existing.representative.status !== "resolved"
    ) {
      existing.representative = reference;
    }
  }

  const draftItems: Omit<PlanReferenceQueueItem, "order">[] = [];

  for (const [navigationKey, group] of byKey) {
    const reference = group.representative;
    let queueStatus = initialQueueStatus(reference);
    let statusReason: string | null = null;
    let deferredReason: string | null = null;

    if (processedKeys.has(navigationKey)) {
      queueStatus = "processed";
      statusReason = "Destination already processed in a prior reference hop.";
    } else if (
      queueStatus === "ready" &&
      reference.targetPageNumber !== null &&
      coveredPages.has(reference.targetPageNumber) &&
      reference.detailNumber === null
    ) {
      // Sheet-only / schedule refs to already-extracted pages.
      queueStatus = "already-covered";
      statusReason =
        "Target page already served as primary/global extraction context; sheet-only reference does not justify a new Claude call.";
    } else if (queueStatus === "ambiguous") {
      statusReason =
        reference.notes[0] ??
        "Ambiguous reference retained for review; not forced into a single detail.";
    } else if (queueStatus === "unresolved") {
      statusReason = reference.notes[0] ?? "Reference target unresolved.";
    }

    const priority = computeQueueItemPriority({
      referenceStatus: reference.status,
      detailNumber: reference.detailNumber,
      kind: reference.kind,
      observationCount: group.observations.length,
    });

    const id = sanitizeIdPart(
      `QREF-${reference.targetSheetId ?? "X"}-${reference.detailNumber ?? "sheet"}-${reference.kind}`,
    );

    draftItems.push({
      id,
      navigationKey,
      kind: reference.kind,
      referenceStatus: reference.status,
      queueStatus,
      targetSheetId: reference.targetSheetId,
      targetPageNumber: reference.targetPageNumber,
      detailNumber: reference.detailNumber,
      priority,
      originatingObservations: group.observations,
      deferredReason,
      statusReason,
      localizationPassId: null,
      extractionPassId: null,
      bundleId: null,
    });
  }

  draftItems.sort((left, right) => {
    if (left.priority !== right.priority) {
      return left.priority - right.priority;
    }
    const sheetCmp = (left.targetSheetId ?? "").localeCompare(
      right.targetSheetId ?? "",
    );
    if (sheetCmp !== 0) {
      return sheetCmp;
    }
    return (left.detailNumber ?? "").localeCompare(right.detailNumber ?? "");
  });

  // Apply budget: ready items beyond hop/page limits become deferred.
  let hopsScheduled = 0;
  const pagesScheduled = new Set<number>();
  const items: PlanReferenceQueueItem[] = draftItems.map((item, index) => {
    let queueStatus = item.queueStatus;
    let deferredReason = item.deferredReason;
    let statusReason = item.statusReason;

    if (queueStatus === "ready") {
      const page = item.targetPageNumber;
      const wouldExceedHops = hopsScheduled >= budget.maxReferenceHops;
      const wouldExceedPages =
        page !== null &&
        !pagesScheduled.has(page) &&
        pagesScheduled.size >= budget.maxReferencedPages;

      if (wouldExceedHops || wouldExceedPages) {
        queueStatus = "deferred";
        deferredReason = wouldExceedHops
          ? `Deferred: maxReferenceHops=${budget.maxReferenceHops} reached.`
          : `Deferred: maxReferencedPages=${budget.maxReferencedPages} reached.`;
        statusReason = deferredReason;
      } else {
        hopsScheduled += 1;
        if (page !== null) {
          pagesScheduled.add(page);
        }
      }
    }

    return planReferenceQueueItemSchema.parse({
      ...item,
      queueStatus,
      deferredReason,
      statusReason,
      order: index + 1,
    });
  });

  return planReferenceQueueSchema.parse({
    items,
    budget,
    notes: input.notes ?? [],
  });
}

/**
 * Returns the next ready queue item under current budget accounting
 * (items already marked deferred stay deferred).
 */
export function selectNextReadyQueueItem(
  queue: PlanReferenceQueue,
): PlanReferenceQueueItem | null {
  return (
    queue.items.find((item) => item.queueStatus === "ready") ?? null
  );
}

export function markQueueItemStatus(
  queue: PlanReferenceQueue,
  itemId: string,
  update: {
    queueStatus: PlanReferenceQueueStatus;
    statusReason?: string | null;
    localizationPassId?: string | null;
    extractionPassId?: string | null;
    bundleId?: string | null;
  },
): PlanReferenceQueue {
  const items = queue.items.map((item) => {
    if (item.id !== itemId) {
      return item;
    }
    return planReferenceQueueItemSchema.parse({
      ...item,
      queueStatus: update.queueStatus,
      statusReason:
        update.statusReason !== undefined
          ? update.statusReason
          : item.statusReason,
      localizationPassId:
        update.localizationPassId !== undefined
          ? update.localizationPassId
          : item.localizationPassId,
      extractionPassId:
        update.extractionPassId !== undefined
          ? update.extractionPassId
          : item.extractionPassId,
      bundleId: update.bundleId !== undefined ? update.bundleId : item.bundleId,
    });
  });
  return planReferenceQueueSchema.parse({ ...queue, items });
}

/**
 * Merges newly inventoried PlanReferences into an existing queue without
 * reopening terminal destinations. New destinations become ready/deferred
 * under the existing budget (rebuild hop accounting from remaining ready).
 */
export function mergePlanReferencesIntoQueue(input: {
  queue: PlanReferenceQueue;
  newReferences: readonly PlanReference[];
}): PlanReferenceQueue {
  if (input.newReferences.length === 0) {
    return input.queue;
  }

  const existingKeys = new Set(input.queue.items.map((item) => item.navigationKey));
  const processedKeys = new Set(
    input.queue.items
      .filter((item) => item.queueStatus === "processed")
      .map((item) => item.navigationKey),
  );
  const alreadyCoveredPages = new Set(
    input.queue.items
      .filter((item) => item.queueStatus === "already-covered")
      .map((item) => item.targetPageNumber)
      .filter((page): page is number => page !== null),
  );

  // Only invent new keys; rebuild a fresh queue from prior + new refs' navigation.
  // Preserve terminal statuses for known keys via processed/alreadyCovered sets and
  // by re-applying status from the prior queue after build.
  const syntheticRefs: PlanReference[] = [
    ...input.queue.items.flatMap((item) =>
      item.originatingObservations.map(
        (obs): PlanReference => ({
          id: obs.planReferenceId,
          originalText: obs.originalText,
          kind: item.kind,
          status:
            item.referenceStatus === "resolved"
              ? "resolved"
              : item.referenceStatus === "ambiguous"
                ? "ambiguous"
                : item.referenceStatus === "parsed"
                  ? "parsed"
                  : "unresolved",
          detailNumber: item.detailNumber,
          detailNumberFrom: null,
          detailNumberTo: null,
          targetSheetId: item.targetSheetId,
          targetPageNumber: item.targetPageNumber,
          source: {
            page: {
              documentId: null,
              pageNumber: obs.sourcePageNumber,
              sheetId: null,
              sheetTitle: null,
              pageLabel: null,
              revision: null,
            },
            region: null,
            tileId: obs.sourceTileId,
            elementLabel: null,
            detailNumber: null,
            sectionNumber: null,
            scheduleName: null,
            noteReference: null,
          },
          originatingEvidenceId: obs.originatingEvidenceId,
          originatingSubjectKind: obs.originatingSubjectKind,
          originatingSubjectKey: obs.originatingSubjectKey,
          notes: [],
        }),
      ),
    ),
    ...input.newReferences,
  ];

  const rebuilt = buildPlanReferenceQueue({
    references: syntheticRefs,
    budget: input.queue.budget,
    processedNavigationKeys: processedKeys,
    alreadyCoveredPageNumbers: alreadyCoveredPages,
    notes: [
      ...input.queue.notes,
      `Merged ${input.newReferences.length} newly discovered reference(s); prior terminal states preserved where known.`,
    ],
  });

  // Restore prior terminal statuses (failed/deferred/ambiguous reasons) for existing keys.
  const priorByKey = new Map(
    input.queue.items.map((item) => [item.navigationKey, item]),
  );
  const items = rebuilt.items.map((item) => {
    const prior = priorByKey.get(item.navigationKey);
    if (!prior) {
      // Brand-new destination discovered this hop — leave as ready/deferred by budget.
      return item;
    }
    if (
      prior.queueStatus === "processed" ||
      prior.queueStatus === "failed" ||
      prior.queueStatus === "already-covered" ||
      prior.queueStatus === "ambiguous" ||
      prior.queueStatus === "unresolved"
    ) {
      return planReferenceQueueItemSchema.parse({
        ...item,
        queueStatus: prior.queueStatus,
        statusReason: prior.statusReason,
        deferredReason: prior.deferredReason,
        localizationPassId: prior.localizationPassId,
        extractionPassId: prior.extractionPassId,
        bundleId: prior.bundleId,
        originatingObservations: item.originatingObservations,
      });
    }
    if (prior.queueStatus === "deferred" && !existingKeys.has(item.navigationKey)) {
      return item;
    }
    // Prior deferred that is still unprocessed: keep deferred unless this rebuild
    // marked it ready under a fresh hop budget — for merge after a hop, prefer
    // keeping deferred for old keys that were not selected.
    if (prior.queueStatus === "deferred" && item.queueStatus === "ready") {
      return planReferenceQueueItemSchema.parse({
        ...item,
        queueStatus: "deferred",
        deferredReason:
          prior.deferredReason ??
          "Deferred: newly discovered this hop; not recursively processed (maxDepth=1).",
        statusReason:
          "Deferred: newly discovered this hop; not recursively processed (maxDepth=1).",
      });
    }
    return item;
  });

  // Force brand-new keys that came only from newReferences to deferred when
  // maxDepth policy forbids recursive processing (V1).
  const newOnlyKeys = new Set(
    input.newReferences.map((reference) =>
      navigationKeyForReference({
        targetSheetId: reference.targetSheetId,
        detailNumber: reference.detailNumber,
        kind: reference.kind,
      }),
    ),
  );
  const finalized = items.map((item) => {
    if (!priorByKey.has(item.navigationKey) && newOnlyKeys.has(item.navigationKey)) {
      if (item.queueStatus === "ready") {
        return planReferenceQueueItemSchema.parse({
          ...item,
          queueStatus: "deferred",
          deferredReason:
            "Deferred: newly discovered this hop; not recursively processed (maxDepth=1).",
          statusReason:
            "Deferred: newly discovered this hop; not recursively processed (maxDepth=1).",
        });
      }
    }
    return item;
  });

  return planReferenceQueueSchema.parse({
    ...rebuilt,
    items: finalized,
  });
}
