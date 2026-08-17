import { z } from "zod";

import {
  artifactIdSchema,
  evidenceIdSchema,
  objectIdSchema,
  pipelineRunIdSchema,
  reviewItemIdSchema,
  validationIssueIdSchema,
  validationResultIdSchema,
} from "./identity.schema.js";
import { sourceLocationSchema } from "./source.schema.js";

export const validationSeveritySchema = z.enum([
  "info",
  "warning",
  "critical",
  "blocking",
]);

export const validationLevelSchema = z.enum([
  "page",
  "sheet-catalog",
  "extraction",
  "object",
  "relationship",
  "assembly",
  "cross-sheet",
  "material",
  "assumption",
  "calculation",
  "output",
]);

export const validationTargetSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("object"),
    objectId: objectIdSchema,
    objectType: z.string().trim().min(1),
  }),
  z.object({
    kind: z.literal("artifact"),
    artifactId: artifactIdSchema,
    artifactType: z.string().trim().min(1),
  }),
  z.object({
    kind: z.literal("pipeline"),
    pipelineRunId: pipelineRunIdSchema,
  }),
]);

export const validationQuantityImpactSchema = z.object({
  quantityKey: z.string().trim().min(1).nullable().default(null),
  description: z.string().trim().min(1),
  canCalculate: z.boolean(),
});

function hasDuplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

export const validationIssueSchema = z
  .object({
    id: validationIssueIdSchema,
    severity: validationSeveritySchema,
    level: validationLevelSchema,
    ruleId: z.string().trim().min(1),
    ruleViolated: z.string().trim().min(1),
    explanation: z.string().trim().min(1),
    recommendedUserAction: z.string().trim().min(1).nullable().default(null),
    target: validationTargetSchema,
    sourceLocations: z.array(sourceLocationSchema).default([]),
    evidenceIds: z.array(evidenceIdSchema).default([]),
    quantityImpacts: z.array(validationQuantityImpactSchema).default([]),
    reviewItemIds: z.array(reviewItemIdSchema).default([]),
  })
  .superRefine((issue, context) => {
    if (hasDuplicates(issue.evidenceIds)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["evidenceIds"],
        message: "evidenceIds must not contain duplicate IDs.",
      });
    }

    if (hasDuplicates(issue.reviewItemIds)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reviewItemIds"],
        message: "reviewItemIds must not contain duplicate IDs.",
      });
    }

    if (
      issue.severity === "blocking" &&
      issue.quantityImpacts.length > 0 &&
      issue.quantityImpacts.every((impact) => impact.canCalculate)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["quantityImpacts"],
        message:
          "A blocking validation issue must block at least one affected quantity.",
      });
    }
  });

export const validationOutcomeSchema = z.enum([
  "passed",
  "failed",
  "skipped",
]);

export const validationResultSchema = z
  .object({
    id: validationResultIdSchema,
    ruleId: z.string().trim().min(1),
    level: validationLevelSchema,
    target: validationTargetSchema,
    outcome: validationOutcomeSchema,
    explanation: z.string().trim().min(1),
    validationIssueIds: z.array(validationIssueIdSchema).default([]),
    evidenceIds: z.array(evidenceIdSchema).default([]),
  })
  .superRefine((result, context) => {
    if (result.outcome === "passed" && result.validationIssueIds.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["validationIssueIds"],
        message: "A passed validation result cannot reference issues.",
      });
    }

    if (result.outcome === "failed" && result.validationIssueIds.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["validationIssueIds"],
        message: "A failed validation result must reference at least one issue.",
      });
    }

    if (hasDuplicates(result.validationIssueIds)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["validationIssueIds"],
        message: "validationIssueIds must not contain duplicate IDs.",
      });
    }

    if (hasDuplicates(result.evidenceIds)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["evidenceIds"],
        message: "evidenceIds must not contain duplicate IDs.",
      });
    }
  });

export type ValidationSeverity = z.infer<typeof validationSeveritySchema>;
export type ValidationLevel = z.infer<typeof validationLevelSchema>;
export type ValidationTarget = z.infer<typeof validationTargetSchema>;
export type ValidationQuantityImpact = z.infer<
  typeof validationQuantityImpactSchema
>;
export type ValidationIssue = z.infer<typeof validationIssueSchema>;
export type ValidationOutcome = z.infer<typeof validationOutcomeSchema>;
export type ValidationResult = z.infer<typeof validationResultSchema>;
