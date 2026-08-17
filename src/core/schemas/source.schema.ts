import { z } from "zod";

import { identifierSchema } from "./identity.schema.js";

/**
 * Identifies a page within a source document or plan set.
 *
 * Nullable sheet metadata allows the engine to preserve a page reference
 * even when sheet identification has not yet been resolved.
 */
export const sourcePageSchema = z.object({
  documentId: identifierSchema.nullable().default(null),
  pageNumber: z.number().int().positive(),
  sheetId: z.string().trim().min(1).nullable().default(null),
  sheetTitle: z.string().trim().min(1).nullable().default(null),
  pageLabel: z.string().trim().min(1).nullable().default(null),
  revision: z.string().trim().min(1).nullable().default(null),
});

/**
 * Describes the coordinate system used by a source-region locator.
 */
export const sourceCoordinateSpaceSchema = z.enum([
  "normalized",
  "pdf-points",
  "pixels",
]);

/**
 * Locates evidence within a source page.
 *
 * A normalized region uses values from 0 through 1.
 * PDF-point and pixel regions use source-native coordinates.
 */
export const sourceRegionSchema = z
  .object({
    coordinateSpace: sourceCoordinateSpaceSchema,
    x: z.number().nonnegative(),
    y: z.number().nonnegative(),
    width: z.number().positive(),
    height: z.number().positive(),
  })
  .superRefine((region, context) => {
    if (region.coordinateSpace !== "normalized") {
      return;
    }

    const values = [
      region.x,
      region.y,
      region.width,
      region.height,
      region.x + region.width,
      region.y + region.height,
    ];

    if (values.some((value) => value > 1)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Normalized source-region coordinates must remain between 0 and 1.",
      });
    }
  });

/**
 * Identifies a precise location within project source material.
 */
export const sourceLocationSchema = z.object({
  page: sourcePageSchema,
  region: sourceRegionSchema.nullable().default(null),
  elementLabel: z.string().trim().min(1).nullable().default(null),
  detailNumber: z.string().trim().min(1).nullable().default(null),
  sectionNumber: z.string().trim().min(1).nullable().default(null),
  scheduleName: z.string().trim().min(1).nullable().default(null),
  noteReference: z.string().trim().min(1).nullable().default(null),
});

/**
 * Classification for a reference found in project source material.
 */
export const sourceReferenceTypeSchema = z.enum([
  "sheet",
  "detail",
  "section",
  "schedule",
  "note",
  "callout",
  "specification",
  "manufacturer-document",
  "other",
]);

/**
 * Preserves a cross-reference found in the source documents.
 *
 * Resolution status belongs in the consuming object or validation result,
 * not in the source-reference record itself.
 */
export const sourceReferenceSchema = z.object({
  type: sourceReferenceTypeSchema,
  originalText: z.string().trim().min(1),
  target: sourceLocationSchema.nullable().default(null),
  description: z.string().trim().min(1).nullable().default(null),
});

export type SourcePage = z.infer<typeof sourcePageSchema>;
export type SourceCoordinateSpace = z.infer<
  typeof sourceCoordinateSpaceSchema
>;
export type SourceRegion = z.infer<typeof sourceRegionSchema>;
export type SourceLocation = z.infer<typeof sourceLocationSchema>;
export type SourceReferenceType = z.infer<
  typeof sourceReferenceTypeSchema
>;
export type SourceReference = z.infer<typeof sourceReferenceSchema>;