import { z } from "zod";

export const projectLearningValidationStatusSchema = z.enum([
  "harvested",
  "interpreted",
  "validated",
  "rejected",
  "unresolved",
  "conflict",
]);

export type ProjectLearningValidationStatus = z.infer<
  typeof projectLearningValidationStatusSchema
>;

export const projectLearningSourceKindSchema = z.enum([
  "odl-hybrid",
  "odl-local",
  "ocr-row-band",
  "ocr-fullpage",
  "fixture",
]);

export type ProjectLearningSourceKind = z.infer<
  typeof projectLearningSourceKindSchema
>;

export const projectLearningBboxSchema = z.object({
  left: z.number(),
  bottom: z.number(),
  right: z.number(),
  top: z.number(),
});

export const projectLearningCandidateSchema = z.object({
  id: z.string().trim().min(1),
  pageNumber: z.number().int().positive(),
  sourceKind: projectLearningSourceKindSchema,
  elementType: z.string().trim().min(1),
  bbox: projectLearningBboxSchema.optional(),
  rawValue: z.string(),
  interpretedValue: z.string().optional(),
  validationStatus: projectLearningValidationStatusSchema,
  definitionKind: z
    .enum(["shear-wall", "wall-type", "header", "holdown", "connector", "unknown"])
    .optional(),
  semanticTypeKey: z.string().trim().min(1).optional(),
  properties: z
    .array(
      z.object({
        propertyPath: z.string().trim().min(1),
        rawText: z.string(),
      }),
    )
    .optional(),
  conflictNotes: z.array(z.string()).optional(),
  tableHint: z.string().optional(),
});

export type ProjectLearningCandidate = z.infer<
  typeof projectLearningCandidateSchema
>;

/** Truthful Hybrid / OCR harvest telemetry (V1). */
export const projectLearningHarvestTelemetrySchema = z.object({
  hybridRequested: z.boolean(),
  hybridActuallyUsed: z.boolean(),
  hybridFallbackOccurred: z.boolean(),
  forceOcrRequested: z.boolean(),
  structuredElementsRecovered: z.number().int().nonnegative(),
  ocrFallbackUsed: z.boolean().default(false),
});

export type ProjectLearningHarvestTelemetry = z.infer<
  typeof projectLearningHarvestTelemetrySchema
>;

export const projectLearningInterpretTelemetrySchema = z.object({
  regionCalls: z.number().int().nonnegative(),
  firstPassSuccesses: z.number().int().nonnegative(),
  firstPassFailures: z.number().int().nonnegative(),
  repairAttempts: z.number().int().nonnegative(),
  repairSuccesses: z.number().int().nonnegative(),
  repairFailures: z.number().int().nonnegative(),
  proposalCount: z.number().int().nonnegative(),
});

export const projectLearningMetricsSchema = z.object({
  pagesHarvested: z.number().int().nonnegative(),
  /** @deprecated Prefer harvestTelemetry.hybridActuallyUsed — kept for older readers. */
  hybridUsed: z.boolean(),
  harvestTelemetry: projectLearningHarvestTelemetrySchema.optional(),
  harvestTimingMs: z.number().nonnegative(),
  interpretTimingMs: z.number().nonnegative(),
  acceptedCount: z.number().int().nonnegative(),
  rejectedCount: z.number().int().nonnegative(),
  unresolvedCount: z.number().int().nonnegative(),
  conflictCount: z.number().int().nonnegative(),
  interpretPath: z.enum(["deterministic", "claude-region"]).optional(),
  interpretTelemetry: projectLearningInterpretTelemetrySchema.optional(),
});

export type ProjectLearningMetrics = z.infer<typeof projectLearningMetricsSchema>;

export const projectLearningPayloadSchema = z.object({
  projectId: z.string().trim().min(1),
  generatedAt: z.string().trim().min(1),
  harvestPageNumbers: z.array(z.number().int().positive()),
  candidates: z.array(projectLearningCandidateSchema),
  metrics: projectLearningMetricsSchema,
});

export type ProjectLearningPayload = z.infer<typeof projectLearningPayloadSchema>;

/** Only validated candidates may become context-eligible definitions. */
export function isContextEligible(
  status: ProjectLearningValidationStatus,
): boolean {
  return status === "validated";
}

const STRUCTURED_ODL_TYPES = new Set([
  "table",
  "heading",
  "paragraph",
  "table row",
  "table cell",
  "list",
  "list item",
]);

/**
 * Count ODL kids that are usable Project Learning structure (not bare images).
 */
export function countStructuredOdlElements(
  node: unknown,
  pageFilter?: ReadonlySet<number>,
): number {
  let count = 0;
  const visit = (n: unknown): void => {
    if (!n) return;
    if (Array.isArray(n)) {
      for (const child of n) visit(child);
      return;
    }
    if (typeof n !== "object") return;
    const rec = n as Record<string, unknown>;
    const pageNumber = rec["page number"];
    const type = typeof rec.type === "string" ? rec.type : "";
    const content = typeof rec.content === "string" ? rec.content.trim() : "";
    const pageOk =
      pageFilter == null ||
      (typeof pageNumber === "number" && pageFilter.has(pageNumber));
    if (pageOk && STRUCTURED_ODL_TYPES.has(type)) {
      if (type === "table" || type === "heading" || content.length > 0) {
        count += 1;
      }
    }
    for (const value of Object.values(rec)) {
      if (value && typeof value === "object") visit(value);
    }
  };
  visit(node);
  return count;
}
