import { MAX_VISUAL_IMAGES_PER_EXTRACTION_REQUEST } from "./visualImageBudget.js";
import {
  DEFAULT_PAGE_TILE_GRID,
} from "./PlanPageVisualTile.js";
import type { PlanIndex, PlanPage } from "./PlanPage.js";
import type {
  ExtractionPageBundle,
  ExtractionPageBundleMember,
  ExtractionPageRole,
  ExtractionPageRoleAssignment,
  PageVisualDetailLevel,
} from "./ExtractionPageBundle.js";

export interface BuildExtractionPageBundlesInput {
  planIndex: PlanIndex;
  scopeName: string;
  intent: string;
  /**
   * Explicit role assignments for this scoped extraction.
   * V1 routing does not invent roles from opaque outline codes.
   */
  roleAssignments: readonly ExtractionPageRoleAssignment[];
  maxImages?: number;
  tilesPerDetailedPage?: number;
}

function pagesByNumber(planIndex: PlanIndex): Map<number, PlanPage> {
  return new Map(planIndex.pages.map((page) => [page.pageNumber, page]));
}

function defaultVisualDetailForRole(
  role: ExtractionPageRole,
): PageVisualDetailLevel {
  // Strategy A: one detailed primary; supporting/referenced/global are full-sheet only.
  return role === "primary" ? "full-page-and-tiles" : "full-page";
}

export function estimateImagesForVisualDetailLevel(
  level: PageVisualDetailLevel,
  tilesPerDetailedPage: number,
): number {
  switch (level) {
    case "full-page-and-tiles":
      return 1 + tilesPerDetailedPage;
    case "full-page-and-selected-tiles":
      return 1 + tilesPerDetailedPage;
    case "selected-tiles":
      return tilesPerDetailedPage;
    case "full-page":
      return 1;
    case "none":
      return 0;
    default: {
      const _exhaustive: never = level;
      return _exhaustive;
    }
  }
}

export function estimateBundleImageCount(
  members: readonly Pick<ExtractionPageBundleMember, "visualDetailLevel">[],
  tilesPerDetailedPage: number,
): number {
  return members.reduce(
    (sum, member) =>
      sum +
      estimateImagesForVisualDetailLevel(
        member.visualDetailLevel,
        tilesPerDetailedPage,
      ),
    0,
  );
}

function roleSortKey(role: ExtractionPageRole): number {
  switch (role) {
    case "primary":
      return 0;
    case "supporting":
      return 1;
    case "referenced":
      return 2;
    case "global":
      return 3;
    default: {
      const _exhaustive: never = role;
      return _exhaustive;
    }
  }
}

function deterministicBundleId(input: {
  scopeName: string;
  intent: string;
  orderedPageNumbers: readonly number[];
}): string {
  return `bundle:${input.scopeName}:${input.intent}:p${input.orderedPageNumbers.join("-")}`;
}

/**
 * Builds budget-safe extraction page bundles from explicit role assignments.
 *
 * Strategy A (default):
 * - exactly one primary page receives full-page + tiles
 * - supporting / referenced / global pages receive full-page context only
 * - if the member set exceeds the image budget, it is decomposed into sequential
 *   bundles that share the same primary and partition supports
 *
 * Does not invent page roles from sheet IDs or outline codes.
 */
