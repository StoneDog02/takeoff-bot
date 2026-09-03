import { MAX_VISUAL_IMAGES_PER_EXTRACTION_REQUEST } from "./visualImageBudget.js";
import type { PlanIndex } from "./PlanPage.js";
import type { ExtractionPageBundle } from "./ExtractionPageBundle.js";
import type { DetailLocalizationResult } from "./detailLocalization.js";
import type { PlanReferenceQueueItem } from "./PlanReferenceQueue.js";

/**
 * Builds a referenced-detail Evidence bundle using localized selected tiles
 * plus optional full-sheet context (strategy C stage 2).
 *
 * visualDetailLevel = full-page-and-selected-tiles
 * Images ≈ 1 + matchingTileIds.length (must fit budget).
 */
export function buildLocalizedReferencedExtractionBundle(input: {
  planIndex: PlanIndex;
  scopeName: string;
  queueItem: PlanReferenceQueueItem;
  localization: DetailLocalizationResult;
  includeFullSheetContext?: boolean;
  maxImages?: number;
}): ExtractionPageBundle {
  const maxImages = input.maxImages ?? MAX_VISUAL_IMAGES_PER_EXTRACTION_REQUEST;
  const includeFullSheet = input.includeFullSheetContext ?? true;
  const pageNumber = input.queueItem.targetPageNumber;
  if (pageNumber === null) {
    throw new Error(
      "buildLocalizedReferencedExtractionBundle: targetPageNumber is required.",
    );
  }
  if (input.localization.visibility !== "visible") {
    throw new Error(
      `buildLocalizedReferencedExtractionBundle: localization visibility is '${input.localization.visibility}'.`,
    );
  }
  if (input.localization.matchingTileIds.length === 0) {
    throw new Error(
      "buildLocalizedReferencedExtractionBundle: no matchingTileIds.",
    );
  }

  const page = input.planIndex.pages.find((p) => p.pageNumber === pageNumber);
  if (!page) {
    throw new Error(
      `buildLocalizedReferencedExtractionBundle: page ${pageNumber} missing from plan index.`,
    );
  }

  const selectedTileIds = [...input.localization.matchingTileIds].sort();
  const estimatedImages =
    (includeFullSheet ? 1 : 0) + selectedTileIds.length;
  if (estimatedImages > maxImages) {
    throw new Error(
      `buildLocalizedReferencedExtractionBundle: estimatedImages=${estimatedImages} exceeds maxImages=${maxImages}.`,
    );
  }

  const detail = input.queueItem.detailNumber ?? input.localization.requestedDetailNumber;
  const originSummary = input.queueItem.originatingObservations
    .map(
      (obs) =>
        `${obs.originatingSubjectKind}:${obs.originatingSubjectKey} (${obs.planReferenceId})`,
    )
    .join("; ");

  return {
    bundleId: `bundle:${input.scopeName}:referenced-detail-localized:p${pageNumber}:d${detail}`,
    scopeName: input.scopeName,
    intent: "referenced-detail",
    members: [
      {
        pageNumber,
        role: "referenced",
        visualDetailLevel: includeFullSheet
          ? "full-page-and-selected-tiles"
          : "selected-tiles",
        sheetId: page.sheetId,
        label: page.label,
        reason: `Localized detail ${detail} on ${input.queueItem.targetSheetId ?? "sheet"} via PlanReference queue item ${input.queueItem.id}.`,
        selectedTileIds,
      },
    ],
    orderedPageNumbers: [pageNumber],
    imageBudget: {
      maxImages,
      estimatedImages,
      tilesPerDetailedPage: selectedTileIds.length,
    },
    routingNotes: [
      "Referenced-detail pass after staged localization (selected tiles).",
      `Requested detail: ${detail}.`,
      `Matching tiles: ${selectedTileIds.join(", ")}.`,
      `Localization confidence: ${input.localization.confidenceLabel}.`,
      `Originating references: ${originSummary}.`,
      "A reference authorizes inspection of this detail; do not attribute neighboring details to the originating subject.",
      "Extract only facts that belong to the requested detail bubble/callout when visually clear.",
      `Image budget ${estimatedImages}/${maxImages}.`,
    ],
  };
}
