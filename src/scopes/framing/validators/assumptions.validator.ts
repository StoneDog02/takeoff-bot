import type { Assumption } from "../../../core/schemas/assumption.schema.js";
import { objectIdSchema } from "../../../core/schemas/identity.schema.js";
import type { AssumptionsPayload } from "../schemas/framing-artifacts.schema.js";
import {
  buildFailedBatch,
  buildPassedBatch,
  toReviewQuantityImpacts,
} from "./buildValidationBatch.js";
import { createObjectTarget } from "./ids.js";
import { mergeValidationBatches } from "./mergeValidationBatch.js";
import { ASSUMPTION_RULE_IDS } from "./rule-ids.js";
import type { ValidationBatch } from "./types.js";

export type AssumptionsValidationInput = {
  payload: AssumptionsPayload;
};

const EXPECTED_SOURCE_TYPE = {
  "industry-default": "construction-brain",
  "user-default": "user-configuration",
  "organization-default": "organization-configuration",
} as const;

function assumptionTarget(assumption: Assumption) {
  return createObjectTarget(objectIdSchema.parse(assumption.id), "assumption");
}

function isInUse(assumption: Assumption): boolean {
  return assumption.status === "active" || assumption.status === "confirmed";
}

/**
 * Property families Construction Brain forbids guessing.
 * Conditional eligibility (e.g. stud size on a shear wall) requires domain
 * objects and is not evaluated here.
 */
function isForbiddenProperty(assumption: Assumption): boolean {
  const { objectType, propertyPath } = assumption.target;

  if (objectType === "structural-member" && propertyPath === "size") {
    return true;
  }

  if (
    objectType === "connector" &&
    (propertyPath === "connectorType" || propertyPath === "model")
  ) {
    return true;
  }

  if (
    objectType === "building-wall" &&
    propertyPath === "isShearOrBraced"
  ) {
    return true;
  }

  return false;
}

function quantityImpactsFrom(
  assumption: Assumption,
  canCalculate: boolean,
): Array<{
  quantityKey: string;
  description: string;
  canCalculate: boolean;
}> {
  return assumption.materialImpact.affectedQuantityKeys.map((quantityKey) => ({
    quantityKey,
    description: assumption.materialImpact.explanation,
    canCalculate,
  }));
}

function validatePolicyForbidden(assumption: Assumption): ValidationBatch {
  const target = assumptionTarget(assumption);
  const ruleId = ASSUMPTION_RULE_IDS.policyForbidden;
  const evidenceIds = assumption.evidenceIds;

  if (!isForbiddenProperty(assumption)) {
    return buildPassedBatch(
      ruleId,
      "assumption",
      target,
      `Assumption ${assumption.id} does not target a forbidden property.`,
      evidenceIds,
    );
  }

  if (!isInUse(assumption)) {
    return buildPassedBatch(
      ruleId,
      "assumption",
      target,
      `Assumption ${assumption.id} targets a forbidden property but is no longer in use.`,
      evidenceIds,
    );
  }

  const quantityImpacts = quantityImpactsFrom(assumption, false);
  const explanation = `Assumption ${assumption.id} uses a forbidden assumed value for ${assumption.target.objectType} ${assumption.target.objectId}.${assumption.target.propertyPath}.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "assumption",
      severity: "critical",
      ruleViolated:
        "Forbidden construction values must not be assumed.",
      explanation,
      target,
      recommendedUserAction:
        "Replace the assumed value with explicit project information.",
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Remove forbidden assumption ${assumption.id}`,
      description: explanation,
      action: {
        type: "provide-value",
        instruction:
          "Provide the explicit project value instead of using this assumption.",
        targetProperty: assumption.target.propertyPath,
      },
      reviewStatus: "review-required",
      blockingStatus: "blocked",
      affectedObjects: [assumption.target],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds,
      assumptionIds: [assumption.id],
    },
  );
}

function validateReviewRequired(assumption: Assumption): ValidationBatch {
  const target = assumptionTarget(assumption);
  const ruleId = ASSUMPTION_RULE_IDS.reviewRequired;
  const evidenceIds = assumption.evidenceIds;

  if (assumption.status !== "active") {
    return buildPassedBatch(
      ruleId,
      "assumption",
      target,
      `Assumption ${assumption.id} is not an active hidden-assumption candidate.`,
      evidenceIds,
    );
  }

  if (assumption.reviewRequired) {
    return buildPassedBatch(
      ruleId,
      "assumption",
      target,
      `Assumption ${assumption.id} is surfaced for review.`,
      evidenceIds,
    );
  }

  const quantityImpacts = quantityImpactsFrom(assumption, false);
  const explanation = `Assumption ${assumption.id} is active but not marked as requiring review.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "assumption",
      severity: "critical",
      ruleViolated: "Active assumptions must be surfaced for review.",
      explanation,
      target,
      recommendedUserAction: "Confirm or replace this assumed value.",
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Surface assumption ${assumption.id} for review`,
      description: explanation,
      action: {
        type: "confirm",
        instruction: "Confirm or override this previously hidden assumption.",
        targetProperty: assumption.target.propertyPath,
      },
      reviewStatus: "review-required",
      blockingStatus: "blocked",
      affectedObjects: [assumption.target],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds,
      assumptionIds: [assumption.id],
    },
  );
}

