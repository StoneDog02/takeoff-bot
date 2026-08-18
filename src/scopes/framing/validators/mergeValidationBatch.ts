import type { ValidationBatch } from "./types.js";

export function mergeValidationBatches(
  ...batches: ValidationBatch[]
): ValidationBatch {
  return {
    validationIssues: batches.flatMap((batch) => batch.validationIssues),
    validationResults: batches.flatMap((batch) => batch.validationResults),
    reviewItems: batches.flatMap((batch) => batch.reviewItems),
  };
}

export function emptyValidationBatch(): ValidationBatch {
  return {
    validationIssues: [],
    validationResults: [],
    reviewItems: [],
  };
}
