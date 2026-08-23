import { z } from "zod";

export const phase0DecisionSchema = z.enum([
  "DIRECT_OCR",
  "ENCLOSURE_OCR",
  "LEADER_CALLOUT",
  "VECTOR_GLYPH",
  "SCHEDULE_REFERENCE",
  "HYBRID",
  "STOP",
]);

export type Phase0Decision = z.infer<typeof phase0DecisionSchema>;

export const encodingClassSchema = z.enum([
  "A-native-text",
  "B-run-adjacent-graphical-text",
  "C-enclosed-bubbled",
  "D-leader-callout",
  "E-vector-glyph",
  "F-schedule-reference",
  "G-other-convention",
  "H-no-usable-mark",
]);

export type EncodingClass = z.infer<typeof encodingClassSchema>;

export const candidateStrategySchema = z.enum([
  "run-band",
  "enclosure-interior",
  "leader-endpoint",
  "native-text",
]);

export type CandidateStrategy = z.infer<typeof candidateStrategySchema>;

export const strategyTrialMetricsSchema = z.object({
  strategy: candidateStrategySchema,
  candidateRegionsGenerated: z.number().int().nonnegative(),
  ocrCallsRequired: z.number().int().nonnegative(),
  marksRecovered: z.number().int().nonnegative(),
  typeIdentifierRecovered: z.number().int().nonnegative(),
  recoveredSamples: z.array(
    z.object({
      rawText: z.string(),
      normalizedKey: z.string(),
      regionKind: z.string(),
    }),
  ),
});

export type StrategyTrialMetrics = z.infer<typeof strategyTrialMetricsSchema>;
