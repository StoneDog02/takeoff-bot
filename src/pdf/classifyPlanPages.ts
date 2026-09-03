import type { PlanIndex, PlanPage } from "./PlanPage.js";
import { pageNeedsVisual } from "./pageNeedsVisual.js";
import {
  classifiedPlanPageSchema,
  defaultContentRolesFromPageKind,
  disciplineFromSignals,
  isRelevantToFraming,
  legacyPageTypeFromPageKind,
  type ClassifiedPlanPage,
  type PageKind,
  type PageScopeHint,
} from "./pageClassification.js";

/**
 * Opaque DataCAD-style outline codes (e.g. "11", "21") are identity only.
 * They must never be interpreted as semantic page titles.
 */
export function isOpaqueOutlineIdentity(value: string | null | undefined): boolean {
  if (value == null) {
    return true;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return true;
  }
  return /^\d{1,4}$/.test(trimmed);
}

function hasSemanticLabel(value: string | null | undefined): boolean {
  if (value == null || isOpaqueOutlineIdentity(value)) {
    return false;
  }
  // Sheet IDs like A2.01 / S1.01 alone are weak; require at least one letter word
  // beyond a single discipline letter+digits pattern, OR embedded keywords.
  const lower = value.toLowerCase();
  if (
    /\b(plan|notes?|schedule|detail|section|elevation|cover|framing|roof|floor|wall)\b/.test(
      lower,
    )
  ) {
    return true;
  }
  // Multi-token titles
  return /[a-z]{3,}/i.test(value) && /\s/.test(value.trim());
}

function collectScopeHints(text: string): PageScopeHint[] {
  const lower = text.toLowerCase();
  const hints = new Set<PageScopeHint>();

  if (/\bframing\b|\bstud\b|\bjoist\b|\brafter\b|\bheader\b|\bsheath/.test(lower)) {
    hints.add("framing");
  }
  if (/\bwall\b|\bstud wall\b|\bpartition\b/.test(lower)) {
    hints.add("wall");
  }
  if (/\bfloor framing\b|\bjoist\b|\bfloor plan\b|\blevel\s*\d/.test(lower)) {
    hints.add("floor");
  }
  if (/\broof\b|\brafter\b|\btruss\b|\bgable\b/.test(lower)) {
    hints.add("roof");
  }
  if (/\bstructural\b|\bbeam\b|\bpost\b|\bcolumn\b|\bholding\b/.test(lower)) {
    hints.add("structural");
  }
  if (/\bdoor\b|\bwindow\b|\bopening\b|\bheader schedule\b/.test(lower)) {
    hints.add("openings");
  }
  if (/\barchitectural\b|\bfloor plan\b|\belevation\b/.test(lower)) {
    hints.add("architectural");
  }
  if (/\bgeneral notes\b|\btypical notes\b|\bproject notes\b/.test(lower)) {
    hints.add("general");
  }

  return [...hints];
}

function detectPageKind(text: string): {
  pageKind: PageKind;
  reason: string;
  confidence: "high" | "medium" | "low";
} {
  const lower = text.toLowerCase();

  const hits: Array<{ kind: PageKind; weight: number; reason: string }> = [];

  if (/\b(cover sheet|title sheet|project data|sheet index)\b/.test(lower)) {
    hits.push({ kind: "cover", weight: 3, reason: "cover/title sheet language" });
  }
  if (/\b(roof framing plan|floor framing plan|framing plan)\b/.test(lower)) {
    hits.push({
      kind: "framing-plan",
      weight: 4,
      reason: "explicit framing plan language",
    });
  }
  if (/\b(floor plan|site plan|foundation plan|roof plan)\b/.test(lower)) {
    hits.push({ kind: "plan", weight: 3, reason: "plan sheet language" });
  }
  if (/\b(schedule)\b/.test(lower)) {
    hits.push({ kind: "schedule", weight: 3, reason: "schedule language" });
  }
  if (/\b(general notes|framing notes|structural notes|notes)\b/.test(lower)) {
    hits.push({ kind: "notes", weight: 2, reason: "notes language" });
  }
  if (/\b(detail|details)\b/.test(lower)) {
    hits.push({ kind: "detail", weight: 2, reason: "detail language" });
  }
  if (/\b(section)\b/.test(lower)) {
    hits.push({ kind: "section", weight: 2, reason: "section language" });
  }
  if (/\b(elevation)\b/.test(lower)) {
    hits.push({ kind: "elevation", weight: 2, reason: "elevation language" });
  }

  if (hits.length === 0) {
    return {
      pageKind: "unknown",
      reason: "No reliable page-kind keywords found.",
      confidence: "low",
    };
  }

  hits.sort((left, right) => right.weight - left.weight);
  const top = hits[0]!;
  const second = hits[1];
  if (second && second.weight === top.weight && second.kind !== top.kind) {
    return {
      pageKind: "mixed",
      reason: `Ambiguous signals for ${top.kind} and ${second.kind}.`,
      confidence: "low",
    };
  }

  return {
    pageKind: top.kind,
    reason: top.reason,
    confidence: top.weight >= 3 ? "high" : "medium",
  };
}

