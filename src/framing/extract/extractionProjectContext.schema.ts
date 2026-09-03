import { z } from "zod";

export const extractionProjectContextBindingSchema = z.object({
  physicalRunKey: z.string().trim().min(1),
  referenceKey: z.string().trim().min(1),
  mechanism: z.string().trim().min(1),
  sourcePage: z.number().int().positive(),
});

export const extractionProjectContextNoteSchema = z.object({
  pageNumber: z.number().int().positive(),
  noteReference: z.string().trim().min(1).nullable(),
  summaryText: z.string().trim().min(1),
});

export const extractionProjectContextKnownDefinitionSchema = z.object({
  semanticTypeKey: z.string().trim().min(1),
  definitionKind: z.string().trim().min(1),
  properties: z.record(z.string(), z.string()),
  sourcePage: z.number().int().positive(),
  validationStatus: z.literal("validated"),
});

export type ExtractionProjectContextKnownDefinition = z.infer<
  typeof extractionProjectContextKnownDefinitionSchema
>;

export const extractionProjectContextSchema = z.object({
  intent: z.string().trim().min(1),
  bundlePageNumbers: z.array(z.number().int().positive()),
  knownSystemTags: z.array(z.string().trim().min(1)),
  knownAreaTags: z.array(z.string().trim().min(1)),
  dictionaryBindings: z.array(extractionProjectContextBindingSchema),
  crossPageNotes: z.array(extractionProjectContextNoteSchema),
  knownDefinitions: z
    .array(extractionProjectContextKnownDefinitionSchema)
    .default([]),
  contextDisclaimer: z.literal("CONTEXT ONLY — not plan evidence"),
});

export type ExtractionProjectContext = z.infer<
  typeof extractionProjectContextSchema
>;

export const extractionProjectContextAuditSchema = z.object({
  contextSliceHash: z.string().trim().min(1),
  contextBindingCount: z.number().int().nonnegative(),
  contextNoteCount: z.number().int().nonnegative(),
  contextInjected: z.boolean(),
});

export type ExtractionProjectContextAudit = z.infer<
  typeof extractionProjectContextAuditSchema
>;
