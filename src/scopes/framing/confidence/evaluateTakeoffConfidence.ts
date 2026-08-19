import type { ConfidenceEvaluation } from "../../../core/schemas/confidence.schema.js";
import { confidenceEvaluationSchema } from "../../../core/schemas/confidence.schema.js";
import type { EvidenceId, PipelineRunId } from "../../../core/schemas/identity.schema.js";
import type { ValidationPayload } from "../schemas/framing-artifacts.schema.js";
import {
  deriveBlockingStatus,
  deriveOverallLabel,
  deriveReviewStatus,
  deriveValidationConfidence,
} from "./deriveDimensions.js";
import { createConfidenceEvaluationId, createTakeoffConfidenceTarget } from "./ids.js";
import { collectUserDecisionIdsFromEvaluations } from "./collectUserDecisionIds.js";

type EvaluateTakeoffConfidenceInput = {
  pipelineRunId: PipelineRunId;
  scopeName: string;
  validation: ValidationPayload;
  objectEvaluations: ConfidenceEvaluation[];
  evidenceIds: EvidenceId[];
  useExplicitFixture: boolean;
};

function averageCompletionPercentage(
  evaluations: ConfidenceEvaluation[],
): number {
  if (evaluations.length === 0) {
    return 0;
  }

  const total = evaluations.reduce(
    (sum, evaluation) => sum + evaluation.completion.percentage,
    0,
  );
  return Math.round(total / evaluations.length);
}

export function evaluateTakeoffConfidence(
  input: EvaluateTakeoffConfidenceInput,
): ConfidenceEvaluation {
  const target = createTakeoffConfidenceTarget(
    input.pipelineRunId,
    input.scopeName,
  );
  const validationDimension = deriveValidationConfidence(
    input.validation.validationResults,
    input.validation.validationIssues,
  );
  const reviewStatus = deriveReviewStatus(
    "no-review-required",
    input.validation.reviewItems,
  );
  const blockingStatus = deriveBlockingStatus(
    "not-blocked",
    input.validation.reviewItems,
  );

  const evidence = input.useExplicitFixture
    ? {
        label: "high" as const,
        explanation: "All demo values are explicit.",
      }
    : {
        label: "medium" as const,
        explanation:
          "Live extraction completed; walls were resolved from extracted evidence.",
      };

  const resolution = input.useExplicitFixture
    ? {
        label: "high" as const,
        explanation: "No assumptions were used.",
      }
    : {
        label: "medium" as const,
        explanation: "Some values remain unresolved after evidence resolution.",
      };

  const highImpactBlocked = input.objectEvaluations.some(
    (evaluation) =>
      evaluation.quantityImpactWeight === "high" &&
      (evaluation.overallLabel === "blocked" ||
        evaluation.blockingStatus === "blocked"),
  );

  const overallLabel = deriveOverallLabel(
    [evidence, resolution, validationDimension],
    blockingStatus === "blocked" || highImpactBlocked,
  );

  const completionPercentage = averageCompletionPercentage(
    input.objectEvaluations,
  );

  return confidenceEvaluationSchema.parse({
    id: createConfidenceEvaluationId(target),
    target,
    evidence,
    resolution,
    validation: validationDimension,
    overallLabel,
    completion: {
      status: completionPercentage >= 100 ? "complete" : "partial",
      percentage: completionPercentage,
      completedItems: input.objectEvaluations.filter(
        (evaluation) => evaluation.completion.status === "complete",
      ).length,
      totalItems: input.objectEvaluations.length,
    },
    reviewStatus,
    blockingStatus,
    quantityImpactWeight:
      blockingStatus === "blocked" || highImpactBlocked ? "high" : "medium",
    explanation:
      overallLabel === "blocked"
        ? "Validation blocked one or more high-impact quantities before final takeoff."
        : input.useExplicitFixture
          ? "The mock wall was resolved from extracted evidence and calculated without assumptions."
          : "Live evidence was extracted and resolved; calculated quantities use only resolved inputs.",
    evidenceIds: input.evidenceIds,
    assumptionIds: [],
    validationIssueIds: input.validation.validationIssues.map((issue) => issue.id),
    validationResultIds: input.validation.validationResults.map(
      (result) => result.id,
    ),
    reviewItemIds: input.validation.reviewItems.map((item) => item.id),
    userDecisionIds: collectUserDecisionIdsFromEvaluations(input.objectEvaluations),
  });
}
