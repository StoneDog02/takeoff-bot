import {
  defaultContentRolesFromPageKind,
  type ClassifiedPlanPage,
  type PageContentRole,
  type PageScopeHint,
} from "../../../plans/pageClassification.js";

const WALL_FRAMING_SCOPE_HINTS: readonly PageScopeHint[] = [
  "wall",
  "framing",
  "structural",
];

const PLAN_LAYOUT_PAGE_KINDS = new Set(["plan", "framing-plan"]);

function resolvedContentRoles(page: ClassifiedPlanPage): PageContentRole[] {
  if (page.contentRoles.length > 0) {
    return page.contentRoles;
  }
  return defaultContentRolesFromPageKind(page.pageKind);
}

function hasContentRole(page: ClassifiedPlanPage, role: PageContentRole): boolean {
  return resolvedContentRoles(page).includes(role);
}

function hintsOverlap(
  pageHints: readonly PageScopeHint[],
  wanted: readonly PageScopeHint[],
): boolean {
  return pageHints.some((hint) => wanted.includes(hint));
}

export function isDrawingCompilerEnabled(): boolean {
  return process.env.TAKEOFF_COMPILER === "1";
}

/**
 * Select plan pages for Drawing Compiler execution (wall-framing intent).
 * Uses pipeline ClassifiedPlanPage routing — not compiler page-role.
 */
export function selectPagesForDrawingCompiler(input: {
  classifiedPages: readonly ClassifiedPlanPage[];
  orderedPageNumbers?: readonly number[];
  /** Pages whose plan index textContent is empty (Beckstead OCR-only path). */
  emptyTextPageNumbers?: readonly number[];
}): number[] {
  const orderIndex = new Map(
    (input.orderedPageNumbers ?? []).map((pageNumber, index) => [
      pageNumber,
      index,
    ]),
  );

  const selected = input.classifiedPages
    .filter((page) =>
      shouldCompilePage(page, {
        emptyTextPageNumbers: input.emptyTextPageNumbers,
      }),
    )
    .map((page) => page.pageNumber);

  selected.sort((a, b) => {
    const ai = orderIndex.get(a);
    const bi = orderIndex.get(b);
    if (ai != null && bi != null) return ai - bi;
    if (ai != null) return -1;
    if (bi != null) return 1;
    return a - b;
  });

  const maxPages = process.env.TAKEOFF_COMPILER_MAX_PAGES
    ? Number(process.env.TAKEOFF_COMPILER_MAX_PAGES)
    : undefined;
  if (maxPages != null && Number.isFinite(maxPages) && maxPages > 0) {
    return selected.slice(0, maxPages);
  }

  return selected;
}

export function shouldCompilePage(
  page: ClassifiedPlanPage,
  opts?: { emptyTextPageNumbers?: readonly number[] },
): boolean {
  const emptyIndexText =
    opts?.emptyTextPageNumbers?.includes(page.pageNumber) ?? false;

  if (
    page.needsVisualClassification &&
    process.env.TAKEOFF_COMPILER_OCR === "1" &&
    emptyIndexText
  ) {
    return true;
  }

  if (page.needsVisualClassification) {
    return false;
  }

  if (
    page.pageKind === "unknown" &&
    page.relevantToFraming &&
    hintsOverlap(page.scopeHints, WALL_FRAMING_SCOPE_HINTS)
  ) {
    return true;
  }

  if (page.confidenceLabel === "low") {
    return false;
  }

  if (!page.relevantToFraming && !emptyIndexText) {
    return false;
  }

  if (page.pageKind === "unknown" && emptyIndexText) {
    return true;
  }

  const hasPlanLayout =
    hasContentRole(page, "plan-layout") ||
    PLAN_LAYOUT_PAGE_KINDS.has(page.pageKind);

  if (!hasPlanLayout) {
    return false;
  }

  if (
    (page.pageKind === "elevation" ||
      page.pageKind === "section" ||
      page.pageKind === "detail") &&
    !hasContentRole(page, "plan-layout")
  ) {
    return false;
  }

  if (
    page.pageKind === "cover" ||
    page.pageKind === "schedule" ||
    page.pageKind === "notes"
  ) {
    if (!hasContentRole(page, "plan-layout")) {
      return false;
    }
  }

  return hintsOverlap(page.scopeHints, WALL_FRAMING_SCOPE_HINTS);
}