function validateApprovalRequired(assumption: Assumption): ValidationBatch {
  const target = assumptionTarget(assumption);
  const ruleId = ASSUMPTION_RULE_IDS.approvalRequired;
  const evidenceIds = assumption.evidenceIds;

  if (assumption.riskLevel !== "high") {
    return buildPassedBatch(
      ruleId,
      "assumption",
      target,
      `Assumption ${assumption.id} does not require explicit approval.`,
      evidenceIds,
    );
  }

  if (assumption.status !== "active") {
    return buildPassedBatch(
      ruleId,
      "assumption",
      target,
      `Assumption ${assumption.id} is high-risk but is not active without approval.`,
      evidenceIds,
    );
  }

  const quantityImpacts = quantityImpactsFrom(assumption, false);
  const explanation = `Assumption ${assumption.id} is high-risk and remains active without explicit approval.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "assumption",
      severity: "critical",
      ruleViolated:
        "High-risk assumptions require explicit approval before use.",
      explanation,
      target,
      recommendedUserAction:
        "Confirm this assumption with a User Decision or replace it with project information.",
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Approve or replace high-risk assumption ${assumption.id}`,
      description: explanation,
      action: {
        type: "confirm",
        instruction:
          "Explicitly approve this high-risk assumption or provide an explicit value.",
        targetProperty: assumption.target.propertyPath,
      },
      reviewStatus: "review-required",
      blockingStatus: "blocked",
      affectedObjects: [assumption.target],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds,
      assumptionIds: [assumption.id],
    },
  );
}

function validateSourceConsistent(assumption: Assumption): ValidationBatch {
  const target = assumptionTarget(assumption);
  const ruleId = ASSUMPTION_RULE_IDS.sourceConsistent;
  const evidenceIds = assumption.evidenceIds;
  const expected = EXPECTED_SOURCE_TYPE[assumption.category];

  if (assumption.source.type === expected) {
    return buildPassedBatch(
      ruleId,
      "assumption",
      target,
      `Assumption ${assumption.id} source type matches its precedence category.`,
      evidenceIds,
    );
  }

  const explanation = `Assumption ${assumption.id} category ${assumption.category} is inconsistent with source type ${assumption.source.type}.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "assumption",
      severity: "warning",
      ruleViolated:
        "Assumption source type must match its precedence category.",
      explanation,
      target,
      recommendedUserAction:
        "Correct the assumption category or source type so precedence is unambiguous.",
      evidenceIds,
      quantityImpacts: [],
    },
    {
      ruleId,
      target,
      title: `Reconcile source for assumption ${assumption.id}`,
      description: explanation,
      action: {
        type: "inspect-source",
        instruction:
          "Confirm whether this assumption is an industry, user, or organization default.",
        targetProperty: "category",
      },
      reviewStatus: "review-recommended",
      blockingStatus: "not-blocked",
      affectedObjects: [assumption.target],
      evidenceIds,
      assumptionIds: [assumption.id],
    },
  );
}

function validateMaterialImpactResolved(
  assumption: Assumption,
): ValidationBatch {
  const target = assumptionTarget(assumption);
  const ruleId = ASSUMPTION_RULE_IDS.materialImpactResolved;
  const evidenceIds = assumption.evidenceIds;

  if (assumption.materialImpact.level !== "unknown") {
    return buildPassedBatch(
      ruleId,
      "assumption",
      target,
      `Assumption ${assumption.id} has an assigned material impact.`,
      evidenceIds,
    );
  }

  const explanation = `Assumption ${assumption.id} has unknown material impact.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "assumption",
      severity: "warning",
      ruleViolated: "Assumption material impact must be assigned.",
      explanation,
      target,
      recommendedUserAction:
        "Identify the material impact of this assumption before relying on it.",
      evidenceIds,
      quantityImpacts: [],
    },
    {
      ruleId,
      target,
      title: `Resolve material impact for assumption ${assumption.id}`,
      description: explanation,
      action: {
        type: "acknowledge",
        instruction: "Confirm the material impact of this assumption.",
        targetProperty: "materialImpact.level",
      },
      reviewStatus: "review-recommended",
      blockingStatus: "not-blocked",
      affectedObjects: [assumption.target],
      evidenceIds,
      assumptionIds: [assumption.id],
    },
  );
}

