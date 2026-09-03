import type {
  ExtractionPageRoleAssignment,
} from "./ExtractionPageBundle.js";
import type { ExtractionPageBundle } from "./ExtractionPageBundle.js";
import type { PlanIndex } from "./PlanPage.js";
import { buildExtractionPageBundles } from "./buildExtractionPageBundles.js";
import { buildPlanReadingOrderFromClassification } from "./buildPlanReadingOrder.js";
import {
  defaultContentRolesFromPageKind,
  type ClassifiedPlanPage,
  type PageContentRole,
  type PageScopeHint,
} from "./pageClassification.js";

export type FramingExtractionIntent =
  | "wall-framing"
  | "floor-framing"
  | "roof-framing"
  | "openings"
  | "structural-members"
  | "sheathing"
  | "framing-general";

const INTENT_SCOPE_HINTS: Record<
  FramingExtractionIntent,
  readonly PageScopeHint[]
> = {
  "wall-framing": ["wall", "framing", "structural"],
  "floor-framing": ["floor", "framing", "structural"],
  "roof-framing": ["roof", "framing", "structural"],
  openings: ["openings", "wall", "architectural"],
  "structural-members": ["structural", "framing"],
  sheathing: ["framing", "wall", "roof", "floor"],
  "framing-general": ["framing", "structural", "wall", "floor", "roof"],
};

function hintsOverlap(
  pageHints: readonly PageScopeHint[],
  wanted: readonly PageScopeHint[],
): boolean {
  return pageHints.some((hint) => wanted.includes(hint));
}

function resolvedContentRoles(page: ClassifiedPlanPage): PageContentRole[] {
  if (page.contentRoles.length > 0) {
    return page.contentRoles;
  }
  return defaultContentRolesFromPageKind(page.pageKind);
}

function hasContentRole(
  page: ClassifiedPlanPage,
  role: PageContentRole,
): boolean {
  return resolvedContentRoles(page).includes(role);
}

/**
 * Affirmative plan/layout drawing content — required for primary candidacy.
 * Mixed pages without contentRoles including plan-layout are never primary.
 */
export function pageHasPlanLayoutContent(page: ClassifiedPlanPage): boolean {
  if (page.pageKind === "detail" || page.pageKind === "elevation") {
    return false;
  }
  if (page.pageKind === "notes" || page.pageKind === "schedule") {
    return hasContentRole(page, "plan-layout");
  }
  if (page.pageKind === "plan" || page.pageKind === "framing-plan") {
    return true;
  }
  if (page.pageKind === "mixed") {
    return hasContentRole(page, "plan-layout");
  }
  return hasContentRole(page, "plan-layout");
}

function isPlanLikeKind(page: ClassifiedPlanPage): boolean {
  return (
    page.pageKind === "plan" ||
    page.pageKind === "framing-plan" ||
    (page.pageKind === "mixed" && pageHasPlanLayoutContent(page))
  );
}

function isPrimaryCandidate(
  page: ClassifiedPlanPage,
  intent: FramingExtractionIntent,
): boolean {
  if (!page.relevantToFraming) {
    return false;
  }
  if (page.pageKind === "unknown" || page.needsVisualClassification) {
    return false;
  }
  if (page.confidenceLabel === "low") {
    return false;
  }
  if (!pageHasPlanLayoutContent(page)) {
    return false;
  }
  // Details/sections are never automatic primaries.
  if (
    page.pageKind === "detail" ||
    page.pageKind === "section" ||
    hasContentRole(page, "detail")
  ) {
    // Mixed sheets whose only plan-layout is accompanied by dominant detail role
    // still allowed if plan-layout present and pageKind is mixed/plan — but pure
    // detail pageKind is excluded above via pageHasPlanLayoutContent + pageKind.
    if (page.pageKind === "detail") {
      return false;
    }
  }

  const wanted = INTENT_SCOPE_HINTS[intent];

  switch (intent) {
    case "roof-framing":
      return (
        page.scopeHints.includes("roof") ||
        (isPlanLikeKind(page) &&
          !page.scopeHints.includes("floor") &&
          page.scopeHints.includes("roof") === false &&
          page.pageKind === "framing-plan" &&
          (page.scopeHints.length === 0 ||
            hintsOverlap(page.scopeHints, wanted)))
      );
    case "floor-framing":
      return (
        page.scopeHints.includes("floor") ||
        (isPlanLikeKind(page) &&
          !page.scopeHints.includes("roof") &&
          (page.scopeHints.length === 0 ||
            hintsOverlap(page.scopeHints, [
              "floor",
              "framing",
              "structural",
            ])))
      );
    case "wall-framing":
      return (
        page.scopeHints.includes("wall") ||
        (isPlanLikeKind(page) &&
          !page.scopeHints.includes("roof") &&
          (page.scopeHints.length === 0 ||
            hintsOverlap(page.scopeHints, [
              "wall",
              "framing",
              "floor",
              "architectural",
            ])))
      );
    case "openings":
      return (
        page.scopeHints.includes("openings") ||
        page.scopeHints.includes("wall") ||
        (isPlanLikeKind(page) && !page.scopeHints.includes("roof"))
      );
    case "structural-members":
    case "sheathing":
    case "framing-general":
      return (
        isPlanLikeKind(page) || hintsOverlap(page.scopeHints, wanted)
      );
    default: {
      const _exhaustive: never = intent;
      return _exhaustive;
    }
  }
}

