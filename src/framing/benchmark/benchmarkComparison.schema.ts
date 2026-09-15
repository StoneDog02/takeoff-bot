import { z } from "zod";

import { burtonEngineJoinSchema } from "./burtonBenchmark.schema.js";

/**
 * Downstream benchmark comparison result only.
 * Do not import this module from read / resolve / calculate / runFramingTakeoff.
 */

export const comparisonStatusSchema = z.enum([
  "MATCH",
  "WITHIN TARGET — OURS HIGH",
  "WITHIN TARGET — OURS LOW",
  "OUTSIDE TOLERANCE — OURS HIGH",
  "OUTSIDE TOLERANCE — OURS LOW",
  "MISSING OURS",
  "OURS ONLY",
  "UNRESOLVED",
  "NOT COMPARABLE",
]);

export const comparisonGateSchema = z.enum([
  "pass",
  "fail",
  "not_evaluated",
]);

export const comparisonDiagnosticClassSchema = z.enum([
  "READ investigation/path failure",
  "READ exhausted — Unresolved",
  "READ cross-sheet binding failure",
  "Materialization gap",
  "HOUSE Unresolved",
  "CALC missing capability",
  "CALC discrepancy",
  "S5 missing",
  "Defensible disagreement",
  "OURS ONLY",
  "NOT COMPARABLE",
]);

export const comparisonS5StatusSchema = z.enum([
  "not_implemented",
  "not_applicable",
]);

export const comparisonOursSideSchema = z.object({
  material: z.string().trim().min(1).nullable(),
  canonicalClassification: z.string().trim().min(1).nullable(),
  quantity: z.number().finite().nullable(),
  unit: z.string().trim().min(1).nullable(),
  quantityKey: z.string().trim().min(1).nullable(),
});

export const comparisonBurtonSideSchema = z.object({
  benchmarkItemId: z.string().trim().min(1),
  section: z.string().trim().min(1),
  originalDescription: z.string().trim().min(1),
  originalQuantity: z.number().finite().nonnegative(),
  originalUnit: z.string().trim().min(1),
  normalizedFamily: z.string().trim().min(1),
  normalizedSpec: z.string().trim().min(1).nullable(),
  quantityLayer: z.string().trim().min(1),
  comparisonEligible: z.boolean(),
  comparisonUnit: z.string().trim().min(1),
});

export const provenanceHopStatusSchema = z.enum([
  "joined",
  "unavailable",
  "partial",
  "not_applicable",
]);

export const explanationReadCompleteFieldSchema = z.object({
  conditionId: z.string().trim().min(1),
  propertyPath: z.string().trim().min(1),
  status: z.enum([
    "established",
    "unresolved-after-read",
    "unattempted",
    "not-applicable",
  ]),
  attemptedPaths: z.array(
    z.object({
      pathKind: z.string().trim().min(1),
      wasAttempted: z.boolean(),
    }),
  ),
});

export const explanationUnresolvedRecordSchema = z.object({
  physicalId: z.string().trim().min(1),
  propertyPath: z.string().trim().min(1),
  reasonCode: z.string().trim().min(1),
  diagnosticFamily: z.string().trim().min(1),
});

export const explanationProvenanceHopsSchema = z.object({
  takeoffLine: provenanceHopStatusSchema,
  construction: provenanceHopStatusSchema,
  physicalId: provenanceHopStatusSchema,
  traces: provenanceHopStatusSchema,
  evidencePages: provenanceHopStatusSchema,
  readComplete: provenanceHopStatusSchema,
  unresolved: provenanceHopStatusSchema,
  quantityLineage: provenanceHopStatusSchema,
  defensibility: provenanceHopStatusSchema,
});

