import { z } from "zod";

export const semanticDefinitionKindSchema = z.enum([
  "shear-wall",
  "wall-type",
  "header",
  "holdown",
  "unknown",
]);

export const semanticDefinitionPropertySchema = z.object({
  propertyPath: z.string().trim().min(1),
  rawText: z.string(),
  candidateValue: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  cellBbox: z
    .object({
      x0: z.number(),
      y0: z.number(),
      x1: z.number(),
      y1: z.number(),
    })
    .optional(),
});

export const semanticDefinitionSchema = z.object({
  definitionId: z.string().trim().min(1),
  semanticTypeKey: z.string().trim().min(1),
  definitionKind: semanticDefinitionKindSchema,
  sourcePageNumber: z.number().int().positive(),
  sourceRegion: z.object({
    x0: z.number(),
    y0: z.number(),
    x1: z.number(),
    y1: z.number(),
  }),
  properties: z.array(semanticDefinitionPropertySchema),
  provenance: z.object({
    extractionMethod: z.enum([
      "vector-grid-ocr",
      "img2table-ocr",
      "band-ocr-audit",
      "row-band-ocr",
      "project-learning",
    ]),
    columnHeaders: z.array(z.string()).optional(),
    rowIndex: z.number().int().nonnegative().optional(),
  }),
});

export const semanticDefinitionBlockSchema = z.object({
  definitions: z.array(semanticDefinitionSchema),
  metrics: z.object({
    rowsExtracted: z.number().int().nonnegative(),
    keysRecovered: z.number().int().nonnegative(),
    propertiesRecovered: z.number().int().nonnegative(),
    timingMs: z.number().nonnegative(),
  }),
});

export type SemanticDefinition = z.infer<typeof semanticDefinitionSchema>;
export type SemanticDefinitionBlock = z.infer<typeof semanticDefinitionBlockSchema>;
