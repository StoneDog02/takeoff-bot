/**
 * Deterministic parsing of construction-plan cross-sheet / detail labels.
 *
 * Conservative: only accepts explicit architectural sheet forms (e.g. S5.2)
 * and well-known SEE DETAIL / SHEET phrasing. Rejects fraction-like strings
 * (3.1/2", 7/16") and door size codes (30/8).
 */

export interface ParsedPlanReferenceLabel {
  originalText: string;
  kind: "detail" | "sheet" | "section" | "schedule" | "other";
  status: "parsed" | "unresolved" | "ambiguous";
  detailNumber: string | null;
  /** Inclusive range bounds when THRU syntax is present. */
  detailNumberFrom: string | null;
  detailNumberTo: string | null;
  targetSheetId: string | null;
  notes: string[];
}

const ARCH_SHEET = String.raw`[A-Za-z]\d+(?:\.\d+)+`;

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function canonicalizeSheetId(sheetId: string): string {
  return sheetId.toUpperCase();
}

/**
 * Attempts to parse a single candidate label as a plan reference.
 * Returns status unresolved/ambiguous rather than guessing.
 */
export function parsePlanReferenceLabel(
  rawText: string,
): ParsedPlanReferenceLabel {
  const originalText = normalizeWhitespace(rawText);
  if (originalText.length === 0) {
    return {
      originalText: rawText,
      kind: "other",
      status: "unresolved",
      detailNumber: null,
      detailNumberFrom: null,
      detailNumberTo: null,
      targetSheetId: null,
      notes: ["empty reference text"],
    };
  }

  // Range: "6 THRU 9/S6.1" — sheet known; structured range retained; not a single detail.
  const range = originalText.match(
    new RegExp(
      String.raw`^(?:SEE\s+)?(?:DETAILS?\s+)?(\d+)\s+THRU\s+(\d+)\s*/\s*(${ARCH_SHEET})\b`,
      "i",
    ),
  );
  if (range) {
    const from = range[1]!;
    const to = range[2]!;
    return {
      originalText,
      kind: "detail",
      status: "ambiguous",
      detailNumber: null,
      detailNumberFrom: from,
      detailNumberTo: to,
      targetSheetId: canonicalizeSheetId(range[3]!),
      notes: [
        `Detail range ${from}-${to} retained as structured bounds; V1 does not auto-expand into individual detail hops.`,
      ],
    };
  }

  // Classic: "5/S5.2", "SEE DETAIL 5/S5.2", "DETAIL 2/S6.2"
  const detailSlash = originalText.match(
    new RegExp(
      String.raw`^(?:SEE\s+)?(?:DETAILS?\s+)?(\d+)\s*/\s*(${ARCH_SHEET})\b`,
      "i",
    ),
  );
  if (detailSlash) {
    return {
      originalText,
      kind: "detail",
      status: "parsed",
      detailNumber: detailSlash[1]!,
      detailNumberFrom: null,
      detailNumberTo: null,
      targetSheetId: canonicalizeSheetId(detailSlash[2]!),
      notes: [],
    };
  }

  // Embedded classic anywhere in a longer note, only with DETAIL/SEE cue.
  const embeddedDetail = originalText.match(
    new RegExp(
      String.raw`(?:SEE\s+)?DETAILS?\s+(\d+)\s*/\s*(${ARCH_SHEET})\b`,
      "i",
    ),
  );
  if (embeddedDetail) {
    return {
      originalText,
      kind: "detail",
      status: "parsed",
      detailNumber: embeddedDetail[1]!,
      detailNumberFrom: null,
      detailNumberTo: null,
      targetSheetId: canonicalizeSheetId(embeddedDetail[2]!),
      notes: ["Parsed from DETAIL cue inside longer note text."],
    };
  }

  const embeddedSeeSlash = originalText.match(
    new RegExp(String.raw`SEE\s+(\d+)\s*/\s*(${ARCH_SHEET})\b`, "i"),
  );
  if (embeddedSeeSlash) {
    return {
      originalText,
      kind: "detail",
      status: "parsed",
      detailNumber: embeddedSeeSlash[1]!,
      detailNumberFrom: null,
      detailNumberTo: null,
      targetSheetId: canonicalizeSheetId(embeddedSeeSlash[2]!),
      notes: ["Parsed from SEE N/SHEET cue inside longer note text."],
    };
  }

  // Sheet-only: "SHEET S1.1", "SEE SCHEDULES ON SHEET S1.1"
  const sheetOnly = originalText.match(
    new RegExp(
      String.raw`(?:SEE\s+)?(?:SCHEDULES?\s+ON\s+)?SHEET\s+(${ARCH_SHEET})\b`,
      "i",
    ),
  );
  if (sheetOnly) {
    return {
      originalText,
      kind: "sheet",
      status: "parsed",
      detailNumber: null,
      detailNumberFrom: null,
      detailNumberTo: null,
      targetSheetId: canonicalizeSheetId(sheetOnly[1]!),
      notes: [],
    };
  }

  // Bare architectural sheet id as the entire label (from structured property).
  const bareSheet = originalText.match(new RegExp(String.raw`^(${ARCH_SHEET})$`, "i"));
  if (bareSheet) {
    return {
      originalText,
      kind: "sheet",
      status: "parsed",
      detailNumber: null,
      detailNumberFrom: null,
      detailNumberTo: null,
      targetSheetId: canonicalizeSheetId(bareSheet[1]!),
      notes: [],
    };
  }

  return {
    originalText,
    kind: "other",
    status: "unresolved",
    detailNumber: null,
    detailNumberFrom: null,
    detailNumberTo: null,
    targetSheetId: null,
    notes: ["No safe plan-reference syntax matched."],
  };
}

/**
 * True when a property path is an authorized structured reference carrier.
 */
export function isStructuredReferencePropertyPath(propertyPath: string): boolean {
  return (
    propertyPath === "detailReference" ||
    propertyPath === "scheduleReference" ||
    propertyPath === "specificationReference" ||
    propertyPath.endsWith(".detailReference") ||
    propertyPath.endsWith(".scheduleReference")
  );
}
