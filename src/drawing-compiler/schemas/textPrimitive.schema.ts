import { z } from "zod";

export const textBBoxSchema = z.object({
  x0: z.number(),
  y0: z.number(),
  x1: z.number(),
  y1: z.number(),
});

export const textPrimitiveSchema = z.object({
  id: z.string().trim().min(1),
  pageNumber: z.number().int().positive(),
  rawText: z.string(),
  bbox: textBBoxSchema,
  transform: z.array(z.number()).optional(),
  orientation: z.enum(["H", "V", "unknown"]),
  sourceAuthority: z.enum(["pdf-text-layer", "localized-ocr"]),
  confidence: z.number().nullable(),
  parseStatus: z.enum(["ok", "unresolved"]),
  parsedFeet: z.number().nullable(),
  provenance: z.object({
    itemIndices: z.array(z.number()).optional(),
    cropPath: z.string().optional(),
    rotationDeg: z.number().optional(),
  }),
  mid: z.object({ x: z.number(), y: z.number() }),
});

export type TextPrimitiveRecord = z.infer<typeof textPrimitiveSchema>;
