import type { EvidenceId } from "../../../core/schemas/identity.schema.js";
import type { ValidationLevel } from "../../../core/schemas/validation.schema.js";
import {
  createReviewItem,
  type CreateReviewItemInput,
} from "./createReviewItem.js";
import {
  createValidationIssue,
  type CreateValidationIssueInput,
} from "./createValidationIssue.js";
import { createValidationResult } from "./createValidationResult.js";
import { createObjectTarget, createReviewItemId } from "./ids.js";
import type { ValidationBatch } from "./types.js";

export function collectEvidenceIds(
  ...sources: Array<{ evidenceIds: EvidenceId[] }>
): EvidenceId[] {
  return [...new Set(sources.flatMap((source) => source.evidenceIds))];
}

export function toReviewQuantityImpacts(
  quantityImpacts: NonNullable<CreateValidationIssueInput["quantityImpacts"]>,
) {
  return quantityImpacts.map((impact) => ({
    quantityKey: impact.quantityKey,
    description: impact.description,
    impact: impact.canCalculate
      ? ("may-change" as const)
      : ("blocked" as const),
    canCalculate: impact.canCalculate,
  }));
}

export function buildPassedBatch(
  ruleId: string,
  level: ValidationLevel,
  target: ReturnType<typeof createObjectTarget>,
  explanation: string,
  evidenceIds: EvidenceId[],
): ValidationBatch {
  return {
    validationIssues: [],
    validationResults: [
      createValidationResult({
        ruleId,
        level,
        target,
        outcome: "passed",
        explanation,
        evidenceIds,
      }),
    ],
    reviewItems: [],
  };
}

export function buildSkippedBatch(
  ruleId: string,
  level: ValidationLevel,
  target: ReturnType<typeof createObjectTarget>,
  explanation: string,
  evidenceIds: EvidenceId[],
): ValidationBatch {
  return {
    validationIssues: [],
    validationResults: [
      createValidationResult({
        ruleId,
        level,
        target,
        outcome: "skipped",
        explanation,
        evidenceIds,
      }),
    ],
    reviewItems: [],
  };
}

export function buildFailedBatch(
  issueInput: CreateValidationIssueInput,
  reviewItemInput: CreateReviewItemInput | null,
): ValidationBatch {
  const reviewItemId = reviewItemInput
    ? createReviewItemId(issueInput.ruleId, issueInput.target)
    : null;

  const issue = createValidationIssue({
    ...issueInput,
    reviewItemIds: reviewItemId ? [reviewItemId] : [],
  });

  const reviewItem =
    reviewItemInput === null
      ? null
      : createReviewItem({
          ...reviewItemInput,
          validationIssueIds: [issue.id],
        });

  const result = createValidationResult({
    ruleId: issue.ruleId,
    level: issue.level,
    target: issue.target,
    outcome: "failed",
    explanation: issue.explanation,
    validationIssueIds: [issue.id],
    evidenceIds: issue.evidenceIds,
  });

  return {
    validationIssues: [issue],
    validationResults: [result],
    reviewItems: reviewItem ? [reviewItem] : [],
  };
}
