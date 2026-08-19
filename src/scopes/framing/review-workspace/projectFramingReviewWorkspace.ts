import type { Assumption } from "../../../core/schemas/assumption.schema.js";
import type {
  ObjectId,
  ReviewItemId,
} from "../../../core/schemas/identity.schema.js";
import type { PropertyResolutionTrace } from "../../../core/schemas/resolved-object.schema.js";
import type { ReviewItem } from "../../../core/schemas/review-item.schema.js";
import type { UserDecision } from "../../../core/schemas/user-decision.schema.js";
import type { ValidationIssue } from "../../../core/schemas/validation.schema.js";
import {
  reviewWorkspacePayloadSchema,
  type ReviewWorkspaceItem,
  type ReviewWorkspaceMaterialLine,
  type ReviewWorkspacePayload,
  type ReviewWorkspaceResolvedItem,
  type ReviewWorkspaceSummary,
  type ReviewWorkspaceValueSource,
} from "../../../core/schemas/review-workspace.schema.js";
import { createMaterialLineItemId } from "../calculators/ids.js";
import type {
  FramingCalculationsPayload,
  OpeningsPayload,
  StructuralMembersPayload,
  ValidationPayload,
  WallFramingPayload,
} from "../schemas/framing-artifacts.schema.js";
import type { FramingMaterialLineItem } from "../schemas/material.schema.js";
import {
  findPropertyResolutionTrace,
  readFramingPropertyValue,
  type FramingResolvedObject,
} from "./readResolvedPropertyValue.js";

export type FramingReviewWorkspaceInput = {
  validation: ValidationPayload;
  calculations: FramingCalculationsPayload;
  openings: OpeningsPayload;
  structuralMembers: StructuralMembersPayload;
  wallFraming?: WallFramingPayload;
  userDecisions?: readonly UserDecision[];
  supplementalReviewItemsById?: ReadonlyMap<ReviewItemId, ReviewItem>;
};

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function buildResolvedObjectIndex(
  input: FramingReviewWorkspaceInput,
): Map<ObjectId, FramingResolvedObject> {
  const index = new Map<ObjectId, FramingResolvedObject>();

  for (const opening of input.openings.openings) {
    index.set(opening.id, { objectDomain: "opening", object: opening });
  }

  for (const member of input.structuralMembers.structuralMembers) {
    index.set(member.id, { objectDomain: "structural-member", object: member });
  }

  if (input.wallFraming) {
    for (const wall of input.wallFraming.walls) {
      index.set(wall.id, { objectDomain: "building-wall", object: wall });
    }
    for (const segment of input.wallFraming.segments) {
      index.set(segment.id, { objectDomain: "wall-segment", object: segment });
    }
  }

  return index;
}

function buildValidationIssueIndex(
  validation: ValidationPayload,
): Map<string, ValidationIssue> {
  return new Map(validation.validationIssues.map((issue) => [issue.id, issue]));
}

function findAssumptionsForReviewItem(
  assumptions: readonly Assumption[],
  reviewItem: ReviewItem,
  objectId: ObjectId,
  targetProperty: string | null,
): Assumption[] {
  return assumptions.filter(
    (assumption) =>
      assumption.status === "active" &&
      (assumption.reviewItemIds.includes(reviewItem.id) ||
        (assumption.target.objectId === objectId &&
          assumption.target.propertyPath === (targetProperty ?? ""))),
  );
}

function findMaterialLinesForReviewItem(
  materials: readonly FramingMaterialLineItem[],
  reviewItem: ReviewItem,
  objectId: ObjectId,
): FramingMaterialLineItem[] {
  const linked = materials.filter((material) =>
    material.reviewItemIds.includes(reviewItem.id),
  );
  if (linked.length > 0) {
    return linked;
  }

  const quantityKeys = reviewItem.quantityImpacts
    .map((impact) => impact.quantityKey)
    .filter((quantityKey): quantityKey is string => quantityKey !== null);

  const byQuantityKey = quantityKeys
    .map((quantityKey) =>
      materials.find(
        (material) =>
          material.id === createMaterialLineItemId(quantityKey, objectId) &&
          material.sourceObjectIds.includes(objectId),
      ),
    )
    .filter((material): material is FramingMaterialLineItem => material !== undefined);

  return byQuantityKey;
}

function toMaterialLineProjection(
  material: FramingMaterialLineItem,
  quantityKey: string | null,
): ReviewWorkspaceMaterialLine {
  return {
    materialLineId: material.id,
    quantityKey,
    description: material.description,
    quantity: material.quantity,
    unit: material.unit,
    assumptionIds: [...material.assumptionIds],
  };
}

