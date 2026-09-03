import type { SemanticDefinition } from "../compiler/schemas/semanticDefinition.schema.js";
import type { ReferenceMechanism } from "../compiler/semantic-dereference/referenceMechanism.schema.js";
import type {
  ProjectConventionHypothesis,
  ProjectSemanticDefinition,
} from "./schemas/projectDictionary.schema.js";

/**
 * Semantic-only compiler input from governed project orientation.
 * Must not alter vector extraction, PBG thresholds, or dim parsing.
 */
export type ProjectOrientationContext = {
  sourceFingerprint: string | null;
  definitions: SemanticDefinition[];
  establishedRules: ProjectConventionHypothesis[];
  dictionaryDefinitions: ProjectSemanticDefinition[];
  referenceMechanismHint: ReferenceMechanism | null;
  graphicConventionAuthorized: boolean;
};

export function isGraphicConventionAuthorized(
  ctx: ProjectOrientationContext | undefined,
): boolean {
  if (!ctx?.graphicConventionAuthorized) return false;
  return ctx.establishedRules.some(
    (r) =>
      r.status === "established_rule" &&
      /heavy\s*line|graphic\s*convention|lineweight/i.test(r.claim),
  );
}

export function crossPageDefinitionsFromContext(
  ctx: ProjectOrientationContext | undefined,
): SemanticDefinition[] {
  if (!ctx) return [];
  return ctx.definitions;
}