/**
 * Lists all primary candidates for an intent (multi-primary allowed).
 * Order follows classification-aware reading order, then pageNumber.
 */
export function listPrimaryCandidatesForIntent(input: {
  pages: readonly ClassifiedPlanPage[];
  intent: FramingExtractionIntent;
}): ClassifiedPlanPage[] {
  const readingOrder = buildPlanReadingOrderFromClassification(input.pages);
  const orderIndex = new Map(
    readingOrder.orderedPageNumbers.map((pageNumber, index) => [
      pageNumber,
      index,
    ]),
  );

  return input.pages
    .filter((page) => isPrimaryCandidate(page, input.intent))
    .sort((left, right) => {
      const leftOrder = orderIndex.get(left.pageNumber) ?? left.pageNumber;
      const rightOrder = orderIndex.get(right.pageNumber) ?? right.pageNumber;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      return left.pageNumber - right.pageNumber;
    });
}

function isGlobalSupport(
  page: ClassifiedPlanPage,
  intent: FramingExtractionIntent,
): boolean {
  if (page.pageKind === "detail" || page.pageKind === "elevation") {
    return false;
  }
  if (hasContentRole(page, "detail") && !hasContentRole(page, "notes")) {
    return false;
  }

  const notesLike =
    page.pageKind === "notes" ||
    (page.pageKind === "mixed" && hasContentRole(page, "notes"));
  if (!notesLike) {
    return false;
  }

  if (
    page.scopeHints.includes("general") ||
    page.scopeHints.includes("structural") ||
    page.scopeHints.includes("framing") ||
    page.scopeHints.length === 0
  ) {
    return true;
  }
  return hintsOverlap(page.scopeHints, INTENT_SCOPE_HINTS[intent]);
}

function isSupportingSchedule(
  page: ClassifiedPlanPage,
  intent: FramingExtractionIntent,
): boolean {
  if (page.pageKind === "detail") {
    return false;
  }
  const scheduleLike =
    page.pageKind === "schedule" ||
    (page.pageKind === "mixed" && hasContentRole(page, "schedule"));
  if (!scheduleLike) {
    return false;
  }
  // Mixed notes+schedule sheets prefer global when notes dominate context.
  if (page.pageKind === "mixed" && hasContentRole(page, "notes")) {
    return false;
  }
  if (page.scopeHints.length === 0) {
    return true;
  }
  return hintsOverlap(page.scopeHints, INTENT_SCOPE_HINTS[intent]);
}

export interface IntentExtractionRoutingPlan {
  intent: FramingExtractionIntent;
  routingSafe: boolean;
  primaryPageNumbers: number[];
  sharedSupportAssignments: ExtractionPageRoleAssignment[];
  /** Flattened assignments: all primaries + shared supports (for diagnostics). */
  allAssignments: ExtractionPageRoleAssignment[] | null;
  excludedPageNumbers: number[];
  ambiguousPageNumbers: number[];
  routingNotes: string[];
}

/**
 * Plans extraction routing for an intent.
 *
 * Multiple valid primaries are NOT an error — they become sequential bundles
 * via buildSequentialExtractionPageBundles.
 */
