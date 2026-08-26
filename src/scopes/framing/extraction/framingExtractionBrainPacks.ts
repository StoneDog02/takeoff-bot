import type { FramingExtractionIntent } from "../../../plans/deriveRoleAssignmentsFromPageClassification.js";

/** Shared scope Brain loaded for every extraction intent. */
export const BASE_EXTRACTION_BRAIN_PATHS = [
  "framing/01-scope-definition.md",
] as const;

/**
 * Deterministic intent-scoped Construction Brain packs (D11).
 * Never inject the entire Brain — Architecture constraint.
 */
export const INTENT_EXTRACTION_BRAIN_PATHS: Record<
  FramingExtractionIntent | "referenced-detail",
  readonly string[]
> = {
  "wall-framing": [
    ...BASE_EXTRACTION_BRAIN_PATHS,
    "framing/05-wall-identification.md",
    "framing/06-wall-types.md",
    "framing/04-building-assemblies.md",
  ],
  "floor-framing": [
    ...BASE_EXTRACTION_BRAIN_PATHS,
    "framing/04-building-assemblies.md",
  ],
  "roof-framing": [
    ...BASE_EXTRACTION_BRAIN_PATHS,
    "framing/04-building-assemblies.md",
  ],
  openings: [...BASE_EXTRACTION_BRAIN_PATHS, "framing/07-openings.md"],
  "structural-members": [
    ...BASE_EXTRACTION_BRAIN_PATHS,
    "framing/08-structural-members.md",
    "framing/09-material-taxonomy.md",
  ],
  sheathing: [
    ...BASE_EXTRACTION_BRAIN_PATHS,
    "framing/04-building-assemblies.md",
    "framing/09-material-taxonomy.md",
  ],
  "framing-general": [
    ...BASE_EXTRACTION_BRAIN_PATHS,
    "framing/04-building-assemblies.md",
    "framing/09-material-taxonomy.md",
  ],
  /** Until page-reference-rules is authored, referenced-detail uses base only. */
  "referenced-detail": [...BASE_EXTRACTION_BRAIN_PATHS],
};

export function resolveExtractionBrainPackPaths(
  intent: string | undefined,
): readonly string[] {
  if (!intent) {
    return INTENT_EXTRACTION_BRAIN_PATHS["wall-framing"];
  }
  const mapped =
    INTENT_EXTRACTION_BRAIN_PATHS[
      intent as FramingExtractionIntent | "referenced-detail"
    ];
  if (mapped) {
    return mapped;
  }
  return INTENT_EXTRACTION_BRAIN_PATHS["wall-framing"];
}

/** Export map for wave1 metrics artifact (single source of truth). */
export function exportBrainPackMap(): Record<string, readonly string[]> {
  return { ...INTENT_EXTRACTION_BRAIN_PATHS };
}
