import {
  estimateBundleImageCount,
  estimateImagesForVisualDetailLevel,
} from "../../../plans/buildExtractionPageBundles.js";
import type { ExtractionPageBundle } from "../../../plans/ExtractionPageBundle.js";
import {
  DEFAULT_PAGE_TILE_GRID,
} from "../../../plans/PlanPageVisualTile.js";
import type { PlanIndex } from "../../../plans/PlanIndex.js";
import {
  buildSequentialExtractionPageBundles,
  planIntentExtractionRouting,
  type FramingExtractionIntent,
  type IntentExtractionRoutingPlan,
} from "../../../plans/deriveRoleAssignmentsFromPageClassification.js";
import { MAX_VISUAL_IMAGES_PER_EXTRACTION_REQUEST } from "../../../plans/visualImageBudget.js";
import type { ClassifiedPlanPage } from "../../../plans/pageClassification.js";
import { inferContentRolesFromVisualEvidence } from "../../../plans/pageClassification.js";
import type {
  ExtractionBudgetAudit,
  ExtractionWorkUnitAudit,
} from "./extractionBudgetAudit.schema.js";

export const DEFAULT_FRAMING_EXTRACTION_INTENTS: readonly FramingExtractionIntent[] =
  ["wall-framing", "floor-framing", "roof-framing"];

export interface FramingExtractionWorkUnit {
  extractionPassId: string;
  bundle: ExtractionPageBundle;
  routingPlan: IntentExtractionRoutingPlan;
}

export interface BuildFramingExtractionWorkPlanInput {
  planIndex: PlanIndex;
  pages: readonly ClassifiedPlanPage[];
  scopeName: string;
  intents?: readonly FramingExtractionIntent[];
  maxImages?: number;
  tilesPerDetailedPage?: number;
}

export interface FramingExtractionWorkPlan {
  workUnits: FramingExtractionWorkUnit[];
  audit: ExtractionBudgetAudit;
}

function extractionPassIdForBundle(bundle: ExtractionPageBundle): string {
  return `pass:${bundle.bundleId}`;
}

function countFullSheetsAndTiles(
  bundle: ExtractionPageBundle,
  tilesPerDetailedPage: number,
): { fullSheetCount: number; tileCount: number } {
  let fullSheetCount = 0;
  let tileCount = 0;

  for (const member of bundle.members) {
    const images = estimateImagesForVisualDetailLevel(
      member.visualDetailLevel,
      tilesPerDetailedPage,
    );
    switch (member.visualDetailLevel) {
      case "full-page-and-tiles":
        fullSheetCount += 1;
        tileCount += tilesPerDetailedPage;
        break;
      case "full-page-and-selected-tiles":
        fullSheetCount += 1;
        tileCount += member.selectedTileIds?.length ?? 0;
        break;
      case "full-page":
        fullSheetCount += 1;
        break;
      case "selected-tiles":
        tileCount += member.selectedTileIds?.length ?? images;
        break;
      case "none":
        break;
      default: {
        const _exhaustive: never = member.visualDetailLevel;
        return _exhaustive;
      }
    }
  }

  return { fullSheetCount, tileCount };
}

function workUnitAudit(
  workUnit: FramingExtractionWorkUnit,
  tilesPerDetailedPage: number,
): ExtractionWorkUnitAudit {
  const { fullSheetCount, tileCount } = countFullSheetsAndTiles(
    workUnit.bundle,
    tilesPerDetailedPage,
  );
  const primaryPageNumbers = workUnit.bundle.members
    .filter((member) => member.role === "primary")
    .map((member) => member.pageNumber);

  return {
    extractionPassId: workUnit.extractionPassId,
    bundleId: workUnit.bundle.bundleId,
    intent: workUnit.bundle.intent,
    orderedPageNumbers: [...workUnit.bundle.orderedPageNumbers],
    primaryPageNumbers,
    estimatedImages: workUnit.bundle.imageBudget.estimatedImages,
    maxImages: workUnit.bundle.imageBudget.maxImages,
    fullSheetCount,
    tileCount,
    pageCount: workUnit.bundle.orderedPageNumbers.length,
    routingNotes: [...workUnit.bundle.routingNotes],
  };
}

function normalizePagesForExtractionRouting(
  pages: readonly ClassifiedPlanPage[],
): ClassifiedPlanPage[] {
  return pages.map((page) => {
    const contentRoles = inferContentRolesFromVisualEvidence({
      pageKind: page.pageKind,
      contentRoles: page.contentRoles,
      titleOrLabel: page.titleOrLabel,
      evidenceText: page.evidenceText ?? page.classificationReason,
    });
    if (
      contentRoles.length === page.contentRoles.length &&
      contentRoles.every((role, index) => role === page.contentRoles[index])
    ) {
      return page;
    }
    return { ...page, contentRoles };
  });
}

/**
 * Builds a deterministic, budget-safe extraction work plan from classified pages.
 * Each work unit maps to one Claude multimodal call scoped by intent + page bundle.
 */
export function buildFramingExtractionWorkPlan(
  input: BuildFramingExtractionWorkPlanInput,
): FramingExtractionWorkPlan {
  const maxImages =
    input.maxImages ?? MAX_VISUAL_IMAGES_PER_EXTRACTION_REQUEST;
  const tilesPerDetailedPage =
    input.tilesPerDetailedPage ??
    DEFAULT_PAGE_TILE_GRID.columns * DEFAULT_PAGE_TILE_GRID.rows;
  const intents = input.intents ?? DEFAULT_FRAMING_EXTRACTION_INTENTS;
  const pages = normalizePagesForExtractionRouting(input.pages);

  const workUnits: FramingExtractionWorkUnit[] = [];

  for (const intent of intents) {
    const routingPlan = planIntentExtractionRouting({
      pages,
      intent,
    });
    if (!routingPlan.routingSafe || !routingPlan.allAssignments) {
      continue;
    }

    const bundles = buildSequentialExtractionPageBundles({
      planIndex: input.planIndex,
      scopeName: input.scopeName,
      routingPlan,
      maxImages,
      tilesPerDetailedPage,
    });

    for (const bundle of bundles) {
      const estimatedImages = estimateBundleImageCount(
        bundle.members,
        tilesPerDetailedPage,
      );
      if (estimatedImages > maxImages) {
        throw new Error(
          `buildFramingExtractionWorkPlan: bundle '${bundle.bundleId}' estimates ${estimatedImages} images, exceeding maxImages=${maxImages}.`,
        );
      }

      workUnits.push({
        extractionPassId: extractionPassIdForBundle(bundle),
        bundle,
        routingPlan,
      });
    }
  }

  if (workUnits.length === 0) {
    throw new Error(
      "buildFramingExtractionWorkPlan: no routing-safe extraction work units could be derived from page classification.",
    );
  }

  const workUnitAudits = workUnits.map((unit) =>
    workUnitAudit(unit, tilesPerDetailedPage),
  );

  return {
    workUnits,
    audit: {
      scopeName: input.scopeName,
      intents: [...intents],
      maxImagesPerRequest: maxImages,
      workUnits: workUnitAudits,
      totalEstimatedImages: workUnitAudits.reduce(
        (sum, unit) => sum + unit.estimatedImages,
        0,
      ),
      totalWorkUnits: workUnitAudits.length,
    },
  };
}
