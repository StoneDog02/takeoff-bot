import type { Evidence } from "../../../core/schemas/evidence.schema.js";
import type { EvidenceId } from "../../../core/schemas/identity.schema.js";
import type { PropertyResolutionTrace } from "../../../core/schemas/resolved-object.schema.js";
import type { StructuralMember } from "../schemas/structural-member.schema.js";

export const SCHEDULE_MARK_SIZE_PREFERENCE_MARKER =
  "Prefer schedule dimensional size over schedule-mark-as-size";

export const NOTATION_EQUIVALENT_SIZE_MARKER =
  "Notation-equivalent dimensional sizes converged";

export const SINGLE_OCCURRENCE_QUANTITY_MARKER =
  "Explicit single-occurrence quantity established";

export const BEAM_HEADER_CATEGORY_SYNONYM_MARKER =
  "Wood-beam schedule category beam|header synonyms converged";

/** Exact thousandths of an inch — avoids float drift in equivalence. */
export type MilliInches = number;

export type CanonicalDimensionalMemberSize = {
  plyCount: number | null;
  widthMilli: MilliInches;
  heightMilli: MilliInches;
};

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

  if (parseCanonicalDimensionalMemberSize(trimmed) !== null) {
    return true;
  }

  return DIMENSIONAL_SIZE_PATTERN.test(trimmed);
}

