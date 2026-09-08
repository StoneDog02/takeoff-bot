import {
  estimateBundleImageCount,
  estimateImagesForVisualDetailLevel,
} from "../../pdf/buildExtractionPageBundles.js";
import type { ExtractionPageBundle } from "../../pdf/ExtractionPageBundle.js";
import {
  DEFAULT_PAGE_TILE_GRID,
} from "../../pdf/PlanPageVisualTile.js";
import type { PlanIndex } from "../../pdf/PlanIndex.js";
import {
  buildSequentialExtractionPageBundles,
  pageHasPlanLayoutContent,
  planIntentExtractionRouting,
  type FramingExtractionIntent,
  type IntentExtractionRoutingPlan,
} from "../../pdf/deriveRoleAssignmentsFromPageClassification.js";
import { MAX_VISUAL_IMAGES_PER_EXTRACTION_REQUEST } from "../../pdf/visualImageBudget.js";
import type { ClassifiedPlanPage } from "../../pdf/pageClassification.js";
import { inferContentRolesFromVisualEvidence } from "../../pdf/pageClassification.js";
import { requiredInputPathsForIntents } from "../read/calculatorRequiredInputs.js";
import type {
  ExtractionBudgetAudit,
  ExtractionWorkUnitAudit,
} from "./extractionBudgetAudit.schema.js";
import { resolveExtractionBrainPackPathsForIntents } from "./framingExtractionBrainPacks.js";

export const DEFAULT_FRAMING_EXTRACTION_INTENTS: readonly FramingExtractionIntent[] =
  [
    "wall-framing",
    "floor-framing",
    "roof-framing",
    "openings",
    "structural-members",
    "sheathing",
  ];

