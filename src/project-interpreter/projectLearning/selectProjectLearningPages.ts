import type { ClassifiedPlanPage } from "../../plans/pageClassification.js";
import type { PlanIndex } from "../../plans/PlanIndex.js";

function pageHasSubstantialText(page: { textContent: string }): boolean {
  return page.textContent.trim().length >= 200;
}

/**
 * Definition / reference pages for Project Learning — not every plan sheet
 * that happens to carry incidental notes.
 *
 * Include: schedule / notes / index pageKinds; pages with schedule or index roles;
 * notes-only sheets without plan-layout.
 * Exclude: framing-plan / plan primaries whose only learning-ish role is notes.
 */
export function isProjectLearningDefinitionPage(
  page: ClassifiedPlanPage,
): boolean {
  if (page.pageKind === "schedule" || page.pageKind === "notes") {
    return true;
  }

  const roles = new Set(page.contentRoles);
  if (roles.has("schedule") || roles.has("index")) {
    return true;
  }

  // Standalone notes sheets (no plan-layout) remain eligible.
  if (
    roles.has("notes") &&
    !roles.has("plan-layout") &&
    page.pageKind !== "framing-plan" &&
    page.pageKind !== "plan"
  ) {
    return true;
  }

  return false;
}

export type ProjectLearningPageSelection = {
  pageNumbers: number[];
  preferHybrid: boolean;
  reason: string;
};

/**
 * Scope Project Learning harvest to genuine definition/reference pages.
 * Prefer Hybrid only when those pages lack substantial native text.
 */
export function selectProjectLearningPages(input: {
  classifiedPages: readonly ClassifiedPlanPage[];
  planIndex: PlanIndex;
}): ProjectLearningPageSelection {
  const learningPages = input.classifiedPages.filter(
    isProjectLearningDefinitionPage,
  );
  const pageNumbers = learningPages
    .map((p) => p.pageNumber)
    .sort((a, b) => a - b);

  if (pageNumbers.length === 0) {
    return {
      pageNumbers: [],
      preferHybrid: false,
      reason:
        "No schedule/legend/notes/index definition-reference pages in classification",
    };
  }

  const textByPage = new Map(
    input.planIndex.pages.map((p) => [p.pageNumber, p] as const),
  );
  const anyTextless = pageNumbers.some((n) => {
    const page = textByPage.get(n);
    return !page || !pageHasSubstantialText(page);
  });

  return {
    pageNumbers,
    preferHybrid: anyTextless,
    reason: anyTextless
      ? "Definition/reference pages include textless sheets — Hybrid+force-OCR preferred when available"
      : "Definition/reference pages have selectable text — local ODL structured harvest preferred",
  };
}
