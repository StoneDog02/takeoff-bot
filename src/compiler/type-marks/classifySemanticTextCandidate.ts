/**
 * B2.2L — semantic text categorization (identity vs property vs notes).
 * Used by L0 probe and type-identifier detection. Does not broaden
 * isWallTypeMarkSubjectKey used for length authority.
 */
export const semanticTextCategorySchema = [
  "type-or-assembly-identifier",
  "wall-property-or-classification",
  "general-note",
  "schedule-or-legend-text",
  "unknown",
] as const;

export type SemanticTextCategory = (typeof semanticTextCategorySchema)[number];

const GENERAL_NOTE_PATTERNS = [
  /^GENERAL\s+(?:STRUCTURAL\s+|WALL\s+|FRAMING\s+)?NOTES?$/i,
  /^NOTE\s*[:#]?\s*\d+/i,
  /^KEYNOTE\s*[:#]?\s*\d+/i,
  /^TYP(?:ICAL)?\.?$/i,
  /^SEE\s+(?:GENERAL\s+)?NOTES?$/i,
  /^REFER\s+TO\s+(?:GENERAL\s+)?NOTES?$/i,
];

const SCHEDULE_LEGEND_PATTERNS = [
  /\bSCHEDULE\b/i,
  /\bLEGEND\b/i,
  /\bTABLE\s+OF\s+CONTENTS\b/i,
  /\bSHEET\s+INDEX\b/i,
  /\bINDEX\b/i,
];

const PROPERTY_PHRASE_PATTERNS = [
  /^BEARING\s+WALLS?$/i,
  /^NON[-\s]?BEARING\s+WALLS?$/i,
  /^EXTERIOR\s+WALLS?$/i,
  /^INTERIOR\s+WALLS?$/i,
  /^BRACED\s+WALLS?$/i,
  /^SHEAR\s+WALLS?$/i,
  /^\d+\s*X\s*\d+\s+WALLS?$/i,
  /^2X\d+\s+WALLS?$/i,
  /^WOOD\s+STUD\s+WALLS?$/i,
  /^METAL\s+STUD\s+WALLS?$/i,
];

/** Reusable plan type / assembly identifier marks (SW2, WB2-10DF, W1, W-001, …). */
const TYPE_IDENTIFIER_PATTERNS = [
  /^SW\d+[A-Z]?$/i,
  /^WB\d[\w./-]*$/i,
  /^W\d+[A-Z]?$/i,
  /^W-\d{3,}$/i,
  /^WT-?\d+[A-Z]?$/i,
  /^AW-?\d+[A-Z]?$/i,
  /^TYPE\s+[A-Z0-9-]+$/i,
];

function normalizeForMatch(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toUpperCase();
}

function looksLikeImperialDimension(raw: string): boolean {
  const t = raw.trim();
  if (!t) return false;
  if (/\d/.test(t) && /['′"″]/.test(t)) return true;
  if (/^\d+\s*[-–—]\s*\d+/.test(t)) return true;
  return false;
}

export function classifySemanticTextCandidate(rawText: string): SemanticTextCategory {
  const text = rawText.trim();
  if (!text || text.length > 64) {
    return "unknown";
  }
  if (looksLikeImperialDimension(text)) {
    return "unknown";
  }

  const upper = normalizeForMatch(text);

  if (GENERAL_NOTE_PATTERNS.some((p) => p.test(upper))) {
    return "general-note";
  }
  if (SCHEDULE_LEGEND_PATTERNS.some((p) => p.test(upper))) {
    return "schedule-or-legend-text";
  }
  if (PROPERTY_PHRASE_PATTERNS.some((p) => p.test(upper))) {
    return "wall-property-or-classification";
  }
  if (TYPE_IDENTIFIER_PATTERNS.some((p) => p.test(upper))) {
    return "type-or-assembly-identifier";
  }

  return "unknown";
}

/** Whether text may bind as semanticTypeKey in B2.2L (direct ownership). */
export function isTypeOrAssemblyIdentifier(rawText: string): boolean {
  return classifySemanticTextCandidate(rawText) === "type-or-assembly-identifier";
}

/** Normalize identifier text to extraction-stable subject key form. */
export function normalizeTypeIdentifierKey(rawText: string): string {
  const upper = normalizeForMatch(rawText);
  const typeMatch = upper.match(/^TYPE\s+(.+)$/);
  if (typeMatch) {
    return typeMatch[1]!.replace(/\s+/g, "-");
  }
  return upper.replace(/\s+/g, "-");
}
