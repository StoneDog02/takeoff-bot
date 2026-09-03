/**
 * Deterministic imperial length → decimal feet.
 * Claude may transcribe source text; TypeScript alone normalizes arithmetic.
 */

export type ImperialLengthParseResult =
  | { status: "ok"; feet: number; originalText: string }
  | { status: "unresolved"; originalText: string; reason: string };

function normalizeLengthText(raw: string): string {
  return raw
    .replace(/\u2032/g, "'")
    .replace(/\u2033/g, '"')
    .replace(/\u2019/g, "'")
    .replace(/\u201d/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parses common plan length forms:
 * - 24'-0"
 * - 12'-6 1/2"
 * - 12' 6-1/2"
 * - 8'-0
 * - 24'
 * Rejects bare decimals without foot marks (ambiguous units).
 */
export function parseImperialLengthToFeet(
  rawText: string,
): ImperialLengthParseResult {
  const originalText = normalizeLengthText(rawText);
  if (originalText.length === 0) {
    return { status: "unresolved", originalText: rawText, reason: "empty" };
  }

  // feet'-inches" with optional fractional inches
  const full = originalText.match(
    /^(\d+)\s*'\s*-?\s*(\d+)?(?:\s+(\d+)\s*\/\s*(\d+))?\s*"?\s*$/,
  );
  if (full) {
    const feet = Number(full[1]);
    const inches = full[2] !== undefined ? Number(full[2]) : 0;
    const fracNum = full[3] !== undefined ? Number(full[3]) : 0;
    const fracDen = full[4] !== undefined ? Number(full[4]) : 1;
    if (!Number.isFinite(feet) || feet < 0) {
      return {
        status: "unresolved",
        originalText,
        reason: "invalid feet",
      };
    }
    if (!Number.isFinite(inches) || inches < 0 || inches >= 12) {
      return {
        status: "unresolved",
        originalText,
        reason: "inches out of range",
      };
    }
    if (fracDen <= 0 || fracNum < 0 || fracNum >= fracDen) {
      return {
        status: "unresolved",
        originalText,
        reason: "invalid fractional inches",
      };
    }
    const totalInches = feet * 12 + inches + fracNum / fracDen;
    return {
      status: "ok",
      feet: totalInches / 12,
      originalText,
    };
  }

  // feet only: 24'
  const feetOnly = originalText.match(/^(\d+(?:\.\d+)?)\s*'\s*$/);
  if (feetOnly) {
    const feet = Number(feetOnly[1]);
    if (!Number.isFinite(feet) || feet <= 0) {
      return {
        status: "unresolved",
        originalText,
        reason: "invalid feet-only value",
      };
    }
    return { status: "ok", feet, originalText };
  }

  return {
    status: "unresolved",
    originalText,
    reason: "no safe imperial length syntax",
  };
}
