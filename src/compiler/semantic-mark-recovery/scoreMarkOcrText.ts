import {
  classifySemanticTextCandidate,
  isTypeOrAssemblyIdentifier,
  normalizeTypeIdentifierKey,
} from "../type-marks/classifySemanticTextCandidate.js";

export type MarkOcrScore = {
  rawText: string;
  normalizedKey: string | null;
  category: ReturnType<typeof classifySemanticTextCandidate>;
  isTypeIdentifier: boolean;
  confidence: number;
  score: number;
};

/** Score OCR text for type-identifier recovery (not imperial dimensions). */
export function scoreMarkOcrText(text: string, confidence: number): MarkOcrScore | null {
  const cleaned = text
    .replace(/\s+/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim()
    .toUpperCase();

  if (!cleaned || cleaned.length > 16) return null;

  const tokens = cleaned.split(/\s+/).filter(Boolean);
  let best: MarkOcrScore | null = null;

  for (const token of tokens.length > 0 ? tokens : [cleaned]) {
    if (token.length === 0 || token.length > 12) continue;
    const category = classifySemanticTextCandidate(token);
    const isType = isTypeOrAssemblyIdentifier(token);
    let score = confidence;
    if (isType) score += 500;
    if (category === "wall-property-or-classification") score -= 200;
    if (category === "general-note" || category === "schedule-or-legend-text") score -= 300;
    if (/^\d+['′"-]/.test(token)) score -= 400;
    if (/^\d+$/.test(token)) score -= 100;

    const candidate: MarkOcrScore = {
      rawText: token,
      normalizedKey: isType ? normalizeTypeIdentifierKey(token) : null,
      category,
      isTypeIdentifier: isType,
      confidence,
      score,
    };
    if (!best || candidate.score > best.score) best = candidate;
  }

  if (!best || !best.isTypeIdentifier) return null;
  return best;
}