export function planIntentExtractionRouting(input: {
  pages: readonly ClassifiedPlanPage[];
  intent: FramingExtractionIntent;
}): IntentExtractionRoutingPlan {
  const usable = input.pages.filter(
    (page) =>
      !page.needsVisualClassification &&
      page.pageKind !== "unknown" &&
      page.classificationMethod !== "unclassified",
  );

  const primaries = listPrimaryCandidatesForIntent({
    pages: usable,
    intent: input.intent,
  });

  const primaryNumbers = new Set(primaries.map((page) => page.pageNumber));
  const sharedSupportAssignments: ExtractionPageRoleAssignment[] = [];

  for (const page of usable) {
    if (primaryNumbers.has(page.pageNumber)) {
      continue;
    }
    if (!page.relevantToFraming && page.pageKind !== "mixed") {
      // Mixed with notes/schedules may still be framing-relevant via roles.
      if (
        !(
          hasContentRole(page, "notes") ||
          hasContentRole(page, "schedule")
        )
      ) {
        continue;
      }
    }
    if (isGlobalSupport(page, input.intent)) {
      sharedSupportAssignments.push({
        pageNumber: page.pageNumber,
        role: "global",
        reason: `Shared global notes/context for intent '${input.intent}' (contentRoles=${resolvedContentRoles(page).join(",") || "none"}).`,
      });
      continue;
    }
    if (isSupportingSchedule(page, input.intent)) {
      sharedSupportAssignments.push({
        pageNumber: page.pageNumber,
        role: "supporting",
        reason: `Shared supporting schedule for intent '${input.intent}'.`,
      });
    }
  }

  sharedSupportAssignments.sort((left, right) => {
    if (left.role !== right.role) {
      return left.role === "supporting" ? -1 : 1;
    }
    return left.pageNumber - right.pageNumber;
  });

  const ambiguousPageNumbers = input.pages
    .filter(
      (page) =>
        page.needsVisualClassification ||
        page.pageKind === "unknown" ||
        (page.pageKind === "mixed" &&
          resolvedContentRoles(page).length === 0) ||
        page.confidenceLabel === "low",
    )
    .map((page) => page.pageNumber);

  const assigned = new Set([
    ...primaries.map((page) => page.pageNumber),
    ...sharedSupportAssignments.map((assignment) => assignment.pageNumber),
  ]);
  const excludedPageNumbers = input.pages
    .map((page) => page.pageNumber)
    .filter((pageNumber) => !assigned.has(pageNumber));

  const routingNotes: string[] = [];
  if (primaries.length === 0) {
    routingNotes.push(
      "No primary plan-layout candidates for this intent — routing unsafe.",
    );
  } else if (primaries.length > 1) {
    routingNotes.push(
      `${primaries.length} primary candidates → sequential ExtractionPageBundles (one detailed primary each).`,
    );
  }

  const primaryAssignments: ExtractionPageRoleAssignment[] = primaries.map(
    (page) => ({
      pageNumber: page.pageNumber,
      role: "primary" as const,
      reason: `Primary ${page.pageKind} for intent '${input.intent}' (scopeHints=${page.scopeHints.join(",") || "none"}; contentRoles=${resolvedContentRoles(page).join(",") || "none"}).`,
    }),
  );

  const allAssignments =
    primaries.length === 0
      ? null
      : [...primaryAssignments, ...sharedSupportAssignments];

  return {
    intent: input.intent,
    routingSafe: primaries.length > 0,
    primaryPageNumbers: primaries.map((page) => page.pageNumber),
    sharedSupportAssignments,
    allAssignments,
    excludedPageNumbers,
    ambiguousPageNumbers,
    routingNotes,
  };
}

/**
 * Maps classified pages → role assignments for an intent.
 *
 * Multiple primaries are included (not fail-closed). Call
 * buildSequentialExtractionPageBundles to expand into N budgeted bundles.
 */
export function deriveRoleAssignmentsFromPageClassification(input: {
  pages: readonly ClassifiedPlanPage[];
  intent: FramingExtractionIntent;
}): ExtractionPageRoleAssignment[] | null {
  return planIntentExtractionRouting(input).allAssignments;
}

/**
 * Expands a routing plan into sequential bundles: one detailed primary each,
 * sharing the same support/global pages (budget-decomposed per primary).
 */
