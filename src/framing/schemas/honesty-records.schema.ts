import { z } from "zod";

import { assumptionValueSchema } from "../../core/schemas/assumption.schema.js";
import {
  assumptionIdSchema,
  identifierSchema,
  objectIdSchema,
} from "../../core/schemas/identity.schema.js";

/**
 * Cheap earliest-cause family (spec §35). This slice uses a subset only;
 * it is not the full diagnostic catalog.
 */
export const honestyDiagnosticFamilySchema = z.enum([
  "READ_GAP",
  "CALCULATOR_GAP",
  "FORBIDDEN_ASSUMPTION",
]);

/**
 * Property-level Unresolved (spec §10, §34). Localized visibility, not a
 * global pipeline block and not canCalculate / blockingStatus.
 */
export const unresolvedRecordSchema = z.object({
  id: identifierSchema,
  physicalId: objectIdSchema,
  propertyPath: z.string().trim().min(1),
  reasonCode: z.string().trim().min(1),
  diagnosticFamily: honestyDiagnosticFamilySchema,
  explanation: z.string().trim().min(1),
});

/**
 * Review for an active governed assumption that needs visibility (spec §33).
 * The assumed value remains the usable active value.
 */
export const reviewRecordSchema = z.object({
  id: identifierSchema,
  physicalId: objectIdSchema,
  propertyPath: z.string().trim().min(1),
  reasonCode: z.string().trim().min(1),
  assumptionId: assumptionIdSchema,
  assumedValue: assumptionValueSchema,
  status: z.enum(["open", "resolved", "superseded"]).default("open"),
  explanation: z.string().trim().min(1),
});

export type HonestyDiagnosticFamily = z.infer<
  typeof honestyDiagnosticFamilySchema
>;
export type UnresolvedRecord = z.infer<typeof unresolvedRecordSchema>;
export type ReviewRecord = z.infer<typeof reviewRecordSchema>;
