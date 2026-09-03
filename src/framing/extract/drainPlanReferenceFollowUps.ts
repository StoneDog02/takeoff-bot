import {
  buildLocalizedReferencedExtractionBundle,
} from "../../pdf/buildLocalizedReferencedExtractionBundle.js";
import {
  buildPlanReferenceQueue,
  markQueueItemStatus,
  mergePlanReferencesIntoQueue,
  selectNextReadyQueueItem,
} from "../../pdf/buildPlanReferenceQueue.js";
import {
  buildReferencedPageExtractionBundles,
  selectResolvedReferencedPageTargets,
} from "../../pdf/buildReferencedPageExtractionBundles.js";
import type { ExtractionPageBundle } from "../../pdf/ExtractionPageBundle.js";
import { inventoryPlanReferencesFromEvidence } from "../../pdf/inventoryPlanReferencesFromEvidence.js";
import { localizeDetailOnPage } from "../../pdf/localizeDetailOnPage.js";
import type { PlanIndex } from "../../pdf/PlanIndex.js";
import {
  DEFAULT_PLAN_REFERENCE_QUEUE_BUDGET,
  type PlanReferenceQueue,
} from "../../pdf/PlanReferenceQueue.js";
import type { ClassifiedPlanPage } from "../../pdf/pageClassification.js";
import { pageNeedsVisual } from "../../pdf/pageNeedsVisual.js";
import type { PlanPageVisual } from "../../pdf/PlanPageVisual.js";
import {
  createEmptyReferenceTraversalSpend,
  isPlanReferenceQueueDrained,
  referenceBudgetBlockReason,
  type ReferenceTraversalSpend,
} from "../../pdf/referenceTraversalBudget.js";
import type { Evidence } from "../../core/schemas/evidence.schema.js";
import {
  extractFramingEvidenceViaClaude,
  resolvePageTilesForExtraction,
  resolvePageVisualsForExtraction,
  type ExtractFramingEvidenceInput,
} from "../prompts/extractFramingEvidence.js";
import type { ExtractedFramingEvidencePayload } from "../schemas/framing-artifacts.schema.js";
import {
  planReferenceTraceSchema,
  type PlanReferenceFollowUpAudit,
  type PlanReferenceTrace,
} from "./planReferenceTrace.schema.js";

export interface DrainPlanReferenceFollowUpsInput {
  planIndex: PlanIndex;
  pages: readonly ClassifiedPlanPage[];
  primaryEvidence: readonly Evidence[];
  alreadyCoveredPageNumbers: ReadonlySet<number>;
  scopeName?: string;
  pageClassification: ExtractFramingEvidenceInput["pageClassification"];
  planReadingOrder: ExtractFramingEvidenceInput["planReadingOrder"];
  buildingAssemblies: ExtractFramingEvidenceInput["buildingAssemblies"];
  pageVisuals?: ExtractFramingEvidenceInput["pageVisuals"];
  visualOutputDir?: ExtractFramingEvidenceInput["visualOutputDir"];
  visualScale?: ExtractFramingEvidenceInput["visualScale"];
  pageTiles?: ExtractFramingEvidenceInput["pageTiles"];
  tileOutputDir?: ExtractFramingEvidenceInput["tileOutputDir"];
  tileSourceScale?: ExtractFramingEvidenceInput["tileSourceScale"];
  tileColumns?: ExtractFramingEvidenceInput["tileColumns"];
  tileRows?: ExtractFramingEvidenceInput["tileRows"];
  tileOverlapFraction?: ExtractFramingEvidenceInput["tileOverlapFraction"];
  onApiCall?: ExtractFramingEvidenceInput["onApiCall"];
  onUsage?: ExtractFramingEvidenceInput["onUsage"];
}

export interface DrainPlanReferenceFollowUpsResult {
  passes: Array<{
    stamp: { extractionPassId: string; bundleId: string };
    evidence: ExtractedFramingEvidencePayload["evidence"];
  }>;
  trace: PlanReferenceTrace;
  apiCallCount: number;
}

