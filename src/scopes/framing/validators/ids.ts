import type { ValidationTarget } from "../../../core/schemas/validation.schema.js";
import type {
  ObjectId,
  ReviewItemId,
  ValidationIssueId,
  ValidationResultId,
} from "../../../core/schemas/identity.schema.js";

function normalizeRuleId(ruleId: string): string {
  return ruleId.replaceAll(".", "-");
}

function targetSlug(target: ValidationTarget): string {
  switch (target.kind) {
    case "object":
      return `object-${target.objectId}`;
    case "artifact":
      return `artifact-${target.artifactId}`;
    case "pipeline":
      return `pipeline-${target.pipelineRunId}`;
  }
}

export function createValidationIssueId(
  ruleId: string,
  target: ValidationTarget,
): ValidationIssueId {
  return `VI-${normalizeRuleId(ruleId)}-${targetSlug(target)}` as ValidationIssueId;
}

export function createValidationResultId(
  ruleId: string,
  target: ValidationTarget,
): ValidationResultId {
  return `VR-${normalizeRuleId(ruleId)}-${targetSlug(target)}` as ValidationResultId;
}

export function createReviewItemId(
  ruleId: string,
  target: ValidationTarget,
): ReviewItemId {
  return `RI-${normalizeRuleId(ruleId)}-${targetSlug(target)}` as ReviewItemId;
}

export function createObjectTarget(
  objectId: ObjectId,
  objectType: string,
): ValidationTarget {
  return {
    kind: "object",
    objectId,
    objectType,
  };
}
