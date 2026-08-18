import type { EvidenceId } from "../../../core/schemas/identity.schema.js";
import { objectIdSchema } from "../../../core/schemas/identity.schema.js";
import type {
  ConfidencePayload,
  FramingScopePayload,
  ValidationPayload,
} from "../schemas/framing-artifacts.schema.js";
import {
  buildFailedBatch,
  buildPassedBatch,
  buildSkippedBatch,
} from "./buildValidationBatch.js";
import { createObjectTarget } from "./ids.js";
import { mergeValidationBatches } from "./mergeValidationBatch.js";
import { FRAMING_SCOPE_RULE_IDS } from "./rule-ids.js";
import type { ValidationBatch } from "./types.js";

export type FramingScopeValidationInput = {
  payload: FramingScopePayload;
  validation?: ValidationPayload;
  confidence?: ConfidencePayload;
};

const SCOPE_OBJECT_TYPE = "framing-scope";
const SCOPE_OBJECT_ID = objectIdSchema.parse("framing");
const SCOPE_LEVEL = "relationship" as const;
const EMPTY_EVIDENCE_IDS: EvidenceId[] = [];

function scopeTarget() {
  return createObjectTarget(SCOPE_OBJECT_ID, SCOPE_OBJECT_TYPE);
}

function formatMissingIds(ids: readonly string[]): string {
  return ids.join(", ");
}

function validateResolvedIds(options: {
  ids: readonly string[];
  recordsAvailable: boolean;
  knownIds: ReadonlySet<string>;
  ruleId: string;
  emptyExplanation: string;
  skipExplanation: string;
  passExplanation: (count: number) => string;
  ruleViolated: string;
  missingExplanation: (missingIds: readonly string[]) => string;
  recommendedUserAction: string;
  reviewTitle: string;
  targetProperty: string;
}): ValidationBatch {
  const target = scopeTarget();
  const evidenceIds = EMPTY_EVIDENCE_IDS;

  if (options.ids.length === 0) {
    return buildPassedBatch(
      options.ruleId,
      SCOPE_LEVEL,
      target,
      options.emptyExplanation,
      evidenceIds,
    );
  }

  if (!options.recordsAvailable) {
    return buildSkippedBatch(
      options.ruleId,
      SCOPE_LEVEL,
      target,
      options.skipExplanation,
      evidenceIds,
    );
  }

  const missingIds = options.ids.filter((id) => !options.knownIds.has(id));

  if (missingIds.length === 0) {
    return buildPassedBatch(
      options.ruleId,
      SCOPE_LEVEL,
      target,
      options.passExplanation(options.ids.length),
      evidenceIds,
    );
  }

  const explanation = options.missingExplanation(missingIds);

  return buildFailedBatch(
    {
      ruleId: options.ruleId,
      level: SCOPE_LEVEL,
      severity: "warning",
      ruleViolated: options.ruleViolated,
      explanation,
      target,
      recommendedUserAction: options.recommendedUserAction,
      evidenceIds,
    },
    {
      ruleId: options.ruleId,
      target,
      title: options.reviewTitle,
      description: explanation,
      action: {
        type: "provide-value",
        instruction: options.recommendedUserAction,
        targetProperty: options.targetProperty,
      },
      reviewStatus: "review-recommended",
      blockingStatus: "not-blocked",
      affectedObjects: [
        { objectId: SCOPE_OBJECT_ID, objectType: SCOPE_OBJECT_TYPE },
      ],
      evidenceIds,
    },
  );
}

function hasValidationRecordIds(scope: FramingScopePayload): boolean {
  return (
    scope.validationIssueIds.length > 0 ||
    scope.validationResultIds.length > 0 ||
    scope.reviewItemIds.length > 0
  );
}

function validateValidationIssuesResolved(
  scope: FramingScopePayload,
  validation: ValidationPayload | undefined,
): ValidationBatch {
  return validateResolvedIds({
    ids: scope.validationIssueIds,
    recordsAvailable: validation !== undefined,
    knownIds: new Set(validation?.validationIssues.map((issue) => issue.id) ?? []),
    ruleId: FRAMING_SCOPE_RULE_IDS.validationIssuesResolved,
    emptyExplanation:
      "The Framing Scope snapshot lists no validation issue IDs to resolve.",
    skipExplanation:
      "Validation issue ID resolution was skipped because no Validation payload was provided.",
    passExplanation: (count) =>
      `The Framing Scope snapshot references ${count} existing validation issue${count === 1 ? "" : "s"}.`,
    ruleViolated:
      "Framing Scope validationIssueIds must resolve to records in the Validation Artifact.",
    missingExplanation: (missingIds) =>
      `The Framing Scope snapshot references missing validation issue IDs: ${formatMissingIds(missingIds)}.`,
    recommendedUserAction:
      "Correct validationIssueIds so every ID matches a Validation Issue in the Validation Artifact.",
    reviewTitle: "Resolve dangling Framing Scope validation issue IDs",
    targetProperty: "validationIssueIds",
  });
}

