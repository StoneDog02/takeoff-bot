import { z } from "zod";

export const extractionWorkUnitAuditSchema = z.object({
  extractionPassId: z.string().trim().min(1),
  bundleId: z.string().trim().min(1),
  intent: z.string().trim().min(1),
  orderedPageNumbers: z.array(z.number().int().positive()),
  primaryPageNumbers: z.array(z.number().int().positive()),
  estimatedImages: z.number().int().nonnegative(),
  maxImages: z.number().int().positive(),
  fullSheetCount: z.number().int().nonnegative(),
  tileCount: z.number().int().nonnegative(),
  pageCount: z.number().int().nonnegative(),
  routingNotes: z.array(z.string()),
  brainPackPaths: z.array(z.string().trim().min(1)).optional(),
});

export const extractionBudgetAuditSchema = z.object({
  scopeName: z.string().trim().min(1),
  intents: z.array(z.string().trim().min(1)),
  maxImagesPerRequest: z.number().int().positive(),
  workUnits: z.array(extractionWorkUnitAuditSchema).min(1),
  totalEstimatedImages: z.number().int().nonnegative(),
  totalWorkUnits: z.number().int().positive(),
});

export type ExtractionWorkUnitAudit = z.infer<typeof extractionWorkUnitAuditSchema>;
export type ExtractionBudgetAudit = z.infer<typeof extractionBudgetAuditSchema>;