const MATERIAL_SUFFIX_PATTERN =
  /(?:\s+|\b)(?:LVL|PSL|LSL|GLULAM|GLU-LAM|DF|DF#2|DOUGLAS\s*FIR(?:-LARCH)?|SYP|SPF|HEM-?FIR|I-?JOIST|OSB|PLYWOOD)\s*$/i;

/**
 * Parse a single length token into exact milli-inches.
 * Supports decimals (1.75), mixed fractions (1-3/4), and construction
 * dot-fraction notation (1.3/4 = 1 + 3/4).
 */
export function parseInchMeasureToMilli(token: string): MilliInches | null {
  const trimmedQuotes = token.trim().replace(/["']/g, "").trim();
  if (trimmedQuotes.length === 0) {
    return null;
  }

  // whole numer/denom with space  e.g. 1 3/4, 11 7/8
  // Must run before whitespace stripping — otherwise "1 3/4" becomes "13/4".
  const spaceMixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(trimmedQuotes);
  if (spaceMixed) {
    const whole = Number(spaceMixed[1]);
    const numer = Number(spaceMixed[2]);
    const denom = Number(spaceMixed[3]);
    if (denom <= 0) {
      return null;
    }
    return Math.round(((whole * denom + numer) * 1000) / denom);
  }

  const raw = trimmedQuotes.replace(/\s+/g, "");
  if (raw.length === 0) {
    return null;
  }

  // whole.numer/denom  e.g. 1.3/4, 11.7/8
  const dotFraction = /^(\d+)\.(\d+)\/(\d+)$/.exec(raw);
  if (dotFraction) {
    const whole = Number(dotFraction[1]);
    const numer = Number(dotFraction[2]);
    const denom = Number(dotFraction[3]);
    if (denom <= 0 || !Number.isInteger(whole + numer + denom)) {
      return null;
    }
    return Math.round(((whole * denom + numer) * 1000) / denom);
  }

  // whole-numer/denom  e.g. 1-3/4, 11-7/8
  const mixed = /^(\d+)-(\d+)\/(\d+)$/.exec(raw);
  if (mixed) {
    const whole = Number(mixed[1]);
    const numer = Number(mixed[2]);
    const denom = Number(mixed[3]);
    if (denom <= 0) {
      return null;
    }
    return Math.round(((whole * denom + numer) * 1000) / denom);
  }

  // numer/denom
  const simple = /^(\d+)\/(\d+)$/.exec(raw);
  if (simple) {
    const numer = Number(simple[1]);
    const denom = Number(simple[2]);
    if (denom <= 0) {
      return null;
    }
    return Math.round((numer * 1000) / denom);
  }

  // decimal or integer inches
  if (!/^\d+(\.\d+)?$/.test(raw)) {
    return null;
  }
  const inches = Number(raw);
  if (!Number.isFinite(inches) || inches <= 0) {
    return null;
  }
  return Math.round(inches * 1000);
}

function stripTrailingMaterialSuffix(value: string): string {
  let next = value.trim();
  // Repeat once or twice for "LVL DF" style tails; stop when unchanged.
  for (let i = 0; i < 3; i += 1) {
    const stripped = next.replace(MATERIAL_SUFFIX_PATTERN, "").trim();
    if (stripped === next) {
      break;
    }
    next = stripped;
  }
  return next;
}

/**
 * Parse a structural member size string into canonical ply + W×H milli-inches.
 * Returns null when the value is not a clear rectangular dimensional size.
 */
export function parseCanonicalDimensionalMemberSize(
  sizeValue: string,
): CanonicalDimensionalMemberSize | null {
  let working = stripTrailingMaterialSuffix(sizeValue.trim());
  if (working.length === 0) {
    return null;
  }

  let plyCount: number | null = null;
  const plyMatch = /^\(\s*(\d+)\s*\)\s*-?\s*/.exec(working);
  if (plyMatch) {
    plyCount = Number(plyMatch[1]);
    if (!Number.isInteger(plyCount) || plyCount <= 0) {
      return null;
    }
    working = working.slice(plyMatch[0].length).trim();
  }

  const dims = /^(.+?)\s*[x×]\s*(.+)$/i.exec(working);
  if (!dims) {
    return null;
  }

  const widthMilli = parseInchMeasureToMilli(dims[1]!);
  const heightMilli = parseInchMeasureToMilli(dims[2]!);
  if (widthMilli === null || heightMilli === null) {
    return null;
  }

  return { plyCount, widthMilli, heightMilli };
}

export function canonicalDimensionalSizeKey(
  size: CanonicalDimensionalMemberSize,
): string {
  return `${size.plyCount ?? 0}|${size.widthMilli}|${size.heightMilli}`;
}

function formatMilliInches(milli: MilliInches): string {
  const inches = milli / 1000;
  // Fixed-point trim: avoid float artifacts while keeping 1.75 / 11.875 form.
  const fixed = inches.toFixed(4).replace(/\.?0+$/, "");
  return fixed;
}

/**
 * Deterministic display rendering for a canonical dimensional size.
 * Identical for any notation-equivalent input set (permutation-safe).
 */
export function formatCanonicalDimensionalMemberSize(
  size: CanonicalDimensionalMemberSize,
): string {
  const body = `${formatMilliInches(size.widthMilli)}"x${formatMilliInches(size.heightMilli)}"`;
  if (size.plyCount === null) {
    return body;
  }
  return `(${size.plyCount})-${body}`;
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

/**
 * When size candidates conflict only by notation-equivalent dimensional forms
 * (e.g. 1.75" vs 1-3/4", 11.875" vs 11-7/8"), converge to one canonical size.
 *
 * Genuinely different normalized dimensions fail closed (returns null).
 * Schedule-mark-as-size candidates are ignored. Unparseable non-mark strings
 * among size candidates also fail closed.
 */
export function resolveNotationEquivalentDimensionalSizes(
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

  if (usable.length === 0) {
    return null;
  }

  const nonMark = usable.filter(
    (entry) => !isScheduleMarkAsSize(entry.value, subjectKey),
  );
  if (nonMark.length === 0) {
    return null;
  }

  const byCanonical = new Map<
    string,
    { canonical: CanonicalDimensionalMemberSize; evidenceIds: EvidenceId[] }
  >();
  const unparseable: string[] = [];

  for (const entry of nonMark) {
    const parsed = parseCanonicalDimensionalMemberSize(entry.value);
    if (!parsed) {
      unparseable.push(entry.value);
      continue;
    }
    const key = canonicalDimensionalSizeKey(parsed);
    const existing = byCanonical.get(key);
    if (existing) {
      existing.evidenceIds.push(entry.id);
    } else {
      byCanonical.set(key, {
        canonical: parsed,
        evidenceIds: [entry.id],
      });
    }
  }

  // Ambiguous non-dimensional strings that are not schedule marks → fail closed.
  if (unparseable.length > 0) {
    return null;
  }

  if (byCanonical.size !== 1) {
    return null;
  }

  const only = [...byCanonical.values()][0]!;
  const display = formatCanonicalDimensionalMemberSize(only.canonical);
  const sourceForms = [
    ...new Set(nonMark.map((entry) => entry.value)),
  ].sort(compareIds);

  return {
    size: display,
    evidenceIds: uniqueSortedIds(only.evidenceIds),
    explanation: `${NOTATION_EQUIVALENT_SIZE_MARKER}: candidates (${sourceForms.join(", ")}) share one canonical dimensional meaning; resolved size "${display}".`,
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

/**
 * When category Evidence only conflicts between wood-beam schedule synonyms
 * `beam` and `header`, converge to `header` when HEADER-corroborating Evidence
 * exists (aligned with Project Learning definitionKind aliases and M2 Beckstead
 * WB2-11.88LVL outcome). True conflicts involving other categories stay unresolved.
 */
export function resolveBeamHeaderCategorySynonym(
  records: readonly Evidence[],
): {
  category: "header";
  evidenceIds: EvidenceId[];
  explanation: string;
} | null {
  const categoryRecords = records.filter(
    (record) => record.propertyPath === "category",
  );
  if (categoryRecords.length === 0) {
    return null;
  }

  const grouped = new Map<string, EvidenceId[]>();
  for (const record of categoryRecords) {
    if (typeof record.candidateValue !== "string") {
      continue;
    }
    const key = record.candidateValue.trim().toLowerCase();
    if (key !== "beam" && key !== "header") {
      // Non-synonym category present — not a pure beam|header synonym conflict.
      if (key.length > 0) {
        return null;
      }
      continue;
    }
    const existing = grouped.get(key) ?? [];
    existing.push(record.id);
    grouped.set(key, existing);
  }

  if (!grouped.has("beam") || !grouped.has("header")) {
    return null;
  }

  const headerCorroborated = categoryRecords.some((record) => {
    if (
      typeof record.candidateValue === "string" &&
      record.candidateValue.trim().toLowerCase() === "header"
    ) {
      return true;
    }
    const text = `${record.id}\n${record.description}\n${record.originalText ?? ""}`;
    return /\bheader\b/i.test(text);
  });

  if (!headerCorroborated) {
    return null;
  }

  return {
    category: "header",
    evidenceIds: uniqueSortedIds([
      ...(grouped.get("beam") ?? []),
      ...(grouped.get("header") ?? []),
    ]),
    explanation: `${BEAM_HEADER_CATEGORY_SYNONYM_MARKER}: HEADER-corroborating Evidence present; beam treated as wood-beam schedule synonym of header.`,
  };
}

export function applyStructuralMemberAuthority(
  subjectKey: string,
  member: StructuralMember,
  records: readonly Evidence[],
): StructuralMember {
  let next: StructuralMember = member;
  const traces = [...member.resolutionTraces];

  if (next.category === "unknown") {
    const categoryResolution = resolveBeamHeaderCategorySynonym(records);
    if (categoryResolution) {
      const withoutUnresolvedCategory = traces.filter(
        (trace) =>
          !(
            trace.propertyPath === "category" &&
            trace.method === "unresolved"
          ),
      );
      withoutUnresolvedCategory.push(
        createTrace(
          "category",
          "supported-inference",
          categoryResolution.explanation,
          categoryResolution.evidenceIds,
        ),
      );
      next = {
        ...next,
        category: categoryResolution.category,
        resolutionTraces: withoutUnresolvedCategory,
      };
      traces.length = 0;
      traces.push(...withoutUnresolvedCategory);
    }
  }

  if (next.size === null) {
    const sizeResolution =
      resolveDimensionalSizeOverScheduleMark(subjectKey, records) ??
      resolveNotationEquivalentDimensionalSizes(subjectKey, records);
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
    next.category === member.category &&
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
