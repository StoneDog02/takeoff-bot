import type { Evidence } from "../../core/schemas/evidence.schema.js";
import type { OpeningCategory } from "../schemas/opening.schema.js";

const LITERAL_CATEGORY_PATTERNS: Array<{
  pattern: RegExp;
  category: OpeningCategory;
}> = [
  { pattern: /\bGARAGE\s*DOOR\b/i, category: "garage-door" },
  { pattern: /\bWINDOW\b/i, category: "window" },
  { pattern: /\bDOOR\b/i, category: "door" },
  { pattern: /\bCASED\b/i, category: "cased" },
];

/** Compact residential opening type marks (door/window codes), not wall SW* IDs. */
const OPENING_TYPE_MARK_PATTERNS: RegExp[] = [
  /^#?\d{4}$/i,
  /^\d{2}\s*\/\s*\d{1,2}$/i,
  /^#?\d{3,4}\s*S\.?\s*[VH]\.?$/i,
  /^#?\d{4}\s*[A-Z]{1,4}\.?$/i,
  /^#?\d{1,2}[°º]?\d{1,2}\s*S\.?\s*[VH]\.?$/i,
];

const DIMENSION_PROPERTY_PATHS = new Set([
  "dimensions.nominalWidthFeet",
  "dimensions.nominalHeightFeet",
  "dimensions.roughWidthFeet",
  "dimensions.roughHeightFeet",
]);

/**
 * True when text prints explicit W×H / feet-inches suitable as opening size
 * authority (not a bare type mark).
 */