function collectDomainsFromEvidence(
  evidence: readonly Evidence[],
): string[] {
  const domains = new Set<string>();
  for (const record of evidence) {
    domains.add(record.subjectKind);
  }
  return [...domains].sort();
}

function queueItemToBundle(input: {
  planIndex: PlanIndex;
  scopeName: string;
  queueItem: NonNullable<ReturnType<typeof selectNextReadyQueueItem>>;
}): ExtractionPageBundle | null {
  if (
    input.queueItem.detailNumber &&
    input.queueItem.targetPageNumber !== null
  ) {
    const targets = selectResolvedReferencedPageTargets([
      {
        id: input.queueItem.originatingObservations[0]?.planReferenceId ?? input.queueItem.id,
        originalText: input.queueItem.originatingObservations[0]?.originalText ?? "",
        kind: input.queueItem.kind,
        status: "resolved",
        detailNumber: input.queueItem.detailNumber,
        detailNumberFrom: null,
        detailNumberTo: null,
        targetSheetId: input.queueItem.targetSheetId,
        targetPageNumber: input.queueItem.targetPageNumber,
        source: {
          page: {
            documentId: null,
            pageNumber: input.queueItem.originatingObservations[0]?.sourcePageNumber ?? 1,
            sheetId: null,
            sheetTitle: null,
            pageLabel: null,
            revision: null,
          },
          region: null,
          tileId: null,
          elementLabel: null,
          detailNumber: input.queueItem.detailNumber,
          sectionNumber: null,
          scheduleName: null,
          noteReference: null,
        },
        originatingEvidenceId: input.queueItem.originatingObservations[0]?.originatingEvidenceId,
        originatingSubjectKind: input.queueItem.originatingObservations[0]?.originatingSubjectKind ?? "wall",
        originatingSubjectKey: input.queueItem.originatingObservations[0]?.originatingSubjectKey ?? "unknown",
        notes: [],
      },
    ]);
    const bundles = buildReferencedPageExtractionBundles({
      planIndex: input.planIndex,
      scopeName: input.scopeName,
      targets,
    });
    return bundles[0] ?? null;
  }

  if (input.queueItem.targetPageNumber !== null) {
    const targets = selectResolvedReferencedPageTargets([
      {
        id: input.queueItem.id,
        originalText: input.queueItem.originatingObservations[0]?.originalText ?? "",
        kind: "sheet",
        status: "resolved",
        detailNumber: null,
        detailNumberFrom: null,
        detailNumberTo: null,
        targetSheetId: input.queueItem.targetSheetId,
        targetPageNumber: input.queueItem.targetPageNumber,
        source: {
          page: {
            documentId: null,
            pageNumber: 1,
            sheetId: null,
            sheetTitle: null,
            pageLabel: null,
            revision: null,
          },
          region: null,
          tileId: null,
          elementLabel: null,
          detailNumber: null,
          sectionNumber: null,
          scheduleName: null,
          noteReference: null,
        },
        originatingEvidenceId: null,
        originatingSubjectKind: "wall",
        originatingSubjectKey: "unknown",
        notes: [],
      },
    ]);
    return buildReferencedPageExtractionBundles({
      planIndex: input.planIndex,
      scopeName: input.scopeName,
      targets,
    })[0] ?? null;
  }

  return null;
}

/**
 * Drains the PlanReference queue once under V1 hard budgets after primary
 * extraction passes. Composes existing plan helpers — no queue redesign.
 */
