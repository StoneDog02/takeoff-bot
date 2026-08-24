import { z } from "zod";

/**
 * What kind of construction-plan page this is.
 * Intrinsic to the page — not an extraction routing role.
 */
export const pageKindSchema = z.enum([
  "cover",
  "plan",
  "framing-plan",
  "notes",
  "schedule",
  "detail",
  "section",
  "elevation",
  "mixed",
  "other",
  "unknown",
]);

export type PageKind = z.infer<typeof pageKindSchema>;

/**
 * Soft scope hints for routing. A page may carry multiple hints.
 * Never treat these as takeoff facts.
 */
export const pageScopeHintSchema = z.enum([
  "framing",
  "wall",
  "floor",
  "roof",
  "structural",
  "openings",
  "architectural",
  "general",
]);

export type PageScopeHint = z.infer<typeof pageScopeHintSchema>;

/**
 * Affirmative content roles visible on the page. Required for safe mixed-page
 * routing: pageKind=mixed alone must not imply primary vs support.
 */
export const pageContentRoleSchema = z.enum([
  "plan-layout",
  "notes",
  "schedule",
  "detail",
  "index",
  "elevation",
  "section",
  "other",
]);

export type PageContentRole = z.infer<typeof pageContentRoleSchema>;

export const pageClassificationMethodSchema = z.enum([
  /** Classified from usable text-layer content. */
  "text",
  /** Classified from semantic sheet label / title metadata (not opaque outline codes). */
  "label-metadata",
  /** Visual-only; queued for a future structured visual classification pass. */
  "visual-pending",
  /** Filled by validated visual classifier output. */
  "visual",
  /** No usable signal yet. */
  "unclassified",
]);

export type PageClassificationMethod = z.infer<
  typeof pageClassificationMethodSchema
>;

/**
 * Coarse compatibility projection used by older Stage 5 selection paths.
 * Derived from pageKind — not an independent classifier output.
 */
export const legacyPageTypeSchema = z.enum([
  "cover",
  "plan",
  "schedule",
  "notes",
  "detail",
  "other",
]);

export type LegacyPageType = z.infer<typeof legacyPageTypeSchema>;

export const pageClassificationConfidenceSchema = z.enum([
  "high",
  "medium",
  "low",
]);

export type PageClassificationConfidence = z.infer<
  typeof pageClassificationConfidenceSchema
>;

export const classifiedPlanPageSchema = z.object({
  pageNumber: z.number().int().positive(),
  sheetId: z.string().trim().min(1).nullable(),
  label: z.string().trim().min(1).nullable(),
  pageKind: pageKindSchema,
  scopeHints: z.array(pageScopeHintSchema).default([]),
  /**
   * Structured content roles. For pageKind=mixed this is the authority that
   * distinguishes plan-layout primaries from notes/schedule support pages.
   */
  contentRoles: z.array(pageContentRoleSchema).default([]),
  discipline: z.enum(["architectural", "structural", "other"]),
  /** Coarse projection of pageKind for backward-compatible consumers. */
  pageType: legacyPageTypeSchema,
  relevantToFraming: z.boolean(),
  needsVisualClassification: z.boolean(),
  classificationMethod: pageClassificationMethodSchema,
  titleOrLabel: z.string().trim().min(1).nullable().default(null),
  evidenceText: z.string().trim().min(1).nullable().default(null),
  classificationReason: z.string().trim().min(1),
  confidenceLabel: pageClassificationConfidenceSchema.nullable().default(null),
});

export type ClassifiedPlanPage = z.infer<typeof classifiedPlanPageSchema>;

/**
 * Default content roles inferred from a non-mixed pageKind.
 * Mixed pages must supply contentRoles explicitly — empty defaults exclude
 * them from primary/support routing until structured roles exist.
 */
export function defaultContentRolesFromPageKind(
  pageKind: PageKind,
): PageContentRole[] {
  switch (pageKind) {
    case "plan":
    case "framing-plan":
      return ["plan-layout"];
    case "notes":
      return ["notes"];
    case "schedule":
      return ["schedule"];
    case "detail":
      return ["detail"];
    case "elevation":
      return ["elevation"];
    case "section":
      return ["section"];
    case "cover":
      return ["index"];
    case "mixed":
    case "other":
    case "unknown":
      return [];
    default: {
      const _exhaustive: never = pageKind;
      return _exhaustive;
    }
  }
}

