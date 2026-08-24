import type { Evidence } from "../../../core/schemas/evidence.schema.js";
import type { EvidenceId } from "../../../core/schemas/identity.schema.js";
import type { PropertyResolutionTrace } from "../../../core/schemas/resolved-object.schema.js";
import type { StructuralMember } from "../schemas/structural-member.schema.js";

export const SCHEDULE_MARK_SIZE_PREFERENCE_MARKER =
  "Prefer schedule dimensional size over schedule-mark-as-size";

export const SINGLE_OCCURRENCE_QUANTITY_MARKER =
  "Explicit single-occurrence quantity established";

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueSortedIds(ids: readonly string[]): EvidenceId[] {
  return [...new Set(ids)].sort(compareIds) as EvidenceId[];
}

function normalizeMarkToken(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * True when a size candidate is only the schedule mark / subject key, not a
 * dimensional member size (e.g. "WB2-11.88LVL" vs "(2)-1.75\"x11.875\"").
 */
export function isScheduleMarkAsSize(
  sizeValue: string,
  subjectKey: string,
): boolean {
  const sizeToken = normalizeMarkToken(sizeValue);
  const subjectToken = normalizeMarkToken(subjectKey);
  if (sizeToken.length === 0 || subjectToken.length === 0) {
    return false;
  }

  if (sizeToken === subjectToken) {
    return true;
  }

  // Subject keys sometimes omit spaces/punctuation already present in marks.
  return (
    sizeToken === subjectToken.replace(/^SM/, "") ||
    subjectToken.endsWith(sizeToken) ||
    sizeToken.endsWith(subjectToken)
  );
}

const DIMENSIONAL_SIZE_PATTERN =
  /(\d\s*[x×]\s*\d)|(\(\s*\d+\s*\)-\s*\d)|(\d+\s*\/\s*\d+\s*")|(\d+\s*["'])/i;

export function looksLikeDimensionalMemberSize(sizeValue: string): boolean {
  const trimmed = sizeValue.trim();
  if (trimmed.length === 0) {
    return false;
  }

  return DIMENSIONAL_SIZE_PATTERN.test(trimmed);
}

function createTrace(
  propertyPath: string,
  method: PropertyResolutionTrace["method"],
  explanation: string,
  evidenceIds: readonly EvidenceId[],
): PropertyResolutionTrace {
  return {
    propertyPath,
    method,
    explanation,
    evidenceIds: uniqueSortedIds(evidenceIds),
    assumptionIds: [],
    userDecisionIds: [],
    validationIssueIds: [],
    reviewItemIds: [],
  };
}

export type SizeConflictResolution = {
  size: string;
  evidenceIds: EvidenceId[];
  explanation: string;
} | null;

/**
 * When size candidates conflict because one is the schedule mark and another is
 * a dimensional schedule size, prefer the dimensional size.
 */
export function resolveDimensionalSizeOverScheduleMark(
  subjectKey: string,
  sizeRecords: readonly Evidence[],
): SizeConflictResolution {
  const usable: Array<{ value: string; id: EvidenceId }> = [];

  for (const record of sizeRecords) {
    if (record.propertyPath !== "size") {
      continue;
    }

    if (typeof record.candidateValue !== "string") {
      continue;
    }

    const value = record.candidateValue.trim();
    if (value.length === 0) {
      continue;
    }

    usable.push({ value, id: record.id });
  }

  if (usable.length < 2) {
    return null;
  }

  const dimensional = usable.filter((entry) =>
    looksLikeDimensionalMemberSize(entry.value) &&
    !isScheduleMarkAsSize(entry.value, subjectKey),
  );
  const markOnly = usable.filter((entry) =>
    isScheduleMarkAsSize(entry.value, subjectKey),
  );

  if (dimensional.length === 0 || markOnly.length === 0) {
    return null;
  }

  const distinctDimensional = new Map<string, EvidenceId[]>();
  for (const entry of dimensional) {
    const key = entry.value.toLowerCase();
    const existing = distinctDimensional.get(key);
    if (existing) {
      existing.push(entry.id);
    } else {
      distinctDimensional.set(key, [entry.id]);
    }
  }

  if (distinctDimensional.size !== 1) {
    return null;
  }

  const [value, evidenceIds] = [...distinctDimensional.entries()][0]!;
  const resolvedValue = dimensional.find(
    (entry) => entry.value.toLowerCase() === value,
  )!.value;

  return {
    size: resolvedValue,
    evidenceIds: uniqueSortedIds(evidenceIds),
    explanation: `${SCHEDULE_MARK_SIZE_PREFERENCE_MARKER}: discarded mark-as-size candidates (${markOnly
      .map((entry) => entry.value)
      .join(", ")}) in favor of schedule dimensional size "${resolvedValue}".`,
  };
}

export type SingleOccurrenceQuantityResolution = {
  quantity: 1;
  evidenceIds: EvidenceId[];
  explanation: string;
} | null;

/**
 * When a named structural member has resolved length from an explicit placement
 * callout and no quantity evidence, establish occurrence count = 1 for this
 * Structural Member object (not by counting repeated symbols across the plan).
 */
export function resolveExplicitSingleOccurrenceQuantity(
  records: readonly Evidence[],
  lengthFeet: number | null,
  quantity: number | null,
): SingleOccurrenceQuantityResolution {
  if (quantity !== null || lengthFeet === null || lengthFeet <= 0) {
    return null;
  }

  const quantityRecords = records.filter(
    (record) => record.propertyPath === "quantity",
  );
  if (quantityRecords.length > 0) {
    return null;
  }

  const lengthRecords = records.filter(
    (record) => record.propertyPath === "lengthFeet",
  );
  if (lengthRecords.length === 0) {
    return null;
  }

  const placementLengthRecords = lengthRecords.filter((record) =>
    lengthEvidenceLooksLikeExplicitPlacement(record),
  );
  if (placementLengthRecords.length === 0) {
    return null;
  }

  const distinctLengths = new Set(
    placementLengthRecords
      .map((record) => record.candidateValue)
      .filter((value): value is number => typeof value === "number" && value > 0),
  );
  if (distinctLengths.size !== 1) {
    return null;
  }

  return {
    quantity: 1,
    evidenceIds: uniqueSortedIds(
      placementLengthRecords.map((record) => record.id),
    ),
    explanation: `${SINGLE_OCCURRENCE_QUANTITY_MARKER}: Structural Member object represents one named placement with resolved lengthFeet=${lengthFeet}; no competing quantity evidence.`,
  };
}

function lengthEvidenceLooksLikeExplicitPlacement(record: Evidence): boolean {
  const text = `${record.originalText ?? ""}\n${record.description}`;
  return /\bLONG\b|\bx\s*\d+\s*['\-]|OCCURRENCE|PLACEMENT\s+CALLOUT/i.test(
    text,
  );
}

export function applyStructuralMemberAuthority(
  subjectKey: string,
  member: StructuralMember,
  records: readonly Evidence[],
): StructuralMember {
  let next: StructuralMember = member;
  const traces = [...member.resolutionTraces];

  if (next.size === null) {
    const sizeResolution = resolveDimensionalSizeOverScheduleMark(
      subjectKey,
      records,
    );
    if (sizeResolution) {
      // Drop the prior conflict unresolved trace so calculators see size as resolved.
      const withoutUnresolvedSize = traces.filter(
        (trace) =>
          !(
            trace.propertyPath === "size" &&
            trace.method === "unresolved"
          ),
      );
      withoutUnresolvedSize.push(
        createTrace(
          "size",
          "supported-inference",
          sizeResolution.explanation,
          sizeResolution.evidenceIds,
        ),
      );
      next = {
        ...next,
        size: sizeResolution.size,
        resolutionTraces: withoutUnresolvedSize,
      };
      traces.length = 0;
      traces.push(...withoutUnresolvedSize);
    }
  }

  const quantityResolution = resolveExplicitSingleOccurrenceQuantity(
    records,
    next.lengthFeet,
    next.quantity,
  );
  if (quantityResolution) {
    traces.push(
      createTrace(
        "quantity",
        "supported-inference",
        quantityResolution.explanation,
        quantityResolution.evidenceIds,
      ),
    );
    next = {
      ...next,
      quantity: quantityResolution.quantity,
      resolutionTraces: [...traces],
    };
  }

  if (
    next.size === member.size &&
    next.quantity === member.quantity &&
    traces.length === member.resolutionTraces.length
  ) {
    return member;
  }

  const completionPaths = [
    "category",
    "materialType",
    "size",
    "lengthFeet",
    "quantity",
    "location",
  ] as const;
  const resolvedCount = completionPaths.filter((propertyPath) => {
    const value = next[propertyPath];
    return value !== null && value !== "unknown";
  }).length;

  return {
    ...next,
    resolutionTraces: traces,
    completion: {
      status:
        resolvedCount === 0
          ? "not-started"
          : resolvedCount === completionPaths.length
            ? "complete"
            : "partial",
      percentage: (resolvedCount / completionPaths.length) * 100,
      completedItems: resolvedCount,
      totalItems: completionPaths.length,
    },
  };
}
