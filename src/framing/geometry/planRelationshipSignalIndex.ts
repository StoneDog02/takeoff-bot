import type { Evidence } from "../../core/schemas/evidence.schema.js";
import type { EvidenceId } from "../../core/schemas/identity.schema.js";
import type { ClassifiedPlanPage } from "../../pdf/pageClassification.js";
import {
  type IndexedSignal,
  type RegionIdentity,
  type SheetRoleSignal,
  REGION_VOCABULARY_TOKENS,
} from "./constructionSemanticTypes.js";
import {
  isApcOriginalText,
  isApcPropertyPath,
} from "./assemblyFingerprint.js";

const FLOOR_PLAN_TITLE_PATTERN = /floor|crawl|foundation|joist/i;

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueSortedIds(ids: readonly string[]): EvidenceId[] {
  return [...new Set(ids)].sort(compareIds) as EvidenceId[];
}

function evidencePageNumber(record: Evidence): number | null {
  return record.source?.page?.pageNumber ?? null;
}

export function extractRegionTokens(text: string): string[] {
  const upper = text.toUpperCase();
  const found: string[] = [];
  for (const token of REGION_VOCABULARY_TOKENS) {
    if (upper.includes(token)) {
      found.push(token);
    }
  }
  return [...new Set(found)].sort(compareIds);
}

export function regionIdentityKey(tokens: readonly string[]): string {
  return [...tokens].sort(compareIds).join("+");
}

function isSheetRolePage(page: ClassifiedPlanPage): boolean {
  const hasPlanLayoutRole = page.contentRoles?.includes("plan-layout") ?? false;
  const isFramingPlan = page.pageKind === "framing-plan";
  const titleMatches =
    page.titleOrLabel != null && FLOOR_PLAN_TITLE_PATTERN.test(page.titleOrLabel);
  return (isFramingPlan || hasPlanLayoutRole) && titleMatches;
}

export function buildSheetRoleSignals(
  pages: readonly ClassifiedPlanPage[],
): SheetRoleSignal[] {
  const signals: SheetRoleSignal[] = [];
  for (const page of pages) {
    if (!isSheetRolePage(page)) {
      continue;
    }
    signals.push({
      pageNumber: page.pageNumber,
      titleOrLabel: page.titleOrLabel ?? "",
      pageKind: page.pageKind,
      evidenceIds: [],
    });
  }
  return signals;
}

function collectTextFromAreaRecord(record: Evidence): string {
  const parts = [
    record.subjectKey,
    record.source?.elementLabel ?? "",
    typeof record.candidateValue === "string" ? record.candidateValue : "",
    record.originalText ?? "",
  ];
  return parts.join(" ");
}

function isRegionLabelRecord(record: Evidence): boolean {
  if (record.subjectKind !== "floor-framing-area") {
    return false;
  }
  const text = collectTextFromAreaRecord(record);
  return extractRegionTokens(text).length > 0;
}

function isApcRecord(record: Evidence): boolean {
  if (record.subjectKind !== "floor-framing-system") {
    return false;
  }
  if (isApcPropertyPath(record.propertyPath)) {
    return true;
  }
  return isApcOriginalText(record.originalText ?? "");
}

function isSpanCorroborationRecord(record: Evidence): boolean {
  if (record.subjectKind !== "floor-framing-area") {
    return false;
  }
  return (
    record.propertyPath === "joistMemberLengthFeet" ||
    /max\.?\s*span/i.test(record.originalText ?? "")
  );
}

export type PlanRelationshipSignalIndex = {
  sheetRoles: readonly SheetRoleSignal[];
  regionIdentities: readonly RegionIdentity[];
  signals: readonly IndexedSignal[];
};

export function buildPlanRelationshipSignalIndex(input: {
  evidence: readonly Evidence[];
  classifiedPages: readonly ClassifiedPlanPage[];
}): PlanRelationshipSignalIndex {
  const sheetRoles = buildSheetRoleSignals(input.classifiedPages);
  const sheetRolePages = new Set(sheetRoles.map((signal) => signal.pageNumber));

  const regionMap = new Map<string, RegionIdentity>();
  const indexedSignals: IndexedSignal[] = [];

  for (const page of sheetRoles) {
    indexedSignals.push({
      id: "SR",
      pageNumber: page.pageNumber,
      subjectKey: null,
      subjectKind: null,
      evidenceIds: [],
      tileId: null,
      originalText: page.titleOrLabel,
    });
  }

  for (const record of input.evidence) {
    const pageNumber = evidencePageNumber(record);
    if (pageNumber == null || !sheetRolePages.has(pageNumber)) {
      continue;
    }

    if (isRegionLabelRecord(record)) {
      const text = collectTextFromAreaRecord(record);
      const tokens = extractRegionTokens(text);
      const key = `${pageNumber}:${regionIdentityKey(tokens)}`;
      const label =
        record.source?.elementLabel?.trim() ||
        (tokens.length > 0 ? tokens.join(" ") : record.subjectKey);

      const existing = regionMap.get(key);
      const entry: RegionIdentity = existing ?? {
        tokens,
        label,
        pageNumber,
        evidenceIds: [],
      };
      entry.evidenceIds = uniqueSortedIds([...entry.evidenceIds, record.id]);
      regionMap.set(key, entry);

      indexedSignals.push({
        id: "RL",
        pageNumber,
        subjectKey: record.subjectKey,
        subjectKind: record.subjectKind,
        evidenceIds: [record.id],
        tileId: record.source?.tileId ?? null,
        originalText: record.originalText ?? null,
      });
    }

    if (isApcRecord(record)) {
      indexedSignals.push({
        id: "APC",
        pageNumber,
        subjectKey: record.subjectKey,
        subjectKind: record.subjectKind,
        evidenceIds: [record.id],
        tileId: record.source?.tileId ?? null,
        originalText: record.originalText ?? null,
      });
    }

    if (isSpanCorroborationRecord(record)) {
      indexedSignals.push({
        id: "SL",
        pageNumber,
        subjectKey: record.subjectKey,
        subjectKind: record.subjectKind,
        evidenceIds: [record.id],
        tileId: record.source?.tileId ?? null,
        originalText: record.originalText ?? null,
      });
    }

    if (
      record.subjectKind === "floor-framing-area" &&
      record.source?.region != null
    ) {
      indexedSignals.push({
        id: "RB",
        pageNumber,
        subjectKey: record.subjectKey,
        subjectKind: record.subjectKind,
        evidenceIds: [record.id],
        tileId: record.source?.tileId ?? null,
        originalText: record.originalText ?? null,
      });
    }
  }

  return {
    sheetRoles,
    regionIdentities: [...regionMap.values()].sort(
      (left, right) =>
        left.pageNumber - right.pageNumber ||
        compareIds(left.label, right.label),
    ),
    signals: indexedSignals,
  };
}

export function sheetRoleForPage(
  index: PlanRelationshipSignalIndex,
  pageNumber: number,
): SheetRoleSignal | null {
  return index.sheetRoles.find((signal) => signal.pageNumber === pageNumber) ?? null;
}

export function regionIdentitiesForPage(
  index: PlanRelationshipSignalIndex,
  pageNumber: number,
): RegionIdentity[] {
  return index.regionIdentities.filter((region) => region.pageNumber === pageNumber);
}

export function signalsForPageAndGroup(
  index: PlanRelationshipSignalIndex,
  pageNumber: number,
  group: IndexedSignal["id"],
): IndexedSignal[] {
  return index.signals.filter(
    (signal) => signal.pageNumber === pageNumber && signal.id === group,
  );
}