export function hasExplicitPrintedOpeningDimensions(raw: string): boolean {
  const text = raw.trim();
  if (!text) return false;
  if (/\d/.test(text) && /['′]/.test(text)) return true;
  if (/\d/.test(text) && /["″]/.test(text) && /\d/.test(text)) return true;
  // e.g. 18'x8', 3 x 6-8 with feet marks already covered; reject bare 3068.
  if (/\d+\s*['′]\s*[x×]\s*\d+/i.test(text)) return true;
  if (/\d+\s*[-–]\s*\d+\s*["″].*[x×]/i.test(text)) return true;
  return false;
}

/**
 * Literal DOOR / WINDOW / GARAGE DOOR / CASED label → category.
 * Does not decode type marks into categories.
 */
export function literalOpeningCategoryFromText(
  raw: string,
): OpeningCategory | null {
  const text = raw.trim();
  if (!text || text.length > 64) return null;
  for (const { pattern, category } of LITERAL_CATEGORY_PATTERNS) {
    if (pattern.test(text)) return category;
  }
  return null;
}

/**
 * Whether raw text is an opening type mark (e.g. 3068, #5050 S.V.).
 * Does not authorize dimensions.
 */
export function isOpeningTypeMarkText(raw: string): boolean {
  const text = raw.trim().replace(/\s+/g, " ");
  if (!text || text.length > 32) return false;
  if (hasExplicitPrintedOpeningDimensions(text)) return false;
  if (literalOpeningCategoryFromText(text) != null && !/\d{3,4}/.test(text)) {
    return false;
  }
  const upper = text.toUpperCase();
  return OPENING_TYPE_MARK_PATTERNS.some((pattern) => pattern.test(upper));
}

/** Opening mark or literal category label usable for mark→gap ownership. */
export function isOpeningMarkOrLabelText(raw: string): boolean {
  return (
    literalOpeningCategoryFromText(raw) != null || isOpeningTypeMarkText(raw)
  );
}

/** Stable comparison key for opening type marks (strips #, spaces, dots). */
export function normalizeOpeningMarkKey(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[#°º]/g, "")
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(/\//g, "");
}

/**
 * Extract opening-mark tokens from free text / subjectKeys for ownership adopt.
 */
export function openingMarkTokensFromText(raw: string): string[] {
  const text = raw.trim();
  if (!text) return [];
  const tokens = new Set<string>();
  if (isOpeningTypeMarkText(text)) {
    tokens.add(normalizeOpeningMarkKey(text));
  }
  // Four-digit door/window codes and window marks with S.V./S.H. — not O-001.
  for (const match of text.matchAll(/#?\d{4}(?:\s*S\.?\s*[VH]\.?)?/gi)) {
    const piece = match[0]!;
    if (isOpeningTypeMarkText(piece) || /^#?\d{4}/i.test(piece)) {
      tokens.add(normalizeOpeningMarkKey(piece));
    }
  }
  for (const match of text.matchAll(/#?\d{3,4}\s*S\.?\s*[VH]\.?/gi)) {
    tokens.add(normalizeOpeningMarkKey(match[0]!));
  }
  for (const match of text.matchAll(/\b\d{2}\s*\/\s*\d{1,2}\b/g)) {
    tokens.add(normalizeOpeningMarkKey(match[0]!));
  }
  return [...tokens];
}

export function openingMarkKeysCompatible(
  ownedMarkText: string,
  evidenceText: string,
): boolean {
  const owned = normalizeOpeningMarkKey(ownedMarkText);
  if (!owned) return false;
  if (normalizeOpeningMarkKey(evidenceText) === owned) return true;
  return openingMarkTokensFromText(evidenceText).includes(owned);
}

export function isOpeningDimensionPropertyPath(propertyPath: string): boolean {
  return DIMENSION_PROPERTY_PATHS.has(propertyPath);
}

/**
 * Reject dimension Evidence grounded only on a bare opening type mark
 * (industry size decode). Explicit printed W×H / feet-inches remains allowed.
 */
export function isMarkDecodedOpeningDimensionEvidence(
  record: Pick<Evidence, "propertyPath" | "originalText" | "candidateValue">,
): boolean {
  if (!isOpeningDimensionPropertyPath(record.propertyPath)) {
    return false;
  }
  const original = (record.originalText ?? "").trim();
  if (!original) return false;
  if (hasExplicitPrintedOpeningDimensions(original)) return false;

  if (isOpeningTypeMarkText(original)) return true;

  // Narration that cites slash-form marks (30/8) with door/window/mark wording.
  if (
    /\b\d{2}\s*\/\s*\d{1,2}\b/.test(original) &&
    /\b(door|window|mark)\b/i.test(original)
  ) {
    return true;
  }

  // Reject when the numeric candidate matches industry decode of a mark token
  // present in the original text (e.g. originalText "3068" or "3068-DINING" → 3 / 6.67).
  const value = record.candidateValue;
  if (typeof value !== "number" || !Number.isFinite(value)) return false;

  for (const token of openingMarkTokensFromText(original)) {
    if (valueMatchesOpeningMarkDecode(value, token, record.propertyPath)) {
      return true;
    }
  }

  return false;
}

function valueMatchesOpeningMarkDecode(
  value: number,
  markKey: string,
  propertyPath: string,
): boolean {
  const digits = markKey.replace(/\D/g, "");
  if (digits.length === 4) {
    const ww = Number(digits.slice(0, 2));
    const hh = Number(digits.slice(2, 4));
    const widthFeet = Math.floor(ww / 10) + (ww % 10) / 12;
    const heightFeet = Math.floor(hh / 10) + (hh % 10) / 12;
    if (propertyPath.includes("Width")) {
      return Math.abs(value - widthFeet) < 0.02;
    }
    if (propertyPath.includes("Height")) {
      return Math.abs(value - heightFeet) < 0.02;
    }
  }
  // Slash form normalized away (308 from 30/8) — treat as 3'-0" x 6'-8".
  if (digits.length === 3 && digits.startsWith("30")) {
    if (propertyPath.includes("Width")) return Math.abs(value - 3) < 0.02;
    if (propertyPath.includes("Height")) return Math.abs(value - 6.67) < 0.05;
  }
  return false;
}
