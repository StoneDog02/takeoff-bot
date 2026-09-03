import { z } from "zod";

import type { PlanIndex } from "./PlanPage.js";
import type { PlanPageVisual } from "./PlanPageVisual.js";
import {
  classifiedPlanPageSchema,
  defaultContentRolesFromPageKind,
  inferContentRolesFromVisualEvidence,
  pageKindSchema,
  pageScopeHintSchema,
  pageContentRoleSchema,
  pageClassificationConfidenceSchema,
  type ClassifiedPlanPage,
} from "./pageClassification.js";
import {
  disciplineFromSignals,
  isRelevantToFraming,
  legacyPageTypeFromPageKind,
} from "./pageClassification.js";

/**
 * Structured visual page-classification output. Claude may only fill this
 * schema in a future authorized live call — never framing quantities.
 */
export const visualPageClassificationItemSchema = z.object({
  pageNumber: z.number().int().positive(),
  pageKind: pageKindSchema,
  scopeHints: z.array(pageScopeHintSchema).default([]),
  /**
   * Required for mixed pages. Non-mixed pages may omit; defaults derive from pageKind.
   */
  contentRoles: z.array(pageContentRoleSchema).default([]),
  titleOrLabel: z.string().trim().min(1).nullable().default(null),
  evidenceText: z.string().trim().min(1),
  confidenceLabel: pageClassificationConfidenceSchema,
  classificationReason: z.string().trim().min(1),
});

export const visualPageClassificationPayloadSchema = z.object({
  pages: z.array(visualPageClassificationItemSchema).min(1),
});

export type VisualPageClassificationPayload = z.infer<
  typeof visualPageClassificationPayloadSchema
>;

export interface VisualClassificationQueueEntry {
  pageNumber: number;
  sheetId: string | null;
  label: string | null;
  /** Full-sheet scale-1 (or configured) render is the intended classifier input. */
  preferredVisualInput: "full-sheet";
  renderAvailable: boolean;
  pngPath: string | null;
}

/**
 * Builds the mechanical queue for a future live visual classification call.
 * Uses full-sheet context only — not detail tiles.
 */
export function buildVisualClassificationQueue(input: {
  planIndex: PlanIndex;
  classifiedPages: readonly ClassifiedPlanPage[];
  pageVisuals?: readonly PlanPageVisual[];
}): VisualClassificationQueueEntry[] {
  const visualsByPage = new Map(
    (input.pageVisuals ?? []).map((visual) => [visual.pageNumber, visual]),
  );

  return input.classifiedPages
    .filter((page) => page.needsVisualClassification)
    .map((page) => {
      const visual = visualsByPage.get(page.pageNumber);
      return {
        pageNumber: page.pageNumber,
        sheetId: page.sheetId,
        label: page.label,
        preferredVisualInput: "full-sheet" as const,
        renderAvailable: visual != null,
        pngPath: visual?.imagePath ?? null,
      };
    });
}

/**
 * Merges validated visual classifier results into deterministic classifications.
 * Invalid / unknown-missing pages stay visual-pending rather than coerced.
 */
export function mergeVisualPageClassifications(input: {
  existing: readonly ClassifiedPlanPage[];
  visualPayload: VisualPageClassificationPayload;
}): ClassifiedPlanPage[] {
  const byNumber = new Map(
    input.visualPayload.pages.map((page) => [page.pageNumber, page]),
  );

  return input.existing.map((page) => {
    if (!page.needsVisualClassification) {
      return page;
    }
    const visual = byNumber.get(page.pageNumber);
    if (!visual) {
      return page;
    }

    const pageKind = visual.pageKind;
    const scopeHints = visual.scopeHints;
    const contentRoles = inferContentRolesFromVisualEvidence({
      pageKind,
      contentRoles: visual.contentRoles,
      titleOrLabel: visual.titleOrLabel,
      evidenceText: visual.evidenceText,
    });
    return classifiedPlanPageSchema.parse({
      pageNumber: page.pageNumber,
      sheetId: page.sheetId,
      label: page.label,
      pageKind,
      scopeHints,
      contentRoles,
      discipline: disciplineFromSignals({
        sheetId: page.sheetId,
        text: `${visual.titleOrLabel ?? ""}\n${visual.evidenceText}`,
        scopeHints,
      }),
      pageType: legacyPageTypeFromPageKind(pageKind),
      relevantToFraming: isRelevantToFraming({ pageKind, scopeHints }),
      needsVisualClassification: false,
      classificationMethod: "visual",
      titleOrLabel: visual.titleOrLabel,
      evidenceText: visual.evidenceText,
      classificationReason: visual.classificationReason,
      confidenceLabel: visual.confidenceLabel,
    });
  });
}

/** Proposed live-call batching: small page batches of full-sheet images only. */
export const VISUAL_CLASSIFICATION_PAGES_PER_REQUEST = 6;