function deriveValueSource(
  resolvedPropertyValue: unknown,
  resolutionTrace: PropertyResolutionTrace | undefined,
  linkedAssumptions: readonly Assumption[],
  isCalculationBlocked: boolean,
): ReviewWorkspaceValueSource {
  if (resolutionTrace?.method === "user-override") {
    return "user-override";
  }

  if (resolutionTrace?.method === "unresolved") {
    return "conflicted-unresolved";
  }

  if (resolutionTrace?.method === "explicit-project-value") {
    return "explicit-project-value";
  }

  if (
    resolvedPropertyValue !== null &&
    resolvedPropertyValue !== undefined &&
    resolutionTrace &&
    resolutionTrace.evidenceIds.length > 0
  ) {
    return "explicit-project-value";
  }

  if (linkedAssumptions.length > 0) {
    return "industry-default-assumption";
  }

  if (
    resolvedPropertyValue === null ||
    resolvedPropertyValue === undefined
  ) {
    return isCalculationBlocked ? "unresolved" : "not-applicable";
  }

  return "explicit-project-value";
}

function deriveCalculationValueUsed(
  valueSource: ReviewWorkspaceValueSource,
  resolvedPropertyValue: unknown,
  linkedAssumptions: readonly Assumption[],
  materialLines: readonly ReviewWorkspaceMaterialLine[],
): string | number | boolean | null {
  if (valueSource === "user-override" || valueSource === "explicit-project-value") {
    if (
      typeof resolvedPropertyValue === "string" ||
      typeof resolvedPropertyValue === "number" ||
      typeof resolvedPropertyValue === "boolean"
    ) {
      return resolvedPropertyValue;
    }
  }

  if (valueSource === "industry-default-assumption") {
    const assumptionValue = linkedAssumptions[0]?.assumedValue;
    if (
      typeof assumptionValue === "string" ||
      typeof assumptionValue === "number" ||
      typeof assumptionValue === "boolean"
    ) {
      return assumptionValue;
    }
  }

  const materialQuantity = materialLines[0]?.quantity;
  if (materialQuantity !== null && materialQuantity !== undefined) {
    return materialQuantity;
  }

  return null;
}

function buildCurrentStateExplanation(
  reviewItem: ReviewItem,
  valueSource: ReviewWorkspaceValueSource,
  linkedAssumptions: readonly Assumption[],
  resolutionTrace: PropertyResolutionTrace | undefined,
  isCalculationBlocked: boolean,
): string {
  if (valueSource === "user-override" && resolutionTrace) {
    return resolutionTrace.explanation;
  }

  if (valueSource === "industry-default-assumption") {
    const assumption = linkedAssumptions[0];
    if (assumption) {
      return assumption.reasonUsed;
    }
  }

  if (valueSource === "conflicted-unresolved" && resolutionTrace) {
    return resolutionTrace.explanation;
  }

  if (isCalculationBlocked) {
    return reviewItem.description;
  }

  if (valueSource === "unresolved") {
    return reviewItem.description;
  }

  return reviewItem.description;
}

function derivePropertyEvidenceIds(
  reviewItem: ReviewItem,
  resolutionTrace: PropertyResolutionTrace | undefined,
  valueSource: ReviewWorkspaceValueSource,
): ReviewItem["evidenceIds"] {
  if (resolutionTrace) {
    return resolutionTrace.evidenceIds;
  }

  if (valueSource === "industry-default-assumption") {
    return [];
  }

  return reviewItem.evidenceIds;
}

function deriveSeverity(
  reviewItem: ReviewItem,
  issuesById: ReadonlyMap<string, ValidationIssue>,
): ValidationIssue["severity"] | null {
  for (const issueId of reviewItem.validationIssueIds) {
    const issue = issuesById.get(issueId);
    if (issue) {
      return issue.severity;
    }
  }

  return null;
}

