import type {
  ValidationLevel,
  ValidationOutcome,
  ValidationResult,
  ValidationTarget,
} from "../../../core/schemas/validation.schema.js";
import { validationResultSchema } from "../../../core/schemas/validation.schema.js";
import type { EvidenceId } from "../../../core/schemas/identity.schema.js";
import type { ValidationIssueId } from "../../../core/schemas/identity.schema.js";
import { createValidationResultId } from "./ids.js";

export type CreateValidationResultInput = {
  ruleId: string;
  level: ValidationLevel;
  target: ValidationTarget;
  outcome: ValidationOutcome;
  explanation: string;
  validationIssueIds?: ValidationIssueId[];
  evidenceIds?: EvidenceId[];
};

export function createValidationResult(
  input: CreateValidationResultInput,
): ValidationResult {
  return validationResultSchema.parse({
    id: createValidationResultId(input.ruleId, input.target),
    ruleId: input.ruleId,
    level: input.level,
    target: input.target,
    outcome: input.outcome,
    explanation: input.explanation,
    validationIssueIds: input.validationIssueIds ?? [],
    evidenceIds: input.evidenceIds ?? [],
  });
}