function validateReviewTraceable(assumption: Assumption): ValidationBatch {
  const target = assumptionTarget(assumption);
  const ruleId = ASSUMPTION_RULE_IDS.reviewTraceable;
  const evidenceIds = assumption.evidenceIds;

  if (assumption.status !== "active" || !assumption.reviewRequired) {
    return buildPassedBatch(
      ruleId,
      "assumption",
      target,
      `Assumption ${assumption.id} does not require a linked review item.`,
      evidenceIds,
    );
  }

  if (assumption.reviewItemIds.length > 0) {
    return buildPassedBatch(
      ruleId,
      "assumption",
      target,
      `Assumption ${assumption.id} is linked to review items.`,
      evidenceIds,
    );
  }

  const explanation = `Assumption ${assumption.id} requires review but has no review item references.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "assumption",
      severity: "warning",
      ruleViolated:
        "A review-required assumption must be linked to a review item.",
      explanation,
      target,
      recommendedUserAction:
        "Create or link a review item for this assumption.",
      evidenceIds,
      quantityImpacts: [],
    },
    {
      ruleId,
      target,
      title: `Link a review item for assumption ${assumption.id}`,
      description: explanation,
      action: {
        type: "confirm",
        instruction: "Confirm this assumption so it remains reviewable.",
        targetProperty: assumption.target.propertyPath,
      },
      reviewStatus: "review-recommended",
      blockingStatus: "not-blocked",
      affectedObjects: [assumption.target],
      evidenceIds,
      assumptionIds: [assumption.id],
    },
  );
}

function targetKey(assumption: Assumption): string {
  return `${assumption.target.objectId}::${assumption.target.propertyPath}`;
}

function validateTargetConflict(
  assumption: Assumption,
  conflictingIds: string[],
): ValidationBatch {
  const target = assumptionTarget(assumption);
  const ruleId = ASSUMPTION_RULE_IDS.targetConflict;
  const evidenceIds = assumption.evidenceIds;

  if (assumption.status !== "active") {
    return buildPassedBatch(
      ruleId,
      "assumption",
      target,
      `Assumption ${assumption.id} is not an active conflicting candidate.`,
      evidenceIds,
    );
  }

  if (conflictingIds.length === 0) {
    return buildPassedBatch(
      ruleId,
      "assumption",
      target,
      `Assumption ${assumption.id} is the only active assumption for its target property.`,
      evidenceIds,
    );
  }

  const quantityImpacts = quantityImpactsFrom(assumption, false);
  const explanation = `Assumption ${assumption.id} conflicts with active assumption${conflictingIds.length === 1 ? "" : "s"} ${conflictingIds.join(", ")} for ${assumption.target.objectId}.${assumption.target.propertyPath}.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "assumption",
      severity: "critical",
      ruleViolated:
        "A target property cannot have more than one active assumption.",
      explanation,
      target,
      recommendedUserAction:
        "Keep one active assumption for this property or replace them with a User Decision.",
      evidenceIds,
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Resolve conflicting assumptions for ${assumption.target.objectId}.${assumption.target.propertyPath}`,
      description: explanation,
      action: {
        type: "resolve-conflict",
        instruction:
          "Identify which assumed value, if any, should remain active.",
        targetProperty: assumption.target.propertyPath,
      },
      reviewStatus: "review-required",
      blockingStatus: "blocked",
      affectedObjects: [assumption.target],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds,
      assumptionIds: [assumption.id],
    },
  );
}

export function validateAssumptions(
  input: AssumptionsValidationInput,
): ValidationBatch {
  const activeByTarget = new Map<string, Assumption[]>();

  for (const assumption of input.payload.assumptions) {
    if (assumption.status !== "active") {
      continue;
    }

    const key = targetKey(assumption);
    const group = activeByTarget.get(key) ?? [];
    group.push(assumption);
    activeByTarget.set(key, group);
  }

  const batches: ValidationBatch[] = [];

  for (const assumption of input.payload.assumptions) {
    const activeGroup = activeByTarget.get(targetKey(assumption)) ?? [];
    const conflictingIds = activeGroup
      .map((entry) => entry.id)
      .filter((id) => id !== assumption.id)
      .sort((left, right) => left.localeCompare(right));

    batches.push(
      validatePolicyForbidden(assumption),
      validateReviewRequired(assumption),
      validateApprovalRequired(assumption),
      validateSourceConsistent(assumption),
      validateMaterialImpactResolved(assumption),
      validateReviewTraceable(assumption),
      validateTargetConflict(assumption, conflictingIds),
    );
  }

  return mergeValidationBatches(...batches);
}
