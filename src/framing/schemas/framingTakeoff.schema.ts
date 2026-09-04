import { z } from "zod";

export const framingMaterialDomainSchema = z.enum([
  "wall",
  "opening",
  "structural",
  "floor",
  "roof",
  "sheathing",
  "fastener",
]);

export const framingMaterialLineSchema = z.object({
  material: z.string().trim().min(1),
  lengthOrType: z.string().trim().min(1).nullable(),
  description: z.string().trim().min(1),
  quantity: z.number().finite().positive(),
  unit: z.string().trim().min(1),
  category: z.string().trim().min(1).optional(),
  domain: framingMaterialDomainSchema.optional(),
  quantityKey: z.string().trim().min(1).optional(),
  canonicalClassification: z.string().trim().min(1).optional(),
  assumptionUsed: z.boolean().optional(),
  assumptionNote: z.string().trim().min(1).optional(),
  debugSourceIds: z.array(z.string()).optional(),
});

export const framingAssumptionDebugSchema = z.object({
  id: z.string().trim().min(1).optional(),
  summary: z.string().trim().min(1),
  quantityKeys: z.array(z.string()).optional(),
});

export const framingTakeoffMetaSchema = z.object({
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

export const framingTakeoffSchema = z.object({
  schemaVersion: z.literal(2),
  projectId: z.string().trim().min(1),
  pdfPath: z.string().trim().min(1),
  createdAt: z.string().datetime(),
  materials: z.array(framingMaterialLineSchema),
  assumptions: z.array(framingAssumptionDebugSchema).optional(),
  meta: framingTakeoffMetaSchema.optional(),
});

export type FramingMaterialDomain = z.infer<typeof framingMaterialDomainSchema>;
export type FramingMaterialLine = z.infer<typeof framingMaterialLineSchema>;
export type FramingAssumptionDebug = z.infer<typeof framingAssumptionDebugSchema>;
export type FramingTakeoff = z.infer<typeof framingTakeoffSchema>;
