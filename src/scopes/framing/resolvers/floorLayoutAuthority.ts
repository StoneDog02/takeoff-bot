import type { Evidence } from "../../../core/schemas/evidence.schema.js";
import type { PropertyResolutionTrace } from "../../../core/schemas/resolved-object.schema.js";
import type { FloorFramingArea } from "../schemas/floor-framing.schema.js";

export const SPACING_AXIS_AUTHORITY_EXPLANATION_MARKER =
  "Spacing-axis layout authority established";

const SPACING_AXIS_KEYWORDS =
  /spacing\s*axis|along\s+the\s+spacing|perpendicular\s+to\s+(?:the\s+)?span|layout\s+length\s+along/i;

const MAX_SPAN_CALLOUT =
  /max\.?\s*span|maximum\s+span|\bspan\s*=\s*\d/i;

const CARDINAL_SPAN_DIRECTION =
  /\b(north|south|east|west|n[- ]?s|e[- ]?w|perpendicular\s+to)\b/i;

/**
 * Values mis-assigned to spanDirection that are actually member-length / span facts.
 */
export function isMemberLengthMisassignedAsSpanDirection(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return false;
  }

  if (MAX_SPAN_CALLOUT.test(trimmed)) {
    return true;
  }

  if (/^\(?\s*\d+\s*['-]/.test(trimmed) && !CARDINAL_SPAN_DIRECTION.test(trimmed)) {
    return true;
  }

  return false;
}

export function isValidSpanDirectionValue(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return false;
  }

  return !isMemberLengthMisassignedAsSpanDirection(trimmed);
}

/**
 * Parse an installed member / clear-span length from a MAX SPAN style callout.
 */