export function buildExtractionPageBundles(
  input: BuildExtractionPageBundlesInput,
): ExtractionPageBundle[] {
  const maxImages = input.maxImages ?? MAX_VISUAL_IMAGES_PER_EXTRACTION_REQUEST;
  const tilesPerDetailedPage =
    input.tilesPerDetailedPage ??
    DEFAULT_PAGE_TILE_GRID.columns * DEFAULT_PAGE_TILE_GRID.rows;

  if (input.roleAssignments.length === 0) {
    throw new Error(
      "buildExtractionPageBundles: roleAssignments must not be empty.",
    );
  }

  const byPage = pagesByNumber(input.planIndex);
  const deduped = new Map<number, ExtractionPageRoleAssignment>();
  for (const assignment of input.roleAssignments) {
    if (!byPage.has(assignment.pageNumber)) {
      throw new Error(
        `buildExtractionPageBundles: page ${assignment.pageNumber} is not in the plan index.`,
      );
    }
    const existing = deduped.get(assignment.pageNumber);
    if (existing && existing.role !== assignment.role) {
      throw new Error(
        `buildExtractionPageBundles: page ${assignment.pageNumber} has conflicting roles (${existing.role} vs ${assignment.role}).`,
      );
    }
    if (!existing) {
      deduped.set(assignment.pageNumber, assignment);
    }
  }

  const primaries = [...deduped.values()].filter(
    (assignment) => assignment.role === "primary",
  );
  if (primaries.length !== 1) {
    throw new Error(
      `buildExtractionPageBundles: exactly one primary page is required for intent '${input.intent}', found ${primaries.length}.`,
    );
  }

  const primaryAssignment = primaries[0]!;
  const primaryCost = estimateImagesForVisualDetailLevel(
    "full-page-and-tiles",
    tilesPerDetailedPage,
  );
  if (primaryCost > maxImages) {
    throw new Error(
      `buildExtractionPageBundles: a single detailed primary page requires ${primaryCost} images, exceeding maxImages=${maxImages}. Reduce tiles-per-page or raise architectural budget via page decomposition — do not silently truncate.`,
    );
  }

  const supportAssignments = [...deduped.values()]
    .filter((assignment) => assignment.role !== "primary")
    .sort((left, right) => {
      const roleDelta = roleSortKey(left.role) - roleSortKey(right.role);
      if (roleDelta !== 0) {
        return roleDelta;
      }
      return left.pageNumber - right.pageNumber;
    });

  const remainingBudget = maxImages - primaryCost;
  const supportCost = 1; // full-page only
  const supportsPerBundle = Math.max(
    0,
    Math.floor(remainingBudget / supportCost),
  );

  const supportChunks: ExtractionPageRoleAssignment[][] = [];
  if (supportAssignments.length === 0) {
    supportChunks.push([]);
  } else if (supportsPerBundle === 0) {
    throw new Error(
      `buildExtractionPageBundles: no remaining image budget for supporting pages after primary (primaryCost=${primaryCost}, maxImages=${maxImages}).`,
    );
  } else {
    for (let index = 0; index < supportAssignments.length; index += supportsPerBundle) {
      supportChunks.push(
        supportAssignments.slice(index, index + supportsPerBundle),
      );
    }
  }

  return supportChunks.map((chunk, chunkIndex) => {
    const members: ExtractionPageBundleMember[] = [];
    const primaryPage = byPage.get(primaryAssignment.pageNumber)!;
    members.push({
      pageNumber: primaryAssignment.pageNumber,
      role: "primary",
      visualDetailLevel: "full-page-and-tiles",
      sheetId: primaryPage.sheetId,
      label: primaryPage.label,
      reason:
        primaryAssignment.reason ??
        "Primary page for scoped extraction (full sheet + detail tiles).",
    });

    for (const assignment of chunk) {
      const page = byPage.get(assignment.pageNumber)!;
      members.push({
        pageNumber: assignment.pageNumber,
        role: assignment.role,
        visualDetailLevel: defaultVisualDetailForRole(assignment.role),
        sheetId: page.sheetId,
        label: page.label,
        reason:
          assignment.reason ??
          `${assignment.role} page (full-sheet context only).`,
      });
    }

    members.sort((left, right) => {
      const roleDelta = roleSortKey(left.role) - roleSortKey(right.role);
      if (roleDelta !== 0) {
        return roleDelta;
      }
      return left.pageNumber - right.pageNumber;
    });

    const orderedPageNumbers = members.map((member) => member.pageNumber);
    const estimatedImages = estimateBundleImageCount(
      members,
      tilesPerDetailedPage,
    );
    if (estimatedImages > maxImages) {
      throw new Error(
        `buildExtractionPageBundles: internal budget error estimatedImages=${estimatedImages} > maxImages=${maxImages}.`,
      );
    }

    const routingNotes = [
      "Strategy A: one primary page at full-page-and-tiles; other roles full-page only.",
      `Image budget ${estimatedImages}/${maxImages}.`,
    ];
    if (supportChunks.length > 1) {
      routingNotes.push(
        `Sequential pass ${chunkIndex + 1}/${supportChunks.length} for supporting pages under the image budget.`,
      );
    }

    return {
      bundleId: deterministicBundleId({
        scopeName: input.scopeName,
        intent: input.intent,
        orderedPageNumbers,
      }),
      scopeName: input.scopeName,
      intent: input.intent,
      members,
      orderedPageNumbers,
      imageBudget: {
        maxImages,
        estimatedImages,
        tilesPerDetailedPage,
      },
      routingNotes,
    };
  });
}
