import { z } from "zod";

import {
  assumptionIdSchema,
  identifierSchema,
  objectIdSchema,
  reviewItemIdSchema,
} from "../../../core/schemas/identity.schema.js";

export const framingMaterialCategorySchema = z.enum([
  "lumber",
  "engineered-wood",
  "structural-panel",
  "truss",
  "structural-steel",
  "blocking",
  "connector",
  "fastener",
  "hardware",
  "miscellaneous",
  "unknown",
]);

export const materialQuantityUnitSchema = z.enum([
  "each",
  "linear-foot",
  "square-foot",
  "sheet",
  "board-foot",
  "pound",
]);

export const framingMaterialLineItemSchema = z.object({
  id: identifierSchema,
  category: framingMaterialCategorySchema,
  description: z.string().trim().min(1),
  canonicalClassification: z.string().trim().min(1),
  quantity: z.number().finite().positive(),
  unit: materialQuantityUnitSchema,
  sourceObjectIds: z.array(objectIdSchema).min(1),
  assumptionIds: z.array(assumptionIdSchema).default([]),
  reviewItemIds: z.array(reviewItemIdSchema).default([]),
});

export type FramingMaterialCategory = z.infer<
  typeof framingMaterialCategorySchema
>;
export type MaterialQuantityUnit = z.infer<
  typeof materialQuantityUnitSchema
>;
export type FramingMaterialLineItem = z.infer<
  typeof framingMaterialLineItemSchema
>;
