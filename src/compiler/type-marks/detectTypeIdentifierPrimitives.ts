import type { TextPrimitive } from "../text/extractTextPrimitives.js";
import {
  classifySemanticTextCandidate,
  isTypeOrAssemblyIdentifier,
  normalizeTypeIdentifierKey,
  type SemanticTextCategory,
} from "./classifySemanticTextCandidate.js";

export type TypeIdentifierPrimitive = {
  id: string;
  rawText: string;
  semanticSubjectKey: string;
  semanticTextCategory: SemanticTextCategory;
  mid: { x: number; y: number };
  orientation: "H" | "V" | "unknown";
  sourceAuthority: TextPrimitive["sourceAuthority"];
  /** When set, ownership uses leader endpoint run directly (B2.2L.1). */
  leaderTargetRunKey?: string | null;
  observationId?: string;
};

function isShortNonDimensionText(raw: string): boolean {
  const t = raw.trim();
  if (t.length === 0 || t.length > 32) return false;
  if (/^\d+['′"]/.test(t)) return false;
  if (/^\d+\s*[-–—]/.test(t)) return false;
  return true;
}

/**
 * Filter text primitives to type-or-assembly-identifier candidates for binding.
 */
export function detectTypeIdentifierPrimitives(
  primitives: readonly TextPrimitive[],
): TypeIdentifierPrimitive[] {
  const out: TypeIdentifierPrimitive[] = [];

  for (const p of primitives) {
    if (!isShortNonDimensionText(p.rawText)) continue;

    const category = classifySemanticTextCandidate(p.rawText);
    if (!isTypeOrAssemblyIdentifier(p.rawText)) continue;

    out.push({
      id: p.id,
      rawText: p.rawText.trim(),
      semanticSubjectKey: normalizeTypeIdentifierKey(p.rawText),
      semanticTextCategory: category,
      mid: p.mid,
      orientation: p.orientation,
      sourceAuthority: p.sourceAuthority,
    });
  }

  return out;
}

/**
 * Inventory all semantic text candidates with categories (L0 probe).
 */
export function inventorySemanticTextCandidates(
  primitives: readonly TextPrimitive[],
): Array<{
  id: string;
  rawText: string;
  category: SemanticTextCategory;
  mid: { x: number; y: number };
  orientation: "H" | "V" | "unknown";
}> {
  return primitives
    .filter((p) => p.rawText.trim().length > 0 && p.rawText.trim().length <= 64)
    .map((p) => ({
      id: p.id,
      rawText: p.rawText.trim(),
      category: classifySemanticTextCandidate(p.rawText),
      mid: p.mid,
      orientation: p.orientation,
    }));
}
