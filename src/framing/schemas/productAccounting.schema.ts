import { z } from "zod";

export const productAccountingStatusSchema = z.enum([
  "calculated",
  "unaccounted",
]);

export const productAccountingGapClassSchema = z.enum([
  "applicability_unestablished",
  "read_or_input_gap",
  "calculator_gap",
]);

export const productAccountingEntrySchema = z.object({
  taxonomySection: z.string().trim().min(1),
  taxonomySectionTitle: z.string().trim().min(1),
  taxonomyItemId: z.string().trim().min(1),
  label: z.string().trim().min(1),
  status: productAccountingStatusSchema,
  gapClass: productAccountingGapClassSchema.optional(),
  notes: z.string().trim().min(1).optional(),
  matchedQuantityKeys: z.array(z.string()).optional(),
  matchedMaterialIndexes: z.array(z.number().int().nonnegative()).optional(),
  domainSignalSummary: z.string().trim().min(1).optional(),
});

export const productAccountingSchema = z.object({
  schemaVersion: z.literal(1),
  projectId: z.string().trim().min(1),
  createdAt: z.string().datetime(),
  entries: z.array(productAccountingEntrySchema),
  summary: z.object({
    checklistItemCount: z.number().int().nonnegative(),
    calculatedCount: z.number().int().nonnegative(),
    unaccountedCount: z.number().int().nonnegative(),
    byGapClass: z.object({
      applicability_unestablished: z.number().int().nonnegative(),
      read_or_input_gap: z.number().int().nonnegative(),
      calculator_gap: z.number().int().nonnegative(),
    }),
  }),
});

export type ProductAccountingStatus = z.infer<
  typeof productAccountingStatusSchema
>;
export type ProductAccountingGapClass = z.infer<
  typeof productAccountingGapClassSchema
>;
export type ProductAccountingEntry = z.infer<
  typeof productAccountingEntrySchema
>;
export type ProductAccounting = z.infer<typeof productAccountingSchema>;