function classifyFromCorpus(input: {
  page: PlanPage;
  corpus: string;
  method: "text" | "label-metadata";
}): ClassifiedPlanPage {
  const detected = detectPageKind(input.corpus);
  const scopeHints = collectScopeHints(input.corpus);
  const pageKind = detected.pageKind;
  const titleOrLabel =
    hasSemanticLabel(input.page.label)
      ? input.page.label
      : hasSemanticLabel(input.page.sheetId)
        ? input.page.sheetId
        : null;

  const evidenceText =
    input.method === "text"
      ? input.corpus.slice(0, 240).trim() || null
      : titleOrLabel;

  const record = {
    pageNumber: input.page.pageNumber,
    sheetId: input.page.sheetId,
    label: input.page.label,
    pageKind,
    scopeHints,
    contentRoles: defaultContentRolesFromPageKind(pageKind),
    discipline: disciplineFromSignals({
      sheetId: input.page.sheetId,
      text: input.corpus,
      scopeHints,
    }),
    pageType: legacyPageTypeFromPageKind(pageKind),
    relevantToFraming: isRelevantToFraming({ pageKind, scopeHints }),
    needsVisualClassification: false,
    classificationMethod: input.method,
    titleOrLabel,
    evidenceText,
    classificationReason: detected.reason,
    confidenceLabel: detected.confidence,
  };

  return classifiedPlanPageSchema.parse(record);
}

function unclassifiedVisualPending(page: PlanPage): ClassifiedPlanPage {
  return classifiedPlanPageSchema.parse({
    pageNumber: page.pageNumber,
    sheetId: page.sheetId,
    label: page.label,
    pageKind: "unknown",
    scopeHints: [],
    contentRoles: [],
    discipline: disciplineFromSignals({
      sheetId: isOpaqueOutlineIdentity(page.sheetId) ? null : page.sheetId,
      text: "",
      scopeHints: [],
    }),
    pageType: "other",
    relevantToFraming: false,
    needsVisualClassification: true,
    classificationMethod: "visual-pending",
    titleOrLabel: null,
    evidenceText: null,
    classificationReason:
      "No usable text layer and no semantic sheet label; visual classification required.",
    confidenceLabel: null,
  });
}

/**
 * Deterministic page classification for routing prep.
 *
 * - Text-rich pages: classify from text (and semantic labels).
 * - Semantic label-only pages: classify from label metadata.
 * - Visual-only / opaque-outline pages: mark visual-pending; do NOT invent roles
 *   from outline codes such as "21".
 */
export function classifyPlanPagesDeterministically(
  planIndex: PlanIndex,
): ClassifiedPlanPage[] {
  return [...planIndex.pages]
    .sort((left, right) => left.pageNumber - right.pageNumber)
    .map((page) => {
      const text = page.textContent.trim();
      if (text.length > 0) {
        const labelBoost =
          hasSemanticLabel(page.label) || hasSemanticLabel(page.sheetId)
            ? `\n${page.label ?? ""}\n${page.sheetId ?? ""}`
            : "";
        return classifyFromCorpus({
          page,
          corpus: `${text}${labelBoost}`,
          method: "text",
        });
      }

      if (hasSemanticLabel(page.label) || hasSemanticLabel(page.sheetId)) {
        const corpus = [page.label, page.sheetId].filter(Boolean).join("\n");
        return classifyFromCorpus({
          page,
          corpus,
          method: "label-metadata",
        });
      }

      // Visual-only empty text, or text empty with opaque outline identity only.
      if (pageNeedsVisual(page) || isOpaqueOutlineIdentity(page.label)) {
        return unclassifiedVisualPending(page);
      }

      return unclassifiedVisualPending(page);
    });
}
