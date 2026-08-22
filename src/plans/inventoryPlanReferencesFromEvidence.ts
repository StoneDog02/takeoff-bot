import type { Evidence } from "../core/schemas/evidence.schema.js";
import {
  planReferenceInventorySchema,
  planReferenceSchema,
  type PlanReference,
  type PlanReferenceInventory,
  type PlanReferenceStatus,
} from "./PlanReference.js";
import {
  isStructuredReferencePropertyPath,
  parsePlanReferenceLabel,
} from "./parsePlanReferenceLabel.js";
import {
  buildSheetIdentityIndex,
  resolveArchitecturalSheetToPage,
  type SheetIdentityIndex,
} from "./buildSheetIdentityIndex.js";
import type { PlanIndex } from "./PlanPage.js";
import type { ClassifiedPlanPage } from "./pageClassification.js";

function sanitizeIdPart(value: string): string {
  return value.replace(/[^A-Za-z0-9._:-]+/g, "-").replace(/^-+|-+$/g, "");
}

function candidateTexts(record: Evidence): string[] {
  const texts: string[] = [];
  if (
    isStructuredReferencePropertyPath(record.propertyPath) &&
    typeof record.candidateValue === "string"
  ) {
    texts.push(record.candidateValue);
  }
  if (record.originalText) {
    texts.push(record.originalText);
  }
  return texts;
}

function extractCandidateLabels(text: string): string[] {
  const labels: string[] = [];
  const patterns = [
    /(?:SEE\s+)?DETAILS?\s+\d+\s+THRU\s+\d+\s*\/\s*[A-Za-z]\d+(?:\.\d+)+/gi,
    /(?:SEE\s+)?DETAILS?\s+\d+\s*\/\s*[A-Za-z]\d+(?:\.\d+)+/gi,
    /SEE\s+\d+\s*\/\s*[A-Za-z]\d+(?:\.\d+)+/gi,
    /(?:SEE\s+)?(?:SCHEDULES?\s+ON\s+)?SHEET\s+[A-Za-z]\d+(?:\.\d+)+/gi,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      labels.push(match[0]!);
    }
  }
  return labels;
}

function navigationKey(ref: PlanReference): string {
  return [
    ref.targetSheetId ?? "",
    ref.detailNumber ?? "",
    ref.kind,
    ref.status,
  ].join("|");
}

/**
 * Inventories plan references from an Evidence graph without calling Claude.
 * Prefers structured detailReference/scheduleReference values; also scans
 * originalText for explicit SEE DETAIL / SHEET cues.
 */
export function inventoryPlanReferencesFromEvidence(input: {
  evidence: readonly Evidence[];
  planIndex: PlanIndex;
  classifiedPages?: readonly ClassifiedPlanPage[];
  sheetIdentityIndex?: SheetIdentityIndex;
}): PlanReferenceInventory {
  const sheetIndex =
    input.sheetIdentityIndex ??
    buildSheetIdentityIndex({
      planIndex: input.planIndex,
      classifiedPages: input.classifiedPages,
    });

  const discovered: PlanReference[] = [];
  let serial = 0;

  for (const record of input.evidence) {
    const labelSet = new Set<string>();
    for (const text of candidateTexts(record)) {
      if (isStructuredReferencePropertyPath(record.propertyPath)) {
        labelSet.add(text.trim());
      }
      for (const label of extractCandidateLabels(text)) {
        labelSet.add(label.trim());
      }
    }

    for (const label of labelSet) {
      const parsed = parsePlanReferenceLabel(label);
      if (parsed.status === "unresolved" && !parsed.targetSheetId) {
        continue;
      }

      serial += 1;
      let status: PlanReferenceStatus = parsed.status;
      let targetPageNumber: number | null = null;
      const notes = [...parsed.notes];

      if (parsed.targetSheetId && parsed.status !== "unresolved") {
        const resolution = resolveArchitecturalSheetToPage(
          parsed.targetSheetId,
          sheetIndex,
        );
        if (resolution.status === "resolved") {
          targetPageNumber = resolution.targetPageNumber;
          status = parsed.status === "ambiguous" ? "ambiguous" : "resolved";
        } else if (resolution.status === "ambiguous") {
          status = "ambiguous";
          notes.push(resolution.reason);
        } else {
          if (parsed.status === "parsed") {
            status = "parsed";
          }
          notes.push(resolution.reason);
        }
      }

      const id = sanitizeIdPart(
        `PREF-${serial}-${parsed.targetSheetId ?? "X"}-${parsed.detailNumber ?? "sheet"}`,
      );

      discovered.push(
        planReferenceSchema.parse({
          id,
          originalText: parsed.originalText,
          kind: parsed.kind,
          status,
          detailNumber: parsed.detailNumber,
          detailNumberFrom: parsed.detailNumberFrom,
          detailNumberTo: parsed.detailNumberTo,
          targetSheetId: parsed.targetSheetId,
          targetPageNumber,
          source: record.source,
          originatingEvidenceId: record.id,
          originatingSubjectKind: record.subjectKind,
          originatingSubjectKey: record.subjectKey,
          notes,
        }),
      );
    }
  }

  // Deduplicate navigation: same target sheet+detail+status keeps first
  // observation, but records additional originating subjects in notes.
  const byNav = new Map<string, PlanReference>();
  for (const ref of discovered) {
    const key = navigationKey(ref);
    const existing = byNav.get(key);
    if (!existing) {
      byNav.set(key, ref);
      continue;
    }
    const extra = `Also observed via ${ref.originatingSubjectKind}:${ref.originatingSubjectKey} (${ref.originatingEvidenceId}) on page ${ref.source.page.pageNumber}.`;
    byNav.set(
      key,
      planReferenceSchema.parse({
        ...existing,
        notes: [...existing.notes, extra],
      }),
    );
  }

  return planReferenceInventorySchema.parse({
    references: [...byNav.values()].sort((left, right) =>
      left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
    ),
  });
}
