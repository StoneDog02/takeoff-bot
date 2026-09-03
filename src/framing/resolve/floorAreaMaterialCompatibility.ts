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

/**
 * True when a floor-framing-area subject represents a slab / non-wood floor surface
 * rather than a wood-joist takeoff bay.
 */
export function isSlabOrNonWoodFloorArea(records: readonly Evidence[]): boolean {
  if (records.length === 0) {
    return false;
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

  if (slabByKey && woodSignals) {
    return false;
  }

  const layoutNotesSlab = records.some((record) => {
    if (record.propertyPath !== "layout") {
      return false;
    }
    const text = normalizeToken(String(record.candidateValue ?? record.originalText ?? ""));
    return text.includes("slab") || text.includes("concrete");
  });

  return layoutNotesSlab && !woodSignals;
}

const SLAB_PARENT_REJECTION_MARKER =
  "Slab or non-wood floor surface cannot inherit a wood-joist floor system parent.";

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
 * Wood-joist floor systems must not own slab-only areas.
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

  return !isSlabOrNonWoodFloorArea(input.areaRecords);
}
