import type { SemanticDefinition } from "../../compiler/schemas/semanticDefinition.schema.js";
import type { ProjectSemanticDefinition } from "../schemas/projectDictionary.schema.js";

function guessKind(key: string): SemanticDefinition["definitionKind"] {
  if (/^SW\d/i.test(key)) return "shear-wall";
  if (/^WB\d/i.test(key)) return "header";
  if (/^(?:LSTHD|STHD|HDU|HTT)/i.test(key)) return "holdown";
  if (/^(?:W|WT|AW)-?\d/i.test(key)) return "wall-type";
  return "unknown";
}

/**
 * Map validated Project Dictionary definitions into compiler SemanticDefinition
 * shape. Uses page-level placeholder region — do not cite as Evidence SourceRegion
 * until ODL bbox ↔ pdf-points probe is proven.
 */
export function mapProjectLearningToSemanticDefinitions(
  defs: readonly ProjectSemanticDefinition[],
): SemanticDefinition[] {
  return defs.map((def) => ({
    definitionId: `pl-def-${def.semanticTypeKey}`,
    semanticTypeKey: def.semanticTypeKey,
    definitionKind: guessKind(def.semanticTypeKey),
    sourcePageNumber: def.sourcePage,
    sourceRegion: { x0: 0, y0: 0, x1: 1, y1: 1 },
    properties: def.properties.map((p) => ({
      propertyPath: p.propertyPath,
      rawText: p.rawText,
      candidateValue: p.rawText,
    })),
    provenance: {
      extractionMethod: "project-learning" as const,
    },
  }));
}

export function mergeProjectSemanticDefinitions(
  base: readonly ProjectSemanticDefinition[],
  extras: readonly ProjectSemanticDefinition[],
): ProjectSemanticDefinition[] {
  const byKey = new Map(
    base.map((d) => [d.semanticTypeKey.trim().toUpperCase(), d] as const),
  );
  for (const extra of extras) {
    const key = extra.semanticTypeKey.trim().toUpperCase();
    if (!byKey.has(key)) {
      byKey.set(key, extra);
    }
  }
  return [...byKey.values()];
}
