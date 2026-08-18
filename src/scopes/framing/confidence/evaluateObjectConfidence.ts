import type { ConfidenceEvaluation } from "../../../core/schemas/confidence.schema.js";
import { confidenceEvaluationSchema } from "../../../core/schemas/confidence.schema.js";
import type {
  AssumptionId,
  EvidenceId,
  ObjectId,
  PipelineRunId,
} from "../../../core/schemas/identity.schema.js";
import type { PropertyResolutionTrace } from "../../../core/schemas/resolved-object.schema.js";
import type {
  BlockingStatus,
  Completion,
  ReviewStatus,
} from "../../../core/schemas/status.schema.js";
import type { ValidationPayload } from "../schemas/framing-artifacts.schema.js";
import {
  deriveBlockingStatus,
  deriveEvidenceConfidence,
  deriveOverallLabel,
  deriveResolutionConfidence,
  deriveReviewStatus,
  deriveValidationConfidence,
  quantityImpactWeightForObjectType,
} from "./deriveDimensions.js";
import { createConfidenceEvaluationId, createObjectConfidenceTarget } from "./ids.js";

export type ConfidenceObjectInput = {
  id: ObjectId;
  objectType: string;
  completion: Completion;
  reviewStatus: ReviewStatus;
  blockingStatus: BlockingStatus;
  evidenceIds: EvidenceId[];
  assumptionIds: AssumptionId[];
  resolutionTraces: PropertyResolutionTrace[];
};

function validationContextForObject(
  validation: ValidationPayload,
  objectId: ObjectId,
) {
  const results = validation.validationResults.filter(
    (result) =>
      result.target.kind === "object" && result.target.objectId === objectId,
  );
  const issueIds = new Set(
    results.flatMap((result) => result.validationIssueIds),
  );
  const issues = validation.validationIssues.filter((issue) =>
    issueIds.has(issue.id),
  );
  const reviewItems = validation.reviewItems.filter(
    (item) =>
      item.affectedObjects.some(
        (affectedObject) => affectedObject.objectId === objectId,
      ) || item.validationIssueIds.some((issueId) => issueIds.has(issueId)),
  );

  return { results, issues, reviewItems };
}

export function evaluateObjectConfidence(
  object: ConfidenceObjectInput,
  validation: ValidationPayload,
): ConfidenceEvaluation {
  const target = createObjectConfidenceTarget(object.id, object.objectType);
  const { results, issues, reviewItems } = validationContextForObject(
    validation,
    object.id,
  );

  const evidence = deriveEvidenceConfidence(object.evidenceIds, object.resolutionTraces);
  const resolution = deriveResolutionConfidence(object.resolutionTraces);
  const validationDimension = deriveValidationConfidence(results, issues);
  const reviewStatus = deriveReviewStatus(object.reviewStatus, reviewItems);
  const blockingStatus = deriveBlockingStatus(object.blockingStatus, reviewItems);
  const overallLabel = deriveOverallLabel(
    [evidence, resolution, validationDimension],
    blockingStatus === "blocked",
  );

  return confidenceEvaluationSchema.parse({
    id: createConfidenceEvaluationId(target),
    target,
    evidence,
    resolution,
    validation: validationDimension,
    overallLabel,
    completion: object.completion,
    reviewStatus,
    blockingStatus,
    quantityImpactWeight: quantityImpactWeightForObjectType(object.objectType),
    explanation:
      overallLabel === "blocked"
        ? `Confidence for ${object.objectType} ${object.id} is blocked by validation.`
        : `Confidence for ${object.objectType} ${object.id} reflects evidence, resolution, and validation results.`,
    evidenceIds: object.evidenceIds,
    assumptionIds: object.assumptionIds,
    validationIssueIds: issues.map((issue) => issue.id),
    validationResultIds: results.map((result) => result.id),
    reviewItemIds: reviewItems.map((item) => item.id),
    userDecisionIds: [],
  });
}