export function buildSequentialExtractionPageBundles(input: {
  planIndex: PlanIndex;
  scopeName: string;
  routingPlan: IntentExtractionRoutingPlan;
  maxImages?: number;
  tilesPerDetailedPage?: number;
}): ExtractionPageBundle[] {
  if (!input.routingPlan.routingSafe || !input.routingPlan.allAssignments) {
    throw new Error(
      `buildSequentialExtractionPageBundles: routing is not safe for intent '${input.routingPlan.intent}'.`,
    );
  }

  const bundles: ExtractionPageBundle[] = [];
  for (const primaryPageNumber of input.routingPlan.primaryPageNumbers) {
    const roleAssignments: ExtractionPageRoleAssignment[] = [
      {
        pageNumber: primaryPageNumber,
        role: "primary",
        reason: `Sequential primary page ${primaryPageNumber} for intent '${input.routingPlan.intent}'.`,
      },
      ...input.routingPlan.sharedSupportAssignments,
    ];
    const primaryBundles = buildExtractionPageBundles({
      planIndex: input.planIndex,
      scopeName: input.scopeName,
      intent: input.routingPlan.intent,
      roleAssignments,
      maxImages: input.maxImages,
      tilesPerDetailedPage: input.tilesPerDetailedPage,
    });
    for (const bundle of primaryBundles) {
      bundles.push({
        ...bundle,
        routingNotes: [
          ...bundle.routingNotes,
          `Multi-primary sequence: primary ${primaryPageNumber} of [${input.routingPlan.primaryPageNumbers.join(", ")}].`,
          ...input.routingPlan.routingNotes,
        ],
      });
    }
  }
  return bundles;
}

/**
 * Backward-compatible wrapper used by B1.3 tests / call sites that only had
 * coarse pageType fields.
 */
export function tryDeriveRoleAssignmentsFromClassification(input: {
  pages: Array<{
    pageNumber: number;
    pageType: string;
    relevantToFraming: boolean;
    pageKind?: string;
    scopeHints?: readonly PageScopeHint[];
    contentRoles?: readonly PageContentRole[];
    needsVisualClassification?: boolean;
  }>;
  intent: string;
}): ExtractionPageRoleAssignment[] | null {
  const mapped: ClassifiedPlanPage[] = input.pages.map((page) => {
    const pageKind =
      (page.pageKind as ClassifiedPlanPage["pageKind"] | undefined) ??
      (page.pageType === "plan"
        ? "plan"
        : page.pageType === "notes"
          ? "notes"
          : page.pageType === "schedule"
            ? "schedule"
            : page.pageType === "detail"
              ? "detail"
              : page.pageType === "cover"
                ? "cover"
                : "other");
    const contentRoles =
      page.contentRoles && page.contentRoles.length > 0
        ? [...page.contentRoles]
        : defaultContentRolesFromPageKind(pageKind);
    return {
      pageNumber: page.pageNumber,
      sheetId: null,
      label: null,
      pageKind,
      scopeHints: [...(page.scopeHints ?? [])],
      contentRoles,
      discipline: "other",
      pageType:
        page.pageType === "cover" ||
        page.pageType === "plan" ||
        page.pageType === "schedule" ||
        page.pageType === "notes" ||
        page.pageType === "detail"
          ? page.pageType
          : "other",
      relevantToFraming: page.relevantToFraming,
      needsVisualClassification: page.needsVisualClassification ?? false,
      classificationMethod: page.needsVisualClassification
        ? "visual-pending"
        : "text",
      titleOrLabel: null,
      evidenceText: null,
      classificationReason: "compat-wrapper",
      confidenceLabel: "medium",
    };
  });

  const intent = input.intent as FramingExtractionIntent;
  if (
    ![
      "wall-framing",
      "floor-framing",
      "roof-framing",
      "openings",
      "structural-members",
      "sheathing",
      "framing-general",
    ].includes(intent)
  ) {
    const relevant = mapped.filter((page) => page.relevantToFraming);
    const plans = relevant.filter((page) => pageHasPlanLayoutContent(page));
    if (plans.length === 0) {
      return null;
    }
    return deriveRoleAssignmentsFromPageClassification({
      pages: mapped.map((page) =>
        page.pageNumber === plans[0]!.pageNumber
          ? {
              ...page,
              scopeHints:
                page.scopeHints.length > 0 ? page.scopeHints : ["framing"],
            }
          : page,
      ),
      intent: "framing-general",
    });
  }

  return deriveRoleAssignmentsFromPageClassification({
    pages: mapped,
    intent,
  });
}
