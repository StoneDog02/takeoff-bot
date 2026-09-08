import type { Evidence } from "../../core/schemas/evidence.schema.js";

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replaceAll(/\s+/g, "-");
}

const SLAB_SURFACE_TOKENS = [
  "slab",
  "concrete",
  "patio-slab",
  "patioslab",
  "garage-slab",
  "garageslab",
] as const;

const WOOD_FLOOR_TOKENS = [
  "joist",
  "tji",
  "i-joist",
  "dimensional",
  "floor-framing",
  "floor-system",
  "crawl-space-floor",
] as const;

const JOIST_CONDITION_NOTE_TOKENS = [
  "crawl",
  "visqueen",
  "joist",
  "tji",
  "i-joist",
  "floor-framing",
  "floor-system",
  "crawl-space-floor",
] as const;

function tokenizeSubject(text: string): string[] {
  return normalizeToken(text)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0);
}

function recordsContainToken(records: readonly Evidence[], token: string): boolean {
  const normalized = normalizeToken(token);
  for (const record of records) {
    const haystack = normalizeToken(
      `${record.subjectKey} ${record.originalText ?? ""} ${record.description ?? ""} ${String(record.candidateValue ?? "")}`,
    );
    if (haystack.includes(normalized)) {
      return true;
    }
  }
  return false;
}

function subjectKeyIndicatesSlabSurface(subjectKey: string): boolean {
  const tokens = tokenizeSubject(subjectKey);
  if (tokens.some((token) => SLAB_SURFACE_TOKENS.includes(token as (typeof SLAB_SURFACE_TOKENS)[number]))) {
    return true;
  }

  const normalized = normalizeToken(subjectKey);
  return (
    normalized.includes("patio-slab") ||
    normalized.includes("slab-area") ||
    (normalized.includes("patio") && normalized.includes("slab")) ||
    (normalized.includes("garage") && normalized.includes("slab"))
  );
}

/**
 * True when a floor-area layout string is an explicit concrete slab
 * (including OCR/abbrev forms such as `4" CONC. SLAB`).
 *
 * Layouts that also name joist/TJI/truss framing are not slab-only conditions.
 */
export function layoutTextIndicatesExplicitConcreteSlab(text: string): boolean {
  const compact = text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (compact.length === 0) {
    return false;
  }

  if (/\b(?:joist|tji|truss|i ?joist)\b/.test(compact)) {
    return false;
  }

  return /\bslab\b/.test(compact) || /\bconcrete\b/.test(compact) || /\bconc\b/.test(compact);
}

function recordsHaveExplicitConcreteSlabLayout(
  records: readonly Evidence[],
): boolean {
  return records.some((record) => {
    if (record.propertyPath !== "layout") {
      return false;
    }

    return layoutTextIndicatesExplicitConcreteSlab(
      String(record.candidateValue ?? record.originalText ?? ""),
    );
  });
}

function recordsIndicateWoodJoistFloor(records: readonly Evidence[]): boolean {
  for (const record of records) {
    if (
      record.propertyPath === "parentSystemTag" ||
      record.propertyPath === "parentSystemId"
    ) {
      continue;
    }

    for (const token of WOOD_FLOOR_TOKENS) {
      if (recordsContainToken([record], token)) {
        return true;
      }
    }

    if (
      record.propertyPath === "assembly.joistType" ||
      record.propertyPath === "assembly.joistSpacingInches" ||
      record.propertyPath === "joistLayoutLengthFeet" ||
      record.propertyPath === "joistMemberLengthFeet"
    ) {
      return true;
    }
  }

  return false;
}

function recordsHaveJoistLayoutOrMemberEvidence(
  records: readonly Evidence[],
): boolean {
  return records.some(
    (record) =>
      record.propertyPath === "joistLayoutLengthFeet" ||
      record.propertyPath === "joistMemberLengthFeet" ||
      record.propertyPath === "assembly.joistType" ||
      record.propertyPath === "assembly.joistSpacingInches",
  );
}

function recordsHaveJoistConditionNotes(records: readonly Evidence[]): boolean {
  for (const record of records) {
    if (
      record.propertyPath === "parentSystemTag" ||
      record.propertyPath === "parentSystemId"
    ) {
      continue;
    }

    for (const token of JOIST_CONDITION_NOTE_TOKENS) {
      if (recordsContainToken([record], token)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * True when a floor area is itself a wood-joist takeoff condition:
 * crawl / visqueen / joist notes, or explicit joist layout / member Evidence.
 * Co-located porch / patio square footage is not a joist condition.
 */
export function isJoistConditionFloorArea(
  records: readonly Evidence[],
): boolean {
  if (records.length === 0) {
    return false;
  }

  return (
    recordsHaveJoistLayoutOrMemberEvidence(records) ||
    recordsHaveJoistConditionNotes(records)
  );
}

/**
 * True when a floor-framing-area subject represents a slab / non-wood floor surface
 * rather than a wood-joist takeoff bay.
 */
export function isSlabOrNonWoodFloorArea(records: readonly Evidence[]): boolean {
  if (records.length === 0) {
    return false;
  }

  if (recordsHaveExplicitConcreteSlabLayout(records)) {
    return true;
  }

  const subjectKey = records[0]!.subjectKey;
  const slabByKey = subjectKeyIndicatesSlabSurface(subjectKey);

  if (slabByKey) {
    const hasWoodAssemblyOnArea = records.some(
      (record) =>
        record.propertyPath === "assembly.joistType" ||
        record.propertyPath === "assembly.joistSpacingInches",
    );
    if (!hasWoodAssemblyOnArea) {
      return true;
    }
  }

  const woodSignals = recordsIndicateWoodJoistFloor(records);

  if (slabByKey && !woodSignals) {
    return true;
  }

  return false;
}

const SLAB_PARENT_REJECTION_MARKER =
  "Slab or non-wood floor surface cannot inherit a wood-joist floor system parent.";

export const NON_JOIST_CONDITION_PARENT_REJECTION_MARKER =
  "Floor area is not a joist condition and cannot inherit a wood-joist floor system parent.";

export function isNonWoodFloorTakeoffAreaFromTraces(
  area: import("../schemas/floor-framing.schema.js").FloorFramingArea,
): boolean {
  return area.resolutionTraces.some(
    (trace) =>
      trace.propertyPath === "parentSystemTag" &&
      trace.explanation.includes(SLAB_PARENT_REJECTION_MARKER),
  );
}

/**
 * Wood-joist floor systems may own an area only when that area is a joist
 * condition. Slab / non-wood surfaces stay incompatible.
 */
export function isWoodJoistFloorSystemCompatibleWithArea(input: {
  systemRecords: readonly Evidence[];
  areaRecords: readonly Evidence[];
}): boolean {
  if (isSlabOrNonWoodFloorArea(input.areaRecords)) {
    return false;
  }

  const systemWood = recordsIndicateWoodJoistFloor(input.systemRecords);
  if (!systemWood) {
    return true;
  }

  return isJoistConditionFloorArea(input.areaRecords);
}