function projectActiveReviewItem(
  reviewItem: ReviewItem,
  input: FramingReviewWorkspaceInput,
  resolvedObjects: ReadonlyMap<ObjectId, FramingResolvedObject>,
  issuesById: ReadonlyMap<string, ValidationIssue>,
): ReviewWorkspaceItem {
  const affectedObject = reviewItem.affectedObjects[0];
  if (!affectedObject) {
    throw new Error(
      `Review Item ${reviewItem.id} must identify at least one affected object for review workspace projection.`,
    );
  }

  const objectId = affectedObject.objectId;
  const resolved = resolvedObjects.get(objectId);
  const targetProperty = reviewItem.action.targetProperty;
  const resolvedPropertyValue =
    resolved && targetProperty
      ? readFramingPropertyValue(resolved, targetProperty)
      : null;
  const resolutionTrace =
    resolved && targetProperty
      ? findPropertyResolutionTrace(resolved.object.resolutionTraces, targetProperty)
      : undefined;

  const linkedAssumptions = findAssumptionsForReviewItem(
    input.calculations.assumptions,
    reviewItem,
    objectId,
    targetProperty,
  );
  const materialMatches = findMaterialLinesForReviewItem(
    input.calculations.materials,
    reviewItem,
    objectId,
  );
  const materialLines = materialMatches.map((material) => {
    const quantityKey =
      reviewItem.quantityImpacts.find(
        (impact) =>
          impact.quantityKey !== null &&
          material.id === createMaterialLineItemId(impact.quantityKey, objectId),
      )?.quantityKey ?? null;
    return toMaterialLineProjection(material, quantityKey);
  });

  const isCalculationBlocked =
    reviewItem.blockingStatus === "blocked" ||
    reviewItem.blockingStatus === "partially-blocked" ||
    reviewItem.quantityImpacts.some(
      (impact) => impact.impact === "blocked" || impact.canCalculate === false,
    );

  const valueSource = deriveValueSource(
    resolvedPropertyValue,
    resolutionTrace,
    linkedAssumptions,
    isCalculationBlocked,
  );
  const calculationValueUsed = deriveCalculationValueUsed(
    valueSource,
    resolvedPropertyValue,
    linkedAssumptions,
    materialLines,
  );

  return {
    reviewItemId: reviewItem.id,
    objectId,
    objectType: affectedObject.objectType,
    objectDomain: resolved?.objectDomain ?? affectedObject.objectType,
    targetProperty,
    title: reviewItem.title,
    description: reviewItem.description,
    status: {
      reviewStatus: reviewItem.reviewStatus,
      blockingStatus: reviewItem.blockingStatus,
      reason: reviewItem.reason,
      severity: deriveSeverity(reviewItem, issuesById),
      queueState: "active",
    },
    currentState: {
      resolvedPropertyValue,
      calculationValueUsed,
      valueSource,
      explanation: buildCurrentStateExplanation(
        reviewItem,
        valueSource,
        linkedAssumptions,
        resolutionTrace,
        isCalculationBlocked,
      ),
    },
    provenance: {
      evidenceIds: derivePropertyEvidenceIds(
        reviewItem,
        resolutionTrace,
        valueSource,
      ),
      assumptionIds: linkedAssumptions.map((assumption) => assumption.id),
      userDecisionIds: resolutionTrace?.userDecisionIds ?? [],
      validationIssueIds: [...reviewItem.validationIssueIds],
      resolutionTrace: resolutionTrace ?? null,
    },
    calculationImpact: {
      quantityImpacts: [...reviewItem.quantityImpacts],
      materialLines,
      isCalculationBlocked,
    },
    action: reviewItem.action,
    decision: {
      activeUserDecisionId: null,
      supersedesUserDecisionId: null,
    },
  };
}

function lookupReviewItem(
  reviewItemId: ReviewItemId,
  input: FramingReviewWorkspaceInput,
): ReviewItem | undefined {
  return (
    input.validation.reviewItems.find((item) => item.id === reviewItemId) ??
    input.supplementalReviewItemsById?.get(reviewItemId)
  );
}

