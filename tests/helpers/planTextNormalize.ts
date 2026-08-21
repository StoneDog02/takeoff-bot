/**
 * PDF text-layer / OpenDataLoader extraction often remaps punctuation.
 * Use these helpers for fixture assertions and Evidence grounding — never
 * require byte-identical apostrophes, dashes, or whitespace.
 */

const CURLY_SINGLE = /[\u2018\u2019\u201A\u201B\u2032]/g;
const CURLY_DOUBLE = /[\u201C\u201D\u201E\u2033]/g;
const DASH_VARIANTS = /[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g;
const ELLIPSIS = /\u2026|\.{2,}/g;

/** Normalize plan/Evidence text for comparison under PDF extraction quirks. */
export function normalizePlanText(value: string): string {
  return value
    .toLowerCase()
    .replace(CURLY_SINGLE, "'")
    .replace(CURLY_DOUBLE, '"')
    .replace(DASH_VARIANTS, "-")
    .replace(ELLIPSIS, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Compact form for token presence checks (feet-inch punctuation stripped). */
export function compactPlanText(value: string): string {
  return normalizePlanText(value).replace(/[^a-z0-9.x-]+/g, "");
}

const STOP_TOKENS = new Set([
  "the",
  "and",
  "at",
  "of",
  "for",
  "in",
  "to",
  "a",
  "an",
  "or",
]);

/**
 * True when originalText is grounded in pageText under PDF punctuation /
 * whitespace / paraphrase-ellipsis tolerance.
 */
export function isPlanTextGrounded(
  originalText: string | null,
  pageText: string,
): boolean {
  if (!originalText) {
    return false;
  }

  const haystack = normalizePlanText(pageText);
  const needle = normalizePlanText(originalText);
  if (haystack.includes(needle)) {
    return true;
  }

  const compactHaystack = compactPlanText(haystack);
  const tokens = needle
    .split(" ")
    .map((token) => compactPlanText(token))
    .filter((token) => token.length >= 2)
    .filter((token) => /[a-z0-9]/.test(token))
    .filter((token) => !STOP_TOKENS.has(token));

  return (
    tokens.length > 0 && tokens.every((token) => compactHaystack.includes(token))
  );
}

/**
 * Match a content marker against indexed PDF text, ignoring quote/dash/
 * whitespace differences. Pattern should use ASCII; curly variants are accepted.
 */
export function planTextIncludes(
  pageText: string,
  marker: string,
): boolean {
  const haystack = normalizePlanText(pageText);
  const needle = normalizePlanText(marker);
  if (haystack.includes(needle)) {
    return true;
  }
  return compactPlanText(haystack).includes(compactPlanText(needle));
}

/** Style A markers that must survive PDF write → indexPlan. */
export const REALISTIC_STYLE_A_REQUIRED_MARKERS: readonly string[] = [
  "SHEET A2.01",
  "SHEET A3.01",
  "SHEET S1.01",
  "SHEET A2.02",
  '2x6 SPF STUDS @ 16" O.C.',
  "W1 LENGTH 24'-0\"",
  "WINDOW W3 IN WALL W1",
  "DOOR D04 IN WALL W1",
  "HEADER H2",
  "HEADER H3",
  "NOMINAL",
  "ROUGH OPENING",
  "FLOOR SYS A",
  "BAY A",
  "BAY A = 20'-0\" E-W",
  "JOISTS 12'-0\" LONG",
  "2 JACK STUDS",
  "H2",
  "1-3/4 x 11-7/8 LVL",
  "B1",
  "W8x18",
  '7/16" OSB WALL SHEATHING',
  "WALL SH SYS",
  "WALL SH A",
  "ROOF SYS A",
  "GABLE A",
  "GABLE LENGTH 20'-0\"",
];

/** Style B markers. */
export const REALISTIC_STYLE_B_REQUIRED_MARKERS: readonly string[] = [
  "A2.01 FRAMING PLAN",
  "W1 EXT BRG",
  "W3 WIN",
  "D04 DR",
  "BAY A",
  "H2",
  "B1",
  "WALL SH A",
  "ROOF SYS A",
  "GABLE A",
  "GABLE LEN 20'",
];

export const ENGINE_PROPERTY_COACHING_PATTERN =
  /joistLayoutLengthFeet|rafterLayoutLengthFeet|areaSquareFeet|kingStudCount|joistMemberLengthFeet/;

export function assertNoEnginePropertyCoaching(sourceText: string): void {
  if (ENGINE_PROPERTY_COACHING_PATTERN.test(sourceText)) {
    throw new Error(
      "Source text contains engine property-name coaching labels.",
    );
  }
}

export function assertRequiredMarkers(
  pageText: string,
  markers: readonly string[],
  label: string,
): void {
  const missing = markers.filter((marker) => !planTextIncludes(pageText, marker));
  if (missing.length > 0) {
    throw new Error(
      `${label} missing markers after PDF index:\n${missing.map((m) => `  - ${m}`).join("\n")}`,
    );
  }
}

/** Representative Evidence originalText samples for grounding regression. */
export const REALISTIC_GROUNDING_SAMPLES: readonly string[] = [
  "HT 9'-0\"",
  "ROUGH OPENING 4'-0\" x 5'-0\"",
  "W3 WINDOW ... 1 W1 H2",
  "2x6 SPF STUDS @ 16\" O.C.",
  "BAY A = 20'-0\" E-W",
  "JOISTS 12'-0\" LONG",
  "GABLE LENGTH 20'-0\"",
  "1-3/4 x 11-7/8 LVL",
  "2 JACK STUDS",
  // Curly-quote forms as OpenDataLoader may emit in Evidence paraphrases
  "HT 9\u2019-0\"",
  "BAY A = 20\u2019-0\" E-W",
];