export function parseMemberLengthFeetFromSpanCallout(text: string): number | undefined {
  const match = text.match(
    /(?:max\.?\s*span\s*=?\s*)?(?:\(\s*)?(\d+)\s*'(?:\s*-\s*(\d+)\s*")?/i,
  );
  if (!match) {
    return undefined;
  }

  const feet = Number(match[1]);
  const inches = match[2] ? Number(match[2]) : 0;
  if (!Number.isFinite(feet) || feet <= 0) {
    return undefined;
  }

  if (!Number.isFinite(inches) || inches < 0) {
    return undefined;
  }

  return feet + inches / 12;
}

function evidencePageNumber(record: Evidence): number | null {
  return record.source.page?.pageNumber ?? null;
}

function layoutLengthEvidence(records: readonly Evidence[]): Evidence[] {
  return records.filter(
    (record) => record.propertyPath === "joistLayoutLengthFeet",
  );
}

function joistAssemblyEvidence(records: readonly Evidence[]): Evidence[] {
  return records.filter((record) =>
    [
      "assembly.joistType",
      "assembly.joistSize",
      "assembly.joistSpacingInches",
    ].includes(record.propertyPath),
  );
}

function textEstablishesSpacingAxis(record: Evidence): boolean {
  const combined = `${record.description}\n${record.originalText ?? ""}`;
  return SPACING_AXIS_KEYWORDS.test(combined);
}

function hasOrthogonalJoistCalloutCorroboration(
  areaRecords: readonly Evidence[],
  relatedRecords: readonly Evidence[],
): boolean {
  const layoutRecords = layoutLengthEvidence(areaRecords);
  if (layoutRecords.length === 0) {
    return false;
  }

  const layoutPages = new Set(
    layoutRecords
      .map(evidencePageNumber)
      .filter((page): page is number => page !== null),
  );

  if (layoutPages.size === 0) {
    return false;
  }

  const assemblyRecords = [
    ...joistAssemblyEvidence(areaRecords),
    ...joistAssemblyEvidence(relatedRecords),
  ];

  for (const record of assemblyRecords) {
    const page = evidencePageNumber(record);
    if (page === null || !layoutPages.has(page)) {
      continue;
    }

    const text = `${record.originalText ?? ""}\n${record.description}`;
    if (MAX_SPAN_CALLOUT.test(text)) {
      return true;
    }
  }

  return false;
}

export function isJoistLayoutLengthPresent(area: FloorFramingArea): boolean {
  return (
    area.joistLayoutLengthFeet !== null &&
    area.joistLayoutLengthFeet > 0 &&
    !area.resolutionTraces.some(
      (trace) =>
        trace.propertyPath === "joistLayoutLengthFeet" &&
        trace.method === "unresolved",
    )
  );
}

export function isSpacingAxisLayoutTrace(trace: PropertyResolutionTrace): boolean {
  if (trace.propertyPath !== "joistLayoutLengthFeet") {
    return false;
  }

  if (trace.method === "unresolved") {
    return false;
  }

  return (
    trace.explanation.includes(SPACING_AXIS_AUTHORITY_EXPLANATION_MARKER) ||
    SPACING_AXIS_KEYWORDS.test(trace.explanation)
  );
}

/**
 * Spacing-axis layout authority from resolved traces (post-resolution).
 */
export function hasSpacingAxisLayoutAuthorityFromTraces(
  area: FloorFramingArea,
): boolean {
  if (!isJoistLayoutLengthPresent(area)) {
    return false;
  }

  return area.resolutionTraces.some(isSpacingAxisLayoutTrace);
}

export function isSpacingAxisLayoutAuthorityEstablished(
  area: FloorFramingArea,
  areaRecords: readonly Evidence[],
  relatedRecords: readonly Evidence[] = [],
): boolean {
  if (!isJoistLayoutLengthPresent(area)) {
    return false;
  }

  if (hasSpacingAxisLayoutAuthorityFromTraces(area)) {
    return true;
  }

  const layoutRecords = layoutLengthEvidence(areaRecords);
  if (layoutRecords.some(textEstablishesSpacingAxis)) {
    return true;
  }

  return hasOrthogonalJoistCalloutCorroboration(areaRecords, relatedRecords);
}

/**
 * Baseline joist count layout-axis guard.
 *
 * Accept either valid spanDirection OR independently established spacing-axis
 * layout authority on joistLayoutLengthFeet.
 */
export function hasJoistCountLayoutAxisAuthority(area: FloorFramingArea): boolean {
  if (
    area.spanDirection !== null &&
    isValidSpanDirectionValue(area.spanDirection) &&
    !area.resolutionTraces.some(
      (trace) =>
        trace.propertyPath === "spanDirection" && trace.method === "unresolved",
    )
  ) {
    return true;
  }

  return hasSpacingAxisLayoutAuthorityFromTraces(area);
}

/**
 * Extract member length from spanDirection evidence mis-assigned as direction.
 */
export function memberLengthFromMisassignedSpanEvidence(
  records: readonly Evidence[],
): { value: number; evidenceIds: string[] } | null {
  const candidates: Array<{ value: number; id: string }> = [];

  for (const record of records) {
    if (record.propertyPath !== "spanDirection") {
      continue;
    }

    if (typeof record.candidateValue !== "string") {
      continue;
    }

    if (!isMemberLengthMisassignedAsSpanDirection(record.candidateValue)) {
      continue;
    }

    const parsed = parseMemberLengthFeetFromSpanCallout(record.candidateValue);
    if (parsed !== undefined) {
      candidates.push({ value: parsed, id: record.id });
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  const grouped = new Map<number, string[]>();
  for (const entry of candidates) {
    const existing = grouped.get(entry.value) ?? [];
    existing.push(entry.id);
    grouped.set(entry.value, existing);
  }

  if (grouped.size !== 1) {
    return null;
  }

  const [value, evidenceIds] = [...grouped.entries()][0]!;
  return { value, evidenceIds };
}

export function inferJoistSizeFromJoistType(
  joistType: string | null,
): string | null {
  if (!joistType) {
    return null;
  }

  const match = joistType.match(
    /(\d+\s+\d+\/\d"|\d+-?\d+\/\d"|\d+\/\d"|\d+\s+\d+\/\d)/,
  );
  if (!match) {
    return null;
  }

  return match[1]!.trim();
}
