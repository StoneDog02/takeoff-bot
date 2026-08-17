import { z } from "zod";

/**
 * User-facing confidence labels.
 *
 * Confidence evaluation is handled separately from completion,
 * review status, and blocking status.
 */
export const confidenceLabelSchema = z.enum([
  "high",
  "medium",
  "low",
  "blocked",
]);

/**
 * Describes whether user review is needed.
 */
export const reviewStatusSchema = z.enum([
  "no-review-required",
  "review-recommended",
  "review-required",
  "user-confirmation-required",
]);

/**
 * Describes whether calculation may safely continue.
 */
export const blockingStatusSchema = z.enum([
  "not-blocked",
  "partially-blocked",
  "blocked",
]);

/**
 * Describes the lifecycle state of a resolved object or calculation.
 */
export const completionStatusSchema = z.enum([
  "not-started",
  "partial",
  "complete",
  "excluded",
]);

/**
 * Represents measurable completion independently from confidence.
 */
export const completionSchema = z
  .object({
    status: completionStatusSchema,
    percentage: z.number().min(0).max(100),
    completedItems: z.number().int().nonnegative().nullable().default(null),
    totalItems: z.number().int().nonnegative().nullable().default(null),
  })
  .superRefine((completion, context) => {
    const hasCompletedItems = completion.completedItems !== null;
    const hasTotalItems = completion.totalItems !== null;

    if (hasCompletedItems !== hasTotalItems) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "completedItems and totalItems must either both be provided or both be null.",
      });

      return;
    }

    if (
      completion.completedItems !== null &&
      completion.totalItems !== null &&
      completion.completedItems > completion.totalItems
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "completedItems cannot exceed totalItems.",
      });
    }
  });

export type ConfidenceLabel = z.infer<typeof confidenceLabelSchema>;
export type ReviewStatus = z.infer<typeof reviewStatusSchema>;
export type BlockingStatus = z.infer<typeof blockingStatusSchema>;
export type CompletionStatus = z.infer<typeof completionStatusSchema>;
export type Completion = z.infer<typeof completionSchema>;