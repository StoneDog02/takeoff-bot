import { z } from "zod";

import { semanticTextCategorySchema } from "../type-marks/classifySemanticTextCandidate.js";
import { phase0DecisionSchema } from "./phase0Decision.schema.js";

export const semanticMarkObservationKindSchema = z.enum([
  "text-identifier",
  "enclosed-identifier",
  "leader-callout",
  "symbol",
  "schedule-reference",
  "unknown",
]);

export const semanticMarkRecoveryMethodSchema = z.enum([
  "native-text",
  "localized-ocr",
  "vector-glyph",
  "convention-detect",
]);

export const semanticMarkObservationSchema = z.object({
  observationId: z.string().trim().min(1),
  pageNumber: z.number().int().positive(),
  observationKind: semanticMarkObservationKindSchema,
  rawText: z.string().nullable(),
  normalizedKey: z.string().nullable(),
  semanticTextCategory: z.enum(semanticTextCategorySchema).nullable(),
  recoveryMethod: semanticMarkRecoveryMethodSchema,
  recoveryConfidence: z.number().nullable(),
  bbox: z.object({
    x0: z.number(),
    y0: z.number(),
    x1: z.number(),
    y1: z.number(),
  }),
  mid: z.object({ x: z.number(), y: z.number() }),
  orientation: z.enum(["H", "V", "unknown"]),
  provenance: z.object({
    candidateRegionId: z.string(),
    candidateRegionKind: z.string(),
    cropPath: z.string().nullable(),
    sourceSegmentIds: z.array(z.number().int()),
  }),
  enclosure: z
    .object({
      id: z.string(),
      bbox: z.object({
        x0: z.number(),
        y0: z.number(),
        x1: z.number(),
        y1: z.number(),
      }),
      segmentIds: z.array(z.number().int()),
    })
    .nullable(),
  leader: z
    .object({
      id: z.string(),
      from: z.object({ x: z.number(), y: z.number() }),
      to: z.object({ x: z.number(), y: z.number() }),
      segmentIds: z.array(z.number().int()),
    })
    .nullable(),
  visualDescription: z.string().nullable(),
});

export const candidateRegionAuditSchema = z.object({
  id: z.string(),
  kind: z.string(),
  strategy: z.string(),
  bbox: z.object({
    x0: z.number(),
    y0: z.number(),
    x1: z.number(),
    y1: z.number(),
  }),
  ocrAttempted: z.boolean(),
  ocrResolved: z.boolean(),
  recoveredText: z.string().nullable(),
});

export const semanticMarkRecoveryMetricsSchema = z.object({
  candidateRegionsGenerated: z.number().int().nonnegative(),
  ocrCallsRequired: z.number().int().nonnegative(),
  marksRecovered: z.number().int().nonnegative(),
  typeIdentifierRecovered: z.number().int().nonnegative(),
  candidatePrecisionEstimate: z.number().nonnegative().nullable(),
  markRecoveryFailures: z.number().int().nonnegative(),
  ownershipFailures: z.number().int().nonnegative(),
  timingMs: z.number().nonnegative(),
});

export const semanticMarkRecoveryBlockSchema = z.object({
  phase0Decision: phase0DecisionSchema.nullable(),
  observations: z.array(semanticMarkObservationSchema),
  candidateRegions: z.array(candidateRegionAuditSchema),
  metrics: semanticMarkRecoveryMetricsSchema,
});

export type SemanticMarkObservation = z.infer<typeof semanticMarkObservationSchema>;
export type CandidateRegionAudit = z.infer<typeof candidateRegionAuditSchema>;
export type SemanticMarkRecoveryBlock = z.infer<typeof semanticMarkRecoveryBlockSchema>;
