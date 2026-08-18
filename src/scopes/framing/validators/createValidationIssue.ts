import type {
  ValidationIssue,
  ValidationLevel,
  ValidationQuantityImpact,
  ValidationSeverity,
  ValidationTarget,
} from "../../../core/schemas/validation.schema.js";
import { validationIssueSchema } from "../../../core/schemas/validation.schema.js";
import type { EvidenceId } from "../../../core/schemas/identity.schema.js";
import type { ReviewItemId } from "../../../core/schemas/identity.schema.js";
import { createValidationIssueId } from "./ids.js";

export type CreateValidationIssueInput = {
  ruleId: string;
  level: ValidationLevel;
  severity: ValidationSeverity;
  ruleViolated: string;
  explanation: string;
  target: ValidationTarget;
  recommendedUserAction?: string | null;
  evidenceIds?: EvidenceId[];
  quantityImpacts?: ValidationQuantityImpact[];
  reviewItemIds?: ReviewItemId[];
};

export function createValidationIssue(
  input: CreateValidationIssueInput,
): ValidationIssue {
  return validationIssueSchema.parse({
    id: createValidationIssueId(input.ruleId, input.target),
    severity: input.severity,
    level: input.level,
    ruleId: input.ruleId,
    ruleViolated: input.ruleViolated,
    explanation: input.explanation,
    recommendedUserAction: input.recommendedUserAction ?? null,
    target: input.target,
    evidenceIds: input.evidenceIds ?? [],
    quantityImpacts: input.quantityImpacts ?? [],
    reviewItemIds: input.reviewItemIds ?? [],
  });
}