function projectResolvedUserDecision(
  decision: UserDecision,
  input: FramingReviewWorkspaceInput,
  resolvedObjects: ReadonlyMap<ObjectId, FramingResolvedObject>,
  issuesById: ReadonlyMap<string, ValidationIssue>,
): ReviewWorkspaceResolvedItem | undefined {
  const reviewItem = lookupReviewItem(decision.reviewItemId, input);
  if (!reviewItem) {
    return undefined;
  }

  const affectedObject = reviewItem.affectedObjects[0];
  if (!affectedObject) {
    return undefined;
  }

  const objectId = affectedObject.objectId;
  const resolved = resolvedObjects.get(objectId);
  const targetProperty = reviewItem.action.targetProperty;
  const resolutionTrace =
    resolved && targetProperty
      ? findPropertyResolutionTrace(resolved.object.resolutionTraces, targetProperty)
      : undefined;

  if (resolutionTrace?.method !== "user-override") {
    return undefined;
  }

  const resolvedPropertyValue =
    resolved && targetProperty
      ? readFramingPropertyValue(resolved, targetProperty)
      : null;

  const materialMatches = findMaterialLinesForReviewItem(
    input.calculations.materials,
    reviewItem,
    objectId,
  );
  const materialLines = materialMatches.map((material) => {
    const quantityKey =
      reviewItem.quantityImpacts.find(
        (impact) =>
          impact.quantityKey !== null &&
          material.id === createMaterialLineItemId(impact.quantityKey, objectId),
      )?.quantityKey ?? null;
    return toMaterialLineProjection(material, quantityKey);
  });

  const calculationValueUsed = deriveCalculationValueUsed(
    "user-override",
    resolvedPropertyValue,
    [],
    materialLines,
  );

  return {
    reviewItemId: reviewItem.id,
    objectId,
    objectType: affectedObject.objectType,
    objectDomain: resolved?.objectDomain ?? affectedObject.objectType,
    targetProperty,
    title: reviewItem.title,
    userDecisionId: decision.id,
    userDecisionResultType: decision.result.type,
    resolvedPropertyValue,
    calculationValueUsed,
    valueSource: "user-override",
    explanation:
      resolutionTrace?.explanation ??
      `Resolved from User Decision ${decision.id}.`,
    provenance: {
      evidenceIds: resolutionTrace?.evidenceIds ?? [],
      assumptionIds: [],
      userDecisionIds: [decision.id],
      validationIssueIds: [...reviewItem.validationIssueIds],
      resolutionTrace: resolutionTrace ?? null,
    },
    calculationImpact: {
      quantityImpacts: [...reviewItem.quantityImpacts],
      materialLines,
      isCalculationBlocked: false,
    },
  };
}

function sortActiveItems(items: ReviewWorkspaceItem[]): ReviewWorkspaceItem[] {
  return [...items].sort((left, right) => {
    const objectCompare = compareIds(left.objectId, right.objectId);
    if (objectCompare !== 0) {
      return objectCompare;
    }

    const propertyCompare = compareIds(
      left.targetProperty ?? "",
      right.targetProperty ?? "",
    );
    if (propertyCompare !== 0) {
      return propertyCompare;
    }

    return compareIds(left.reviewItemId, right.reviewItemId);
  });
}

function sortResolvedItems(
  items: ReviewWorkspaceResolvedItem[],
): ReviewWorkspaceResolvedItem[] {
  return [...items].sort((left, right) => {
    const objectCompare = compareIds(left.objectId, right.objectId);
    if (objectCompare !== 0) {
      return objectCompare;
    }

    return compareIds(left.userDecisionId, right.userDecisionId);
  });
}

function buildSummary(
  items: readonly ReviewWorkspaceItem[],
  resolvedItems: readonly ReviewWorkspaceResolvedItem[],
): ReviewWorkspaceSummary {
  const affectedObjectIds = new Set<ObjectId>();

  for (const item of items) {
    affectedObjectIds.add(item.objectId);
  }

  for (const item of resolvedItems) {
    affectedObjectIds.add(item.objectId);
  }

  return {
    activeReviewItemCount: items.length,
    blockingReviewItemCount: items.filter(
      (item) =>
        item.status.blockingStatus === "blocked" ||
        item.status.blockingStatus === "partially-blocked",
    ).length,
    reviewRecommendedCount: items.filter(
      (item) => item.status.reviewStatus === "review-recommended",
    ).length,
    affectedObjectCount: affectedObjectIds.size,
    calculatedUnderAssumptionCount: items.filter(
      (item) => item.currentState.valueSource === "industry-default-assumption",
    ).length,
    resolvedByUserDecisionCount: resolvedItems.length,
  };
}

/**
 * Derives a framing Review Workspace read model from canonical persisted engine
 * artifacts. This projection is not authoritative state.
 */
export function projectFramingReviewWorkspace(
  input: FramingReviewWorkspaceInput,
): ReviewWorkspacePayload {
  const resolvedObjects = buildResolvedObjectIndex(input);
  const issuesById = buildValidationIssueIndex(input.validation);

  const activeReviewItems = input.validation.reviewItems.filter(
    (reviewItem) => reviewItem.kind === "actionable",
  );

  const items = sortActiveItems(
    activeReviewItems.map((reviewItem) =>
      projectActiveReviewItem(reviewItem, input, resolvedObjects, issuesById),
    ),
  );

  const resolvedItems = sortResolvedItems(
    (input.userDecisions ?? [])
      .map((decision) =>
        projectResolvedUserDecision(
          decision,
          input,
          resolvedObjects,
          issuesById,
        ),
      )
      .filter(
        (item): item is ReviewWorkspaceResolvedItem => item !== undefined,
      ),
  );

  return reviewWorkspacePayloadSchema.parse({
    items,
    resolvedItems,
    summary: buildSummary(items, resolvedItems),
  });
}

export { reviewWorkspacePayloadSchema };
