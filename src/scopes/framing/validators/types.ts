import type { ObjectId } from "../../../core/schemas/identity.schema.js";
import type { ReviewItem } from "../../../core/schemas/review-item.schema.js";
import type {
  ValidationIssue,
  ValidationResult,
} from "../../../core/schemas/validation.schema.js";

export type RelatedObjectRef = {
  objectId: ObjectId;
  objectType: string;
};

export type ValidationBatch = {
  validationIssues: ValidationIssue[];
  validationResults: ValidationResult[];
  reviewItems: ReviewItem[];
};

export type FailedValidationEvaluation = {
  outcome: "failed";
  issue: ValidationIssue;
  reviewItem: ReviewItem | null;
};

export type PassedValidationEvaluation = {
  outcome: "passed";
};

export type SkippedValidationEvaluation = {
  outcome: "skipped";
};

export type ValidationEvaluation =
  | FailedValidationEvaluation
  | PassedValidationEvaluation
  | SkippedValidationEvaluation;
