import type { ClassifiedPlanPage, PageKind } from "./pageClassification.js";

function kindRank(pageKind: PageKind): number {
  switch (pageKind) {
    case "cover":
      return 0;
    case "notes":
      return 1;
    case "framing-plan":
      return 2;
    case "plan":
      return 3;
    case "schedule":
      return 4;
    case "section":
      return 5;
    case "elevation":
      return 6;
    case "detail":
      return 7;
    case "mixed":
      return 8;
    case "other":
      return 9;
    case "unknown":
      return 10;
    default: {
      const _exhaustive: never = pageKind;
      return _exhaustive;
    }
  }
}

/**
 * Deterministic reading order from classification — replaces hardcoded
 * mock page sequences.
 *
 * Prefer notes/context before plans, then schedules, then details.
 * Unknown / visual-pending pages sort last by pageNumber.
 */
export function buildPlanReadingOrderFromClassification(
  pages: readonly ClassifiedPlanPage[],
): {
  orderedPageNumbers: number[];
  rationale: string[];
} {
  const ordered = [...pages].sort((left, right) => {
    const rankDelta = kindRank(left.pageKind) - kindRank(right.pageKind);
    if (rankDelta !== 0) {
      return rankDelta;
    }
    // Within framing plans, floor before roof when hints differ.
    if (left.pageKind === "framing-plan" && right.pageKind === "framing-plan") {
      const leftRoof = left.scopeHints.includes("roof") ? 1 : 0;
      const rightRoof = right.scopeHints.includes("roof") ? 1 : 0;
      if (leftRoof !== rightRoof) {
        return leftRoof - rightRoof;
      }
    }
    return left.pageNumber - right.pageNumber;
  });

  return {
    orderedPageNumbers: ordered.map((page) => page.pageNumber),
    rationale: [
      "Order by pageKind: cover → notes → plans → schedules → sections/elevations → details → other/unknown.",
      "Within framing plans, floor-scoped pages precede roof-scoped pages when hints differ.",
      "Unknown and visual-pending pages sort last; they are not preferred extraction context.",
    ],
  };
}