export async function drainPlanReferenceFollowUps(
  input: DrainPlanReferenceFollowUpsInput,
): Promise<DrainPlanReferenceFollowUpsResult> {
  const scopeName = input.scopeName ?? "framing";
  const inventory = inventoryPlanReferencesFromEvidence({
    evidence: input.primaryEvidence,
    planIndex: input.planIndex,
    classifiedPages: input.pages,
  });

  let queue: PlanReferenceQueue = buildPlanReferenceQueue({
    references: inventory.references,
    alreadyCoveredPageNumbers: input.alreadyCoveredPageNumbers,
    budget: DEFAULT_PLAN_REFERENCE_QUEUE_BUDGET,
  });

  const spend: ReferenceTraversalSpend = createEmptyReferenceTraversalSpend();
  const skippedReasons: string[] = [];
  let referencesFollowed = 0;
  let referencesSkipped = 0;
  const passes: DrainPlanReferenceFollowUpsResult["passes"] = [];
  let apiCallCount = 0;

  const processedNavigationKeys = new Set<string>();

  while (true) {
    const nextItem = selectNextReadyQueueItem(queue);
    if (!nextItem) {
      break;
    }

    const blockReason =
      referenceBudgetBlockReason(
        queue.budget,
        spend,
        "extract-evidence",
      ) ??
      referenceBudgetBlockReason(queue.budget, spend, "localize");

    if (blockReason) {
      queue = markQueueItemStatus(queue, nextItem.id, {
        queueStatus: "deferred",
        statusReason: blockReason,
      });
      referencesSkipped += 1;
      skippedReasons.push(`${nextItem.navigationKey}: ${blockReason}`);
      continue;
    }

    let bundle: ExtractionPageBundle | null = null;
    let localizationPassId: string | null = null;

    if (nextItem.detailNumber && nextItem.targetPageNumber !== null) {
      const localizeBlock = referenceBudgetBlockReason(
        queue.budget,
        spend,
        "localize",
      );
      if (localizeBlock) {
        bundle = queueItemToBundle({
          planIndex: input.planIndex,
          scopeName,
          queueItem: nextItem,
        });
      } else {
        const pageNumber = nextItem.targetPageNumber;
        const planPage = input.planIndex.pages.find(
          (page) => page.pageNumber === pageNumber,
        );
        if (planPage && pageNeedsVisual(planPage)) {
          const visuals = await resolvePageVisualsForExtraction({
            planIndex: input.planIndex,
            pages: [planPage],
            pageVisuals: input.pageVisuals,
            visualOutputDir: input.visualOutputDir,
            visualScale: input.visualScale,
          });
          const tiles = await resolvePageTilesForExtraction({
            planIndex: input.planIndex,
            pages: [planPage],
            pageTiles: input.pageTiles,
            tileOutputDir: input.tileOutputDir,
            tileSourceScale: input.tileSourceScale,
            tileColumns: input.tileColumns,
            tileRows: input.tileRows,
            tileOverlapFraction: input.tileOverlapFraction,
          });
          const pageVisual = visuals.get(pageNumber);
          const pageTileList = tiles.get(pageNumber) ?? [];
          if (pageVisual && pageTileList.length > 0) {
            localizationPassId = `loc:${nextItem.id}`;
            spend.localizationAttempts += 1;
            spend.totalApiCalls += 1;
            apiCallCount += 1;
            input.onApiCall?.();

            try {
              const localization = await localizeDetailOnPage({
                queueItem: nextItem,
                pageVisual,
                pageTiles: pageTileList,
                architecturalSheetId: nextItem.targetSheetId,
                onApiCall: input.onApiCall,
                onUsage: input.onUsage,
              });
              if (localization.visibility === "visible") {
                bundle = buildLocalizedReferencedExtractionBundle({
                  planIndex: input.planIndex,
                  scopeName,
                  queueItem: nextItem,
                  localization,
                });
              } else {
                bundle = queueItemToBundle({
                  planIndex: input.planIndex,
                  scopeName,
                  queueItem: nextItem,
                });
              }
            } catch (error) {
              const message =
                error instanceof Error ? error.message : String(error);
              queue = markQueueItemStatus(queue, nextItem.id, {
                queueStatus: "failed",
                statusReason: message,
                localizationPassId,
              });
              referencesSkipped += 1;
              skippedReasons.push(`${nextItem.navigationKey}: ${message}`);
              processedNavigationKeys.add(nextItem.navigationKey);
              continue;
            }
          } else {
            bundle = queueItemToBundle({
              planIndex: input.planIndex,
              scopeName,
              queueItem: nextItem,
            });
          }
        } else {
          bundle = queueItemToBundle({
            planIndex: input.planIndex,
            scopeName,
            queueItem: nextItem,
          });
        }
      }
    } else {
      bundle = queueItemToBundle({
        planIndex: input.planIndex,
        scopeName,
        queueItem: nextItem,
      });
    }

    if (!bundle) {
      queue = markQueueItemStatus(queue, nextItem.id, {
        queueStatus: "failed",
        statusReason: "Could not build referenced extraction bundle.",
      });
      referencesSkipped += 1;
      skippedReasons.push(
        `${nextItem.navigationKey}: Could not build referenced extraction bundle.`,
      );
      continue;
    }

    const imageBlock = referenceBudgetBlockReason(
      queue.budget,
      spend,
      "image",
      bundle.imageBudget.estimatedImages,
    );
    if (imageBlock) {
      queue = markQueueItemStatus(queue, nextItem.id, {
        queueStatus: "deferred",
        statusReason: imageBlock,
      });
      referencesSkipped += 1;
      skippedReasons.push(`${nextItem.navigationKey}: ${imageBlock}`);
      continue;
    }

    const extractionPassId = `pass:${bundle.bundleId}`;
    spend.evidenceExtractionAttempts += 1;
    spend.totalApiCalls += 1;
    spend.imagesSent += bundle.imageBudget.estimatedImages;
    apiCallCount += 1;

    try {
      const passResult = await extractFramingEvidenceViaClaude({
        planIndex: input.planIndex,
        pageClassification: input.pageClassification,
        planReadingOrder: input.planReadingOrder,
        buildingAssemblies: input.buildingAssemblies,
        extractionBundle: bundle,
        pageVisuals: input.pageVisuals,
        visualOutputDir: input.visualOutputDir,
        visualScale: input.visualScale,
        pageTiles: input.pageTiles,
        tileOutputDir: input.tileOutputDir,
        tileSourceScale: input.tileSourceScale,
        tileColumns: input.tileColumns,
        tileRows: input.tileRows,
        tileOverlapFraction: input.tileOverlapFraction,
        onApiCall: input.onApiCall,
        onUsage: input.onUsage,
      });

      passes.push({
        stamp: { extractionPassId, bundleId: bundle.bundleId },
        evidence: passResult.evidence,
      });

      queue = markQueueItemStatus(queue, nextItem.id, {
        queueStatus: "processed",
        extractionPassId,
        localizationPassId,
        bundleId: bundle.bundleId,
      });
      referencesFollowed += 1;
      processedNavigationKeys.add(nextItem.navigationKey);

      const followUpInventory = inventoryPlanReferencesFromEvidence({
        evidence: passResult.evidence,
        planIndex: input.planIndex,
        classifiedPages: input.pages,
      });
      if (followUpInventory.references.length > 0) {
        queue = mergePlanReferencesIntoQueue({
          queue,
          newReferences: followUpInventory.references,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      queue = markQueueItemStatus(queue, nextItem.id, {
        queueStatus: "failed",
        statusReason: message,
        extractionPassId,
        localizationPassId,
        bundleId: bundle.bundleId,
      });
      referencesSkipped += 1;
      skippedReasons.push(`${nextItem.navigationKey}: ${message}`);
    }

    if (processedNavigationKeys.size >= queue.budget.maxReferenceHops) {
      break;
    }
  }

  const followUpEvidence = passes.flatMap((pass) => pass.evidence);
  const followUp: PlanReferenceFollowUpAudit = {
    referencesDiscovered: inventory.references.length,
    referencesQueued: queue.items.length,
    referencesResolved: queue.items.filter(
      (item) => item.referenceStatus === "resolved",
    ).length,
    referencesFollowed,
    referencesSkipped,
    skippedReasons,
    evidenceGainedCount: followUpEvidence.length,
    domainsAffected: collectDomainsFromEvidence(followUpEvidence),
    spend: { ...spend },
    queueDrained: isPlanReferenceQueueDrained(queue),
  };

  const trace = planReferenceTraceSchema.parse({
    inventoryReferenceCount: inventory.references.length,
    queue,
    followUp,
  });

  return { passes, trace, apiCallCount };
}
