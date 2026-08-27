import { z } from "zod";

export const packageProductionStateSchema = z.enum([
  "WIRED",
  "DOMAIN_PIPELINE_UNWIRED",
  "NOT_REACHED",
]);

export const firstBrokenHandoffSchema = z.enum([
  "NOT_DISCOVERED",
  "DISCOVERED_NOT_PERSISTED",
  "PERSISTED_NOT_ROUTED",
  "ROUTED_NOT_EXTRACTED",
  "EVIDENCE_NOT_MATERIALIZED",
  "MATERIALIZED_NOT_RESOLVED",
  "RESOLVED_NOT_VALIDATED",
  "VALIDATED_NOT_ASSUMED",
  "ASSUMPTION_PATH_NOT_EXERCISED",
  "CALCULATOR_STARVED",
  "CALCULATOR_UNWIRED",
  "REPORTING_GAP",
  "DOMAIN_PIPELINE_UNWIRED",
  "TRUE_SOURCE_AUTHORITY_GAP",
]);

export const packageProductStateRowSchema = z.object({
  package: z.string().trim().min(1),
  productionState: packageProductionStateSchema,
  detected: z.union([z.number().int().nonnegative(), z.literal("N/A")]),
  evidence: z.union([z.number().int().nonnegative(), z.literal("N/A")]),
  materialized: z.union([z.number().int().nonnegative(), z.literal("N/A")]),
  resolved: z.union([z.number().int().nonnegative(), z.literal("N/A")]),
  assumed: z.union([z.number().int().nonnegative(), z.literal("N/A")]),
  calcEligible: z.union([z.number().int().nonnegative(), z.literal("N/A")]),
  calculatorReady: z
    .union([z.number().int().nonnegative(), z.literal("N/A")])
    .optional(),
  materialLines: z
    .union([z.number().int().nonnegative(), z.literal("N/A")])
    .optional(),
  productFunnel: z
    .object({
      areas: z.number().int().nonnegative(),
      parentLinked: z.number().int().nonnegative(),
      calculatorReady: z.number().int().nonnegative(),
      calculatedAreas: z.number().int().nonnegative(),
      stage14MaterialLines: z.number().int().nonnegative(),
      stage16MaterialLines: z.number().int().nonnegative(),
    })
    .optional(),
  confidence: z.union([z.number().int().nonnegative(), z.literal("N/A")]),
  review: z.union([z.number().int().nonnegative(), z.literal("N/A")]),
  stage16Lines: z.union([z.number().int().nonnegative(), z.literal("N/A")]),
  firstBrokenHandoff: firstBrokenHandoffSchema.nullable(),
});

export const framingPackageProductStateSchema = z.object({
  runLabel: z.string().trim().min(1),
  capturedAt: z.string().datetime(),
  evidence: z.object({
    totalCount: z.number().int().nonnegative(),
    bySubjectKind: z.record(z.string(), z.number().int().nonnegative()),
    byProvenance: z.record(z.string(), z.number().int().nonnegative()),
  }),
  extraction: z.object({
    intentsExecuted: z.array(z.string()),
    pagesByIntent: z.record(z.string(), z.array(z.number().int().positive())),
    brainPacksByIntent: z.record(z.string(), z.array(z.string())),
  }),
  planReference: z.object({
    discovered: z.number().int().nonnegative(),
    queued: z.number().int().nonnegative(),
    followed: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
  }),
  assumptions: z.object({
    count: z.number().int().nonnegative(),
  }),
  review: z.object({
    rawReviewItemCount: z.number().int().nonnegative(),
    activeReviewItems: z.number().int().nonnegative(),
    primaryQueueCount: z.number().int().nonnegative().nullable(),
  }),
  stage16: z.object({
    materialLineCount: z.number().int().nonnegative(),
    quantitiesByPackage: z.record(z.string(), z.number()),
  }),
  packages: z.array(packageProductStateRowSchema),
});

export type FramingPackageProductState = z.infer<
  typeof framingPackageProductStateSchema
>;
export type PackageProductStateRow = z.infer<
  typeof packageProductStateRowSchema
>;
export type FirstBrokenHandoff = z.infer<typeof firstBrokenHandoffSchema>;
