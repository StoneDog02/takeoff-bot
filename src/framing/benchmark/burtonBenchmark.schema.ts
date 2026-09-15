import { z } from "zod";

/**
 * Downstream Burton benchmark fixture only.
 * Do not import this module from read / resolve / calculate / runFramingTakeoff.
 */

export const BURTON_BENCHMARK_ID = "beckstead-burton-benchmark-v1" as const;
export const BURTON_BENCHMARK_SOURCE_FILE =
  "benchmarks/beckstead/source/burton-takeoff.pdf" as const;

export const burtonQuantityLayerSchema = z.enum([
  "procurement_stock_ea",
  "procurement_lf",
  "package_lump",
  "out_of_framing_scope",
]);

export const burtonEngineJoinSchema = z.object({
  quantityKeys: z.array(z.string().trim().min(1)).min(1),
  canonicalClassificationPrefix: z.string().trim().min(1).optional(),
  unit: z.string().trim().min(1),
  note: z.string().trim().min(1),
});

export const burtonBenchmarkItemSchema = z.object({
  benchmarkItemId: z.string().trim().min(1),
  pdfPage: z.number().int().positive(),
  lineNumber: z.number().int().positive(),
  section: z.string().trim().min(1),
  originalDescription: z.string().trim().min(1),
  originalQuantity: z.number().finite().nonnegative(),
  originalUnit: z.string().trim().min(1),
  productCode: z.string().trim().min(1),
  originalTally: z.string().trim().min(1).nullable(),
  unitPrice: z.number().finite().nonnegative().nullable(),
  extendedPrice: z.number().finite().nonnegative().nullable(),
  pricingUnit: z.string().trim().min(1).nullable(),
  normalizedFamily: z.string().trim().min(1),
  normalizedSpec: z.string().trim().min(1).nullable(),
  comparisonUnit: z.string().trim().min(1),
  comparisonKey: z.string().trim().min(1),
  quantityLayer: burtonQuantityLayerSchema,
  inFramingEngineScope: z.boolean(),
  comparisonEligible: z.boolean(),
  engineJoin: burtonEngineJoinSchema.nullable(),
  normalizationNotes: z.string().trim().min(1),
});

export const burtonBenchmarkFixtureSchema = z.object({
  benchmarkId: z.literal(BURTON_BENCHMARK_ID),
  benchmarkVersion: z.string().trim().min(1),
  status: z.enum(["freeze-candidate", "frozen"]),
  frozenAt: z.string().datetime().nullable(),
  sourceFile: z.literal(BURTON_BENCHMARK_SOURCE_FILE),
  quoteNumber: z.string().trim().min(1),
  quoteDate: z.string().trim().min(1),
  customer: z.string().trim().min(1),
  disclaimer: z.string().trim().min(1),
  quoteTotals: z.object({
    totalAmount: z.number().finite().nonnegative(),
    salesTax: z.number().finite().nonnegative(),
    quotationTotal: z.number().finite().nonnegative(),
    notes: z.string().trim().min(1),
  }),
  scopePolicy: z.string().trim().min(1),
  eligibilityPolicy: z.string().trim().min(1),
  items: z.array(burtonBenchmarkItemSchema).min(1),
});

export type BurtonQuantityLayer = z.infer<typeof burtonQuantityLayerSchema>;
export type BurtonEngineJoin = z.infer<typeof burtonEngineJoinSchema>;
export type BurtonBenchmarkItem = z.infer<typeof burtonBenchmarkItemSchema>;
export type BurtonBenchmarkFixture = z.infer<
  typeof burtonBenchmarkFixtureSchema
>;
