import type { ClassifiedPlanPage } from "./pageClassification.js";
import type { PlanIndex, PlanPage } from "./PlanPage.js";

const ARCH_SHEET_IN_TITLE = /\b([A-Za-z]\d+(?:\.\d+)+)\b/;

export interface SheetIdentityEntry {
  pageNumber: number;
  /** Canonical architectural sheet id when known (e.g. S5.2). */
  architecturalSheetId: string | null;
  /** PlanIndex sheetId / outline code when present (e.g. 52). */
  outlineSheetId: string | null;
  label: string | null;
  titleOrLabel: string | null;
}

export interface SheetIdentityIndex {
  entries: SheetIdentityEntry[];
  byArchitecturalSheetId: ReadonlyMap<string, number[]>;
}

function canonicalizeSheetId(sheetId: string): string {
  return sheetId.trim().toUpperCase();
}

function architecturalIdFromTitle(titleOrLabel: string | null): string | null {
  if (!titleOrLabel) {
    return null;
  }
  const match = titleOrLabel.match(ARCH_SHEET_IN_TITLE);
  return match ? canonicalizeSheetId(match[1]!) : null;
}

/**
 * Builds a deterministic sheet identity index from classification pages
 * (preferred) and/or PlanIndex pages.
 */
export function buildSheetIdentityIndex(input: {
  planIndex: PlanIndex;
  classifiedPages?: readonly ClassifiedPlanPage[];
}): SheetIdentityIndex {
  const classifiedByPage = new Map(
    (input.classifiedPages ?? []).map((page) => [page.pageNumber, page]),
  );
  const entries: SheetIdentityEntry[] = input.planIndex.pages.map((page) => {
    const classified = classifiedByPage.get(page.pageNumber);
    const fromTitle =
      architecturalIdFromTitle(classified?.titleOrLabel ?? null) ??
      architecturalIdFromTitle(classified?.label ?? null) ??
      architecturalIdFromTitle(page.label);
    const fromSheetId =
      page.sheetId && /^[A-Za-z]\d+(?:\.\d+)+$/.test(page.sheetId)
        ? canonicalizeSheetId(page.sheetId)
        : null;
    return {
      pageNumber: page.pageNumber,
      architecturalSheetId: fromTitle ?? fromSheetId,
      outlineSheetId: page.sheetId,
      label: page.label,
      titleOrLabel: classified?.titleOrLabel ?? null,
    };
  });

  const byArchitecturalSheetId = new Map<string, number[]>();
  for (const entry of entries) {
    if (!entry.architecturalSheetId) {
      continue;
    }
    const existing = byArchitecturalSheetId.get(entry.architecturalSheetId) ?? [];
    existing.push(entry.pageNumber);
    byArchitecturalSheetId.set(entry.architecturalSheetId, existing);
  }

  return { entries, byArchitecturalSheetId };
}

export type PlanReferenceTargetResolution =
  | {
      status: "resolved";
      targetPageNumber: number;
      matchedArchitecturalSheetId: string;
    }
  | {
      status: "unresolved";
      reason: string;
    }
  | {
      status: "ambiguous";
      reason: string;
      candidatePageNumbers: number[];
    };

/**
 * Resolves a parsed architectural sheet id to a PlanIndex page number.
 * Exact canonical match only. Fails closed on zero or multiple matches.
 */
export function resolveArchitecturalSheetToPage(
  targetSheetId: string,
  index: SheetIdentityIndex,
): PlanReferenceTargetResolution {
  const canonical = canonicalizeSheetId(targetSheetId);
  const pages = index.byArchitecturalSheetId.get(canonical) ?? [];
  if (pages.length === 1) {
    return {
      status: "resolved",
      targetPageNumber: pages[0]!,
      matchedArchitecturalSheetId: canonical,
    };
  }
  if (pages.length === 0) {
    return {
      status: "unresolved",
      reason: `No plan page matched architectural sheet id '${canonical}'.`,
    };
  }
  return {
    status: "ambiguous",
    reason: `Multiple plan pages matched architectural sheet id '${canonical}'.`,
    candidatePageNumbers: [...pages].sort((a, b) => a - b),
  };
}

export function planPageForNumber(
  planIndex: PlanIndex,
  pageNumber: number,
): PlanPage | undefined {
  return planIndex.pages.find((page) => page.pageNumber === pageNumber);
}
