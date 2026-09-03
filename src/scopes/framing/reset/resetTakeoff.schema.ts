import { z } from "zod";

export const resetMaterialDomainSchema = z.enum([
  "wall",
  "opening",
  "structural",
  "floor",
  "roof",
  "sheathing",
  "fastener",
]);

export const resetMaterialLineSchema = z.object({
  description: z.string().trim().min(1),
  quantity: z.number().finite().positive(),
  unit: z.string().trim().min(1),
  category: z.string().trim().min(1).optional(),
  domain: resetMaterialDomainSchema.optional(),
  quantityKey: z.string().trim().min(1).optional(),
  assumptionUsed: z.boolean().optional(),
  assumptionNote: z.string().trim().min(1).optional(),
  debugSourceIds: z.array(z.string()).optional(),
});

export const resetAssumptionDebugSchema = z.object({
  id: z.string().trim().min(1).optional(),
  summary: z.string().trim().min(1),
  quantityKeys: z.array(z.string()).optional(),
});

export const resetTakeoffMetaSchema = z.object({
  wallCount: z.number().int().nonnegative().optional(),
  openingCount: z.number().int().nonnegative().optional(),
  structuralMemberCount: z.number().int().nonnegative().optional(),
  floorSystemCount: z.number().int().nonnegative().optional(),
  floorAreaCount: z.number().int().nonnegative().optional(),
  roofSystemCount: z.number().int().nonnegative().optional(),
  roofPlaneCount: z.number().int().nonnegative().optional(),
  sheathingSystemCount: z.number().int().nonnegative().optional(),
  sheathingAreaCount: z.number().int().nonnegative().optional(),
  materialCount: z.number().int().nonnegative().optional(),
});

export const resetTakeoffSchema = z.object({
  schemaVersion: z.literal(1),
  projectId: z.string().trim().min(1),
  pdfPath: z.string().trim().min(1),
  createdAt: z.string().datetime(),
  materials: z.array(resetMaterialLineSchema),
  assumptions: z.array(resetAssumptionDebugSchema).optional(),
  meta: resetTakeoffMetaSchema.optional(),
});

export type ResetMaterialDomain = z.infer<typeof resetMaterialDomainSchema>;
export type ResetMaterialLine = z.infer<typeof resetMaterialLineSchema>;
export type ResetAssumptionDebug = z.infer<typeof resetAssumptionDebugSchema>;
export type ResetTakeoff = z.infer<typeof resetTakeoffSchema>;