/**
 * When live visual classification omits contentRoles on mixed pages, infer roles
 * from title/evidence text so extraction routing can attach global schedules/notes
 * and recognize embedded plan layouts (e.g. roof layout on a mixed sheet).
 */
export function inferContentRolesFromVisualEvidence(input: {
  pageKind: PageKind;
  contentRoles: readonly PageContentRole[];
  titleOrLabel: string | null;
  evidenceText: string;
}): PageContentRole[] {
  if (input.contentRoles.length > 0) {
    return [...input.contentRoles];
  }
  const defaults = defaultContentRolesFromPageKind(input.pageKind);
  if (input.pageKind !== "mixed" || defaults.length > 0) {
    return defaults;
  }

  const text = `${input.titleOrLabel ?? ""}\n${input.evidenceText}`.toUpperCase();
  const roles = new Set<PageContentRole>();

  if (
    /\b(PLAN|LAYOUT|FLOOR PLAN|FRAMING PLAN|FOUNDATION PLAN|CRAWL SPACE)\b/.test(
      text,
    )
  ) {
    roles.add("plan-layout");
  }
  if (/\b(SCHEDULE|SCHEDULES)\b/.test(text)) {
    roles.add("schedule");
  }
  if (/\b(NOTES|GENERAL STRUCTURAL)\b/.test(text)) {
    roles.add("notes");
  }
  if (/\bINDEX\b/.test(text)) {
    roles.add("index");
  }
  if (/\bDETAIL\b/.test(text) && !roles.has("plan-layout")) {
    roles.add("detail");
  }

  return [...roles];
}

export function legacyPageTypeFromPageKind(pageKind: PageKind): LegacyPageType {
  switch (pageKind) {
    case "cover":
      return "cover";
    case "plan":
    case "framing-plan":
      return "plan";
    case "schedule":
      return "schedule";
    case "notes":
      return "notes";
    case "detail":
      return "detail";
    case "section":
    case "elevation":
    case "mixed":
    case "other":
    case "unknown":
      return "other";
    default: {
      const _exhaustive: never = pageKind;
      return _exhaustive;
    }
  }
}

export function disciplineFromSignals(input: {
  sheetId: string | null;
  text: string;
  scopeHints: readonly PageScopeHint[];
}): "architectural" | "structural" | "other" {
  const sheet = input.sheetId?.trim().toUpperCase() ?? "";
  if (/^S[\d.-]/i.test(sheet) || sheet.startsWith("S")) {
    return "structural";
  }
  if (/^A[\d.-]/i.test(sheet) || sheet.startsWith("A")) {
    return "architectural";
  }
  if (input.scopeHints.includes("structural")) {
    return "structural";
  }
  if (
    input.scopeHints.includes("architectural") ||
    input.scopeHints.includes("openings")
  ) {
    return "architectural";
  }
  const lower = input.text.toLowerCase();
  if (/\bstructural\b|\bframing notes\b|\bbeam schedule\b/.test(lower)) {
    return "structural";
  }
  if (/\barchitectural\b|\bfloor plan\b|\bdoor schedule\b/.test(lower)) {
    return "architectural";
  }
  return "other";
}

export function isRelevantToFraming(input: {
  pageKind: PageKind;
  scopeHints: readonly PageScopeHint[];
}): boolean {
  if (input.pageKind === "cover") {
    return false;
  }
  if (
    input.scopeHints.some((hint) =>
      ["framing", "wall", "floor", "roof", "structural", "openings"].includes(
        hint,
      ),
    )
  ) {
    return true;
  }
  if (input.pageKind === "unknown" || input.pageKind === "other") {
    // No scope signal and no known sheet kind — do not dump into Stage 5.
    return false;
  }
  return [
    "plan",
    "framing-plan",
    "notes",
    "schedule",
    "detail",
    "section",
    "mixed",
  ].includes(input.pageKind);
}