function validateValidationResultsResolved(
  scope: FramingScopePayload,
  validation: ValidationPayload | undefined,
): ValidationBatch {
  return validateResolvedIds({
    ids: scope.validationResultIds,
    recordsAvailable: validation !== undefined,
    knownIds: new Set(
      validation?.validationResults.map((result) => result.id) ?? [],
    ),
    ruleId: FRAMING_SCOPE_RULE_IDS.validationResultsResolved,
    emptyExplanation:
      "The Framing Scope snapshot lists no validation result IDs to resolve.",
    skipExplanation:
      "Validation result ID resolution was skipped because no Validation payload was provided.",
    passExplanation: (count) =>
      `The Framing Scope snapshot references ${count} existing validation result${count === 1 ? "" : "s"}.`,
    ruleViolated:
      "Framing Scope validationResultIds must resolve to records in the Validation Artifact.",
    missingExplanation: (missingIds) =>
      `The Framing Scope snapshot references missing validation result IDs: ${formatMissingIds(missingIds)}.`,
    recommendedUserAction:
      "Correct validationResultIds so every ID matches a Validation Result in the Validation Artifact.",
    reviewTitle: "Resolve dangling Framing Scope validation result IDs",
    targetProperty: "validationResultIds",
  });
}

function validateReviewItemsResolved(
  scope: FramingScopePayload,
  validation: ValidationPayload | undefined,
): ValidationBatch {
  return validateResolvedIds({
    ids: scope.reviewItemIds,
    recordsAvailable: validation !== undefined,
    knownIds: new Set(validation?.reviewItems.map((item) => item.id) ?? []),
    ruleId: FRAMING_SCOPE_RULE_IDS.reviewItemsResolved,
    emptyExplanation:
      "The Framing Scope snapshot lists no review item IDs to resolve.",
    skipExplanation:
      "Review item ID resolution was skipped because no Validation payload with Review Items was provided.",
    passExplanation: (count) =>
      `The Framing Scope snapshot references ${count} existing review item${count === 1 ? "" : "s"}.`,
    ruleViolated:
      "Framing Scope reviewItemIds must resolve to Review Items in the Validation Artifact.",
    missingExplanation: (missingIds) =>
      `The Framing Scope snapshot references missing review item IDs: ${formatMissingIds(missingIds)}.`,
    recommendedUserAction:
      "Correct reviewItemIds so every ID matches a Review Item in the Validation Artifact.",
    reviewTitle: "Resolve dangling Framing Scope review item IDs",
    targetProperty: "reviewItemIds",
  });
}

function validateConfidenceEvaluationsResolved(
  scope: FramingScopePayload,
  confidence: ConfidencePayload | undefined,
): ValidationBatch {
  return validateResolvedIds({
    ids: scope.confidenceEvaluationIds,
    recordsAvailable: confidence !== undefined,
    knownIds: new Set(
      confidence?.confidenceEvaluations.map((evaluation) => evaluation.id) ?? [],
    ),
    ruleId: FRAMING_SCOPE_RULE_IDS.confidenceEvaluationsResolved,
    emptyExplanation:
      "The Framing Scope snapshot lists no confidence evaluation IDs to resolve.",
    skipExplanation:
      "Confidence evaluation ID resolution was skipped because no Confidence payload was provided.",
    passExplanation: (count) =>
      `The Framing Scope snapshot references ${count} existing confidence evaluation${count === 1 ? "" : "s"}.`,
    ruleViolated:
      "Framing Scope confidenceEvaluationIds must resolve to records in the Confidence Artifact.",
    missingExplanation: (missingIds) =>
      `The Framing Scope snapshot references missing confidence evaluation IDs: ${formatMissingIds(missingIds)}.`,
    recommendedUserAction:
      "Correct confidenceEvaluationIds so every ID matches a Confidence Evaluation in the Confidence Artifact.",
    reviewTitle: "Resolve dangling Framing Scope confidence evaluation IDs",
    targetProperty: "confidenceEvaluationIds",
  });
}

