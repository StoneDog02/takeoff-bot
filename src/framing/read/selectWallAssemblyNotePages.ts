import type { ClassifiedPlanPage } from "../../pdf/pageClassification.js";

/**
 * Classification-selected notes/schedule pages for wall-assembly OCR.
 * Replaces hardcoded pages 1/3/4.
 */
export function selectWallAssemblyNotePages(input: {
  classifiedPages: readonly ClassifiedPlanPage[];
  totalPages: number;
}): number[] {
  const selected: number[] = [];
  const seen = new Set<number>();

  function add(pageNumber: number): void {
    if (pageNumber < 1 || pageNumber > input.totalPages) {
      return;
    }
    if (seen.has(pageNumber)) {
      return;
    }
    seen.add(pageNumber);
    selected.push(pageNumber);
  }

  for (const page of input.classifiedPages) {
    const notesLike =
      page.pageKind === "notes" ||
      page.pageKind === "schedule" ||
      page.contentRoles.includes("notes") ||
      page.contentRoles.includes("schedule");
    if (notesLike && page.relevantToFraming) {
      add(page.pageNumber);
    }
  }

  if (selected.length === 0) {
    for (const page of input.classifiedPages) {
      if (
        (page.pageKind === "plan" || page.pageKind === "framing-plan") &&
        page.relevantToFraming
      ) {
        add(page.pageNumber);
        break;
      }
    }
  }

  return selected;
}
