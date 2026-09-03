import { MAX_VISUAL_IMAGES_PER_EXTRACTION_REQUEST } from "./visualImageBudget.js";
import type { PlanIndex } from "./PlanPage.js";
import type {
  ExtractionPageBundle,
  ExtractionPageBundleMember,
} from "./ExtractionPageBundle.js";
import type { PlanReference } from "./PlanReference.js";
import { estimateBundleImageCount } from "./buildExtractionPageBundles.js";

export interface ReferencedPageTarget {
  pageNumber: number;
  reason: string;
  planReferenceIds: string[];
  /** Optional detail numbers requested on this sheet. */
  detailNumbers: string[];
}

/**
 * Groups resolved PlanReferences into unique target pages for extraction.
 * Unresolved/ambiguous references are excluded (fail closed).
 */
export function selectResolvedReferencedPageTargets(
  references: readonly PlanReference[],
): ReferencedPageTarget[] {
  const byPage = new Map<number, ReferencedPageTarget>();

  for (const reference of references) {
    if (reference.status !== "resolved" || reference.targetPageNumber === null) {
      continue;
    }
    const pageNumber = reference.targetPageNumber;
    const existing = byPage.get(pageNumber);
    if (!existing) {
      byPage.set(pageNumber, {
        pageNumber,
        reason: `Referenced from '${reference.originalText}' (${reference.originatingSubjectKind}:${reference.originatingSubjectKey}).`,
        planReferenceIds: [reference.id],
        detailNumbers: reference.detailNumber ? [reference.detailNumber] : [],
      });
      continue;
    }
    existing.planReferenceIds.push(reference.id);
    if (
      reference.detailNumber &&
      !existing.detailNumbers.includes(reference.detailNumber)
    ) {
      existing.detailNumbers.push(reference.detailNumber);
    }
    existing.reason = `${existing.reason} Also '${reference.originalText}'.`;
  }

  return [...byPage.values()].sort((left, right) => left.pageNumber - right.pageNumber);
}

/**
 * Builds one full-sheet-only extraction bundle per referenced target page.
 *
 * Visual strategy (B1.7): target full sheet only — no automatic 12-tile fanout.
 * Detail numbers are not spatially known; full-sheet context is the smallest
 * generic correct approach under the image budget.
 *
 * Role is `referenced` (not primary). Intent is `referenced-detail`.
 */
export function buildReferencedPageExtractionBundles(input: {
  planIndex: PlanIndex;
  scopeName: string;
  targets: readonly ReferencedPageTarget[];
  maxImages?: number;
}): ExtractionPageBundle[] {
  const maxImages = input.maxImages ?? MAX_VISUAL_IMAGES_PER_EXTRACTION_REQUEST;
  const pagesByNumber = new Map(
    input.planIndex.pages.map((page) => [page.pageNumber, page]),
  );

  return input.targets.map((target) => {
    const page = pagesByNumber.get(target.pageNumber);
    if (!page) {
      throw new Error(
        `buildReferencedPageExtractionBundles: page ${target.pageNumber} is not in the plan index.`,
      );
    }

    const members: ExtractionPageBundleMember[] = [
      {
        pageNumber: target.pageNumber,
        role: "referenced",
        visualDetailLevel: "full-page",
        sheetId: page.sheetId,
        label: page.label,
        reason: target.reason,
      },
    ];

    const estimatedImages = estimateBundleImageCount(members, 12);
    if (estimatedImages > maxImages) {
      throw new Error(
        `buildReferencedPageExtractionBundles: estimatedImages=${estimatedImages} exceeds maxImages=${maxImages}.`,
      );
    }

    const detailNote =
      target.detailNumbers.length > 0
        ? ` Seek detail(s) ${target.detailNumbers.join(", ")} on this sheet when visible.`
        : "";

    return {
      bundleId: `bundle:${input.scopeName}:referenced-detail:p${target.pageNumber}`,
      scopeName: input.scopeName,
      intent: "referenced-detail",
      members,
      orderedPageNumbers: [target.pageNumber],
      imageBudget: {
        maxImages,
        estimatedImages,
        tilesPerDetailedPage: 0,
      },
      routingNotes: [
        "Referenced-page pass: full-sheet only (no automatic tiling).",
        `PlanReference ids: ${target.planReferenceIds.join(", ")}.`,
        detailNote.trim(),
        `Image budget ${estimatedImages}/${maxImages}.`,
      ],
    };
  });
}