export interface FramingExtractionWorkUnit {
  extractionPassId: string;
  bundle: ExtractionPageBundle;
  routingPlan: IntentExtractionRoutingPlan;
  regionId: string;
  requiredInputs: string[];
  identifiedSystems: FramingExtractionIntent[];
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
    brainPackPaths: [
      ...resolveExtractionBrainPackPathsForIntents(
        workUnit.identifiedSystems.length > 0
          ? workUnit.identifiedSystems
          : [workUnit.bundle.intent],
      ),
    ],
    regionId: workUnit.regionId,
    requiredInputs: [...workUnit.requiredInputs],
    identifiedSystems: [...workUnit.identifiedSystems],
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

function isPlanLikeSheet(page: ClassifiedPlanPage): boolean {
  return (
    page.pageKind === "plan" ||
    page.pageKind === "framing-plan" ||
    (page.pageKind === "mixed" && pageHasPlanLayoutContent(page))
  );
}

/**
 * Fail-closed floor-framing sheet identity from title/label or plan-layout
 * pageKind — not from visual scopeHints. Crawl / foundation / floor-plan
 * sheets must still request floor-framing when the classifier omits "floor".
 * Elevations and details are excluded by pageHasPlanLayoutContent / pageKind.
 */
function sheetIdentityIndicatesFloorFraming(page: ClassifiedPlanPage): boolean {
  if (!pageHasPlanLayoutContent(page)) {
    return false;
  }

  const titleBits = [page.titleOrLabel, page.label]
    .filter(
      (value): value is string =>
        typeof value === "string" && value.trim().length > 0,
    )
    .join("\n")
    .toLowerCase();
  if (
    /\bcrawl\b/.test(titleBits) ||
    /\bfoundation\b/.test(titleBits) ||
    /\bfloor\s+plan\b/.test(titleBits)
  ) {
    return true;
  }

  return page.pageKind === "plan" && !page.scopeHints.includes("roof");
}

function identifiedSystemsForSheet(
  page: ClassifiedPlanPage,
  requested: ReadonlySet<FramingExtractionIntent>,
): FramingExtractionIntent[] {
  if (!page.relevantToFraming) {
    return [];
  }
  if (page.needsVisualClassification || page.pageKind === "unknown") {
    return [];
  }
  if (page.pageKind === "detail" || page.pageKind === "section") {
    return [];
  }
  if (!pageHasPlanLayoutContent(page)) {
    return [];
  }

  const roofOnly =
    page.scopeHints.includes("roof") &&
    !page.scopeHints.includes("floor") &&
    !page.scopeHints.includes("wall");
  const systems: FramingExtractionIntent[] = [];

  if (page.scopeHints.includes("roof")) {
    systems.push("roof-framing");
  }
  if (
    page.scopeHints.includes("floor") ||
    sheetIdentityIndicatesFloorFraming(page)
  ) {
    systems.push("floor-framing");
  }
  if (page.scopeHints.includes("wall") || (!roofOnly && isPlanLikeSheet(page))) {
    systems.push("wall-framing");
  }
  if (
    page.scopeHints.includes("openings") ||
    (!roofOnly && isPlanLikeSheet(page))
  ) {
    systems.push("openings");
  }
  if (page.scopeHints.includes("structural")) {
    systems.push("structural-members");
  }
  if (
    page.scopeHints.includes("framing") ||
    page.scopeHints.includes("wall") ||
    page.scopeHints.includes("floor") ||
    page.scopeHints.includes("roof")
  ) {
    systems.push("sheathing");
  }

  return systems.filter((intent) => requested.has(intent));
}

const REGION_INTENT_PRIORITY: readonly FramingExtractionIntent[] = [
  "roof-framing",
  "floor-framing",
  "wall-framing",
  "openings",
  "structural-members",
  "sheathing",
  "framing-general",
];

function primaryIntentForRegion(
  systems: readonly FramingExtractionIntent[],
): FramingExtractionIntent {
  for (const intent of REGION_INTENT_PRIORITY) {
    if (systems.includes(intent)) {
      return intent;
    }
  }
  return "framing-general";
}

function restrictRoutingToPrimaryPage(
  routingPlan: IntentExtractionRoutingPlan,
  primaryPageNumber: number,
): IntentExtractionRoutingPlan {
  const primaryAssignments = (routingPlan.allAssignments ?? []).filter(
    (assignment) =>
      assignment.role === "primary" &&
      assignment.pageNumber === primaryPageNumber,
  );
  const primaries =
    primaryAssignments.length > 0
      ? primaryAssignments
      : [
          {
            pageNumber: primaryPageNumber,
            role: "primary" as const,
            reason: `Construction-region primary page ${primaryPageNumber} for intent '${routingPlan.intent}'.`,
          },
        ];

  return {
    ...routingPlan,
    routingSafe: true,
    primaryPageNumbers: [primaryPageNumber],
    allAssignments: [...primaries, ...routingPlan.sharedSupportAssignments],
    routingNotes: [
      `Construction region: whole framing sheet page ${primaryPageNumber} (one primary, not 6-intent fan-out).`,
      ...routingPlan.routingNotes,
    ],
  };
}

/**
 * Builds a deterministic, budget-safe extraction work plan from classified pages.
 * Work units are construction regions (whole relevant framing sheets first).
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
  const requested = new Set(intents);
  const pages = normalizePagesForExtractionRouting(input.pages);

  const regionPages = pages
    .map((page) => ({
      page,
      identifiedSystems: identifiedSystemsForSheet(page, requested),
    }))
    .filter((entry) => entry.identifiedSystems.length > 0)
    .sort((left, right) => left.page.pageNumber - right.page.pageNumber);

  const workUnits: FramingExtractionWorkUnit[] = [];

  for (const region of regionPages) {
    const intent = primaryIntentForRegion(region.identifiedSystems);
    const routingPlan = restrictRoutingToPrimaryPage(
      planIntentExtractionRouting({ pages, intent }),
      region.page.pageNumber,
    );
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

    const requiredInputs = requiredInputPathsForIntents(region.identifiedSystems);
    const regionId = `region:sheet:p${region.page.pageNumber}`;

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

      const stamped: ExtractionPageBundle = {
        ...bundle,
        regionId,
        identifiedSystems: [...region.identifiedSystems],
        requiredInputs,
      };

      workUnits.push({
        extractionPassId: extractionPassIdForBundle(stamped),
        bundle: stamped,
        routingPlan,
        regionId,
        requiredInputs,
        identifiedSystems: region.identifiedSystems,
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

