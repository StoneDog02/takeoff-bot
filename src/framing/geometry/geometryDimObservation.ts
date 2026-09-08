import { z } from "zod";

export const geometryDimBboxSchema = z.object({
  x0: z.number(),
  y0: z.number(),
  x1: z.number(),
  y1: z.number(),
});

export const geometryDimObservationSchema = z.object({
  id: z.string().trim().min(1),
  pageNumber: z.number().int().positive(),
  parsedFeet: z.number().finite().positive(),
  orientation: z.enum(["H", "V", "unknown"]),
  bbox: geometryDimBboxSchema.nullable(),
  associatedRunKey: z.string().trim().min(1).nullable(),
  nearbyText: z.array(z.string()),
  rawText: z.string(),
});

export type GeometryDimObservation = z.infer<typeof geometryDimObservationSchema>;
