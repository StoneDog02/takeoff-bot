import { z } from "zod";

import {
  artifactIdSchema,
  assumptionIdSchema,
  confidenceEvaluationIdSchema,
  evidenceIdSchema,
  objectIdSchema,
  pipelineRunIdSchema,
  reviewItemIdSchema,
  userDecisionIdSchema,
  validationIssueIdSchema,
  validationResultIdSchema,
} from "./identity.schema.js";
import {
  blockingStatusSchema,
  completionSchema,
  confidenceLabelSchema,
  reviewStatusSchema,
} from "./status.schema.js";

export const confidenceTargetSchema = z.discriminatedUnion("kind", [
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
    kind: z.literal("takeoff"),
    pipelineRunId: pipelineRunIdSchema,
    scopeName: z.string().trim().min(1),
  }),
]);

export const confidenceDimensionLabelSchema = z.enum([
  "high",
  "medium",
  "low",
]);

export const confidenceDimensionSchema = z.object({
  label: confidenceDimensionLabelSchema,
  explanation: z.string().trim().min(1),
});

export const confidenceQuantityImpactWeightSchema = z.enum([
  "low",
  "medium",
  "high",
]);

function hasDuplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

export const confidenceEvaluationSchema = z
  .object({
    id: confidenceEvaluationIdSchema,
    target: confidenceTargetSchema,
    evidence: confidenceDimensionSchema,
    resolution: confidenceDimensionSchema,
    validation: confidenceDimensionSchema,
    overallLabel: confidenceLabelSchema,
    completion: completionSchema,
    reviewStatus: reviewStatusSchema,
    blockingStatus: blockingStatusSchema,
    quantityImpactWeight: confidenceQuantityImpactWeightSchema,
    explanation: z.string().trim().min(1),
    evidenceIds: z.array(evidenceIdSchema).default([]),
    assumptionIds: z.array(assumptionIdSchema).default([]),
    validationIssueIds: z.array(validationIssueIdSchema).default([]),
    validationResultIds: z.array(validationResultIdSchema).default([]),
    reviewItemIds: z.array(reviewItemIdSchema).default([]),
    userDecisionIds: z.array(userDecisionIdSchema).default([]),
  })
  .superRefine((evaluation, context) => {
    const relationshipCollections: Array<[string, readonly string[]]> = [
      ["evidenceIds", evaluation.evidenceIds],
      ["assumptionIds", evaluation.assumptionIds],
      ["validationIssueIds", evaluation.validationIssueIds],
      ["validationResultIds", evaluation.validationResultIds],
      ["reviewItemIds", evaluation.reviewItemIds],
      ["userDecisionIds", evaluation.userDecisionIds],
    ];

    for (const [path, ids] of relationshipCollections) {
      if (hasDuplicates(ids)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [path],
          message: `${path} must not contain duplicate IDs.`,
        });
      }
    }

    if (
      evaluation.blockingStatus === "blocked" &&
      evaluation.overallLabel !== "blocked"
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["overallLabel"],
        message: "A blocked evaluation must use the blocked confidence label.",
      });
    }

    if (
      evaluation.overallLabel === "blocked" &&
      evaluation.blockingStatus !== "blocked"
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["blockingStatus"],
        message: "The blocked confidence label requires blocked status.",
      });
    }
  });

export type ConfidenceTarget = z.infer<typeof confidenceTargetSchema>;
export type ConfidenceDimensionLabel = z.infer<
  typeof confidenceDimensionLabelSchema
>;
export type ConfidenceDimension = z.infer<
  typeof confidenceDimensionSchema
>;
export type ConfidenceQuantityImpactWeight = z.infer<
  typeof confidenceQuantityImpactWeightSchema
>;
export type ConfidenceEvaluation = z.infer<
  typeof confidenceEvaluationSchema
>;