function validateValidationArtifactReferenced(
  scope: FramingScopePayload,
): ValidationBatch {
  const target = scopeTarget();
  const ruleId = FRAMING_SCOPE_RULE_IDS.validationArtifactReferenced;
  const evidenceIds = EMPTY_EVIDENCE_IDS;

  if (!hasValidationRecordIds(scope)) {
    return buildPassedBatch(
      ruleId,
      SCOPE_LEVEL,
      target,
      "No validation records are aggregated, so a validation artifact reference is not required.",
      evidenceIds,
    );
  }

  if (scope.subsystemArtifactIds.validation !== null) {
    return buildPassedBatch(
      ruleId,
      SCOPE_LEVEL,
      target,
      "Aggregated validation record IDs are accompanied by a validation artifact reference.",
      evidenceIds,
    );
  }

  const explanation =
    "The Framing Scope snapshot lists validation or review record IDs without a validation artifact reference.";

  return buildFailedBatch(
    {
      ruleId,
      level: SCOPE_LEVEL,
      severity: "warning",
      ruleViolated:
        "Populated validationIssueIds, validationResultIds, or reviewItemIds require subsystemArtifactIds.validation.",
      explanation,
      target,
      recommendedUserAction:
        "Set subsystemArtifactIds.validation to the Validation Artifact that owns the aggregated records.",
      evidenceIds,
    },
    {
      ruleId,
      target,
      title: "Reference the Validation Artifact on the Framing Scope snapshot",
      description: explanation,
      action: {
        type: "provide-value",
        instruction:
          "Set subsystemArtifactIds.validation to the Validation Artifact that owns the aggregated records.",
        targetProperty: "subsystemArtifactIds.validation",
      },
      reviewStatus: "review-recommended",
      blockingStatus: "not-blocked",
      affectedObjects: [
        { objectId: SCOPE_OBJECT_ID, objectType: SCOPE_OBJECT_TYPE },
      ],
      evidenceIds,
    },
  );
}

function validateConfidenceArtifactReferenced(
  scope: FramingScopePayload,
): ValidationBatch {
  const target = scopeTarget();
  const ruleId = FRAMING_SCOPE_RULE_IDS.confidenceArtifactReferenced;
  const evidenceIds = EMPTY_EVIDENCE_IDS;

  if (scope.confidenceEvaluationIds.length === 0) {
    return buildPassedBatch(
      ruleId,
      SCOPE_LEVEL,
      target,
      "No confidence evaluations are aggregated, so a confidence artifact reference is not required.",
      evidenceIds,
    );
  }

  if (scope.subsystemArtifactIds.confidence !== null) {
    return buildPassedBatch(
      ruleId,
      SCOPE_LEVEL,
      target,
      "Aggregated confidence evaluation IDs are accompanied by a confidence artifact reference.",
      evidenceIds,
    );
  }

  const explanation =
    "The Framing Scope snapshot lists confidence evaluation IDs without a confidence artifact reference.";

  return buildFailedBatch(
    {
      ruleId,
      level: SCOPE_LEVEL,
      severity: "warning",
      ruleViolated:
        "Populated confidenceEvaluationIds require subsystemArtifactIds.confidence.",
      explanation,
      target,
      recommendedUserAction:
        "Set subsystemArtifactIds.confidence to the Confidence Artifact that owns the aggregated evaluations.",
      evidenceIds,
    },
    {
      ruleId,
      target,
      title: "Reference the Confidence Artifact on the Framing Scope snapshot",
      description: explanation,
      action: {
        type: "provide-value",
        instruction:
          "Set subsystemArtifactIds.confidence to the Confidence Artifact that owns the aggregated evaluations.",
        targetProperty: "subsystemArtifactIds.confidence",
      },
      reviewStatus: "review-recommended",
      blockingStatus: "not-blocked",
      affectedObjects: [
        { objectId: SCOPE_OBJECT_ID, objectType: SCOPE_OBJECT_TYPE },
      ],
      evidenceIds,
    },
  );
}

/**
 * Validates Framing Scope snapshot integrity only.
 *
 * Does not evaluate construction completeness, confidence scores, or
 * whether every subsystem artifact slot is populated.
 */
export function validateFramingScope(
  input: FramingScopeValidationInput,
): ValidationBatch {
  const { payload, validation, confidence } = input;

  return mergeValidationBatches(
    validateValidationIssuesResolved(payload, validation),
    validateValidationResultsResolved(payload, validation),
    validateReviewItemsResolved(payload, validation),
    validateValidationArtifactReferenced(payload),
    validateConfidenceEvaluationsResolved(payload, confidence),
    validateConfidenceArtifactReferenced(payload),
  );
}