export const comparisonExplanationRefSchema = z.object({
  whatWeReturned: z.string().trim().min(1),
  burtonCompare: z.string().trim().min(1),
  evidencePages: z.array(z.number().int().positive()),
  unresolved: z.array(z.string()),
  provenanceIncomplete: z.boolean(),
  explanationText: z.string().trim().min(1),
  relatedNotCompared: z.boolean().optional(),
  debugSourceIds: z.array(z.string()).optional(),
  physicalIds: z.array(z.string()).optional(),
  evidenceIds: z.array(z.string()).optional(),
  houseTraceMethods: z.array(z.string()).optional(),
  assumptionIds: z.array(z.string()).optional(),
  calcStatus: z.enum(["emitted", "not_emitted", "unknown"]).optional(),
  calcIdentity: z.string().nullable().optional(),
  quantityLineageComplete: z.boolean().optional(),
  defensibilityEvidenceComplete: z.boolean().optional(),
  readCompleteFields: z.array(explanationReadCompleteFieldSchema).optional(),
  unresolvedRecords: z.array(explanationUnresolvedRecordSchema).optional(),
  hops: explanationProvenanceHopsSchema.optional(),
});

export const benchmarkComparisonRowSchema = z.object({
  status: comparisonStatusSchema,
  burton: comparisonBurtonSideSchema.nullable(),
  ours: comparisonOursSideSchema.nullable(),
  absDelta: z.number().finite().nullable(),
  pctDelta: z.number().finite().nullable(),
  quantityLayerGate: comparisonGateSchema,
  unitGate: comparisonGateSchema,
  scopeGate: comparisonGateSchema,
  engineJoinUsed: burtonEngineJoinSchema.nullable(),
  diagnosticClass: comparisonDiagnosticClassSchema.nullable(),
  s5Status: comparisonS5StatusSchema,
  explanationRef: comparisonExplanationRefSchema,
});

const nullablePercentSchema = z.number().finite().nullable();

export const benchmarkGradeSheetSchema = z.object({
  coverage: z.object({
    burtonItemCount: z.number().int().nonnegative(),
    ourLineCount: z.number().int().nonnegative(),
    burtonFramingFamilies: z.array(z.string()),
    notComparable: z.number().int().nonnegative(),
    missingOurs: z.number().int().nonnegative(),
    oursOnly: z.number().int().nonnegative(),
    unresolved: z.number().int().nonnegative(),
  }),
  quantityAgreement: z.object({
    eligibleItemCount: z.number().int().nonnegative(),
    numericComparedCount: z.number().int().nonnegative(),
    match: z.number().int().nonnegative(),
    withinInner3: z.number().int().nonnegative(),
    withinOuter5: z.number().int().nonnegative(),
    outside: z.number().int().nonnegative(),
    oursHigh: z.number().int().nonnegative(),
    oursLow: z.number().int().nonnegative(),
    matchPercent: nullablePercentSchema,
    withinInner3Percent: nullablePercentSchema,
    withinOuter5Percent: nullablePercentSchema,
    outsidePercent: nullablePercentSchema,
    oursHighPercent: nullablePercentSchema,
    oursLowPercent: nullablePercentSchema,
    note: z.string().trim().min(1),
  }),
  explainability: z.object({
    rowsWithProvenanceJoin: z.number().int().nonnegative(),
    provenanceIncompleteCount: z.number().int().nonnegative(),
    s5NotImplementedCount: z.number().int().nonnegative(),
    evidenceJoin: z.enum(["not_joined", "partial", "joined"]),
  }),
});

export const benchmarkComparisonResultSchema = z.object({
  benchmarkId: z.string().trim().min(1),
  benchmarkVersion: z.string().trim().min(1),
  runId: z.string().trim().min(1),
  runKind: z.enum(["synthetic", "live", "replay"]),
  reportingBands: z.object({
    inner: z.number().finite().positive(),
    outer: z.number().finite().positive(),
  }),
  rows: z.array(benchmarkComparisonRowSchema),
  gradeSheet: benchmarkGradeSheetSchema,
});

export type ComparisonStatus = z.infer<typeof comparisonStatusSchema>;
export type ComparisonGate = z.infer<typeof comparisonGateSchema>;
export type ProvenanceHopStatus = z.infer<typeof provenanceHopStatusSchema>;
export type ComparisonDiagnosticClass = z.infer<
  typeof comparisonDiagnosticClassSchema
>;
export type BenchmarkComparisonRow = z.infer<
  typeof benchmarkComparisonRowSchema
>;
export type BenchmarkGradeSheet = z.infer<typeof benchmarkGradeSheetSchema>;
export type BenchmarkComparisonResult = z.infer<
  typeof benchmarkComparisonResultSchema
>;
