import type { ObjectId, ReviewItemId } from "../../../core/schemas/identity.schema.js";
import type { ReviewItem } from "../../../core/schemas/review-item.schema.js";
import {
  reviewRootCauseProjectionSchema,
  type ContractorPrimaryQueueEntry,
  type DecisionReadiness,
  type GoverningDecisionGroup,
  type ReviewRootCause,
  type ReviewRootCauseProjection,
} from "../../../core/schemas/review-root-cause.schema.js";
import type { ValidationIssue } from "../../../core/schemas/validation.schema.js";
import type {
  FloorFramingPayload,
  OpeningsPayload,
  ValidationPayload,
  WallFramingPayload,
} from "../schemas/framing-artifacts.schema.js";

export type ReviewRootCauseProjectionInput = {
  validation: ValidationPayload;
  openings?: OpeningsPayload;
  wallFraming?: WallFramingPayload;
  floorFraming?: FloorFramingPayload;
};

type EnrichedReview = {
  reviewItem: ReviewItem;
  ruleId: string;
  objectId: ObjectId;
  objectType: string;
  targetProperty: string | null;
  validationIssueIds: string[];
};

type PendingGroup = {
  authorityKind: string;
  authorityKey: string;
  authorityStrength: "strong" | "weak";
  authorityExplanation: string;
  code: string;
  domain: string;
  scope: ReviewRootCause["scope"];
  decisionReadiness: DecisionReadiness;
  groupingConfidence: "high" | "medium" | "low";
  contractorSummary: string;
  materialRelevant: boolean;
  ruleIds: Set<string>;
  propertyPaths: Set<string>;
  reviews: EnrichedReview[];
};

const OPENING_PARENT_RULES = new Set([
  "opening.parent.resolved",
  "opening.parentWall.resolved",
]);

const WALL_HEIGHT_RULE = "wall.height.resolved";
const WALL_LOCATION_RULE = "wall.location.resolved";
const WALL_BEARING_RULE = "wall.bearing.resolved";
const FLOOR_PARENT_SYSTEM_RULE = "floor.area.parentSystem.resolved";

const INFORMATIONAL_RULES = new Set([
  WALL_LOCATION_RULE,
  WALL_BEARING_RULE,
]);

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function slugPart(value: string): string {
  return value
    .trim()
    .replace(/[^A-Za-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

function normalizePhysicalRunReferent(value: string): string {
  const trimmed = value.trim().replace(/\.$/, "");
  if (trimmed.startsWith("WS-")) {
    return trimmed.slice(3);
  }
  return trimmed;
}

function buildIssueIndex(
  validation: ValidationPayload,
): Map<string, ValidationIssue> {
  return new Map(validation.validationIssues.map((issue) => [issue.id, issue]));
}

function enrichReviewItems(
  validation: ValidationPayload,
): EnrichedReview[] {
  const issuesById = buildIssueIndex(validation);
  const enriched: EnrichedReview[] = [];

  for (const reviewItem of validation.reviewItems) {
    if (reviewItem.kind !== "actionable") {
      continue;
    }
    const affected = reviewItem.affectedObjects[0];
    if (!affected) {
      continue;
    }
    const firstIssueId = reviewItem.validationIssueIds[0];
    const issue = firstIssueId ? issuesById.get(firstIssueId) : undefined;
    const ruleId = issue?.ruleId ?? "unknown.rule";
    enriched.push({
      reviewItem,
      ruleId,
      objectId: affected.objectId,
      objectType: affected.objectType,
      targetProperty: reviewItem.action.targetProperty,
      validationIssueIds: [...reviewItem.validationIssueIds],
    });
  }

  return enriched;
}

function extractMissingParentReferent(
  entry: EnrichedReview,
  openings: OpeningsPayload | undefined,
): string | null {
  const opening = openings?.openings.find((item) => item.id === entry.objectId);
  if (opening) {
    if (
      entry.ruleId === "opening.parent.resolved" &&
      opening.parentObjectId
    ) {
      return normalizePhysicalRunReferent(opening.parentObjectId);
    }
    if (
      entry.ruleId === "opening.parentWall.resolved" &&
      opening.parentWallId
    ) {
      return normalizePhysicalRunReferent(opening.parentWallId);
    }
  }

  const parentObjectMatch = entry.reviewItem.description.match(
    /missing parent object (\S+?)\.?$/,
  );
  if (parentObjectMatch?.[1]) {
    return normalizePhysicalRunReferent(parentObjectMatch[1]);
  }
  const parentWallMatch = entry.reviewItem.description.match(
    /missing parent wall (\S+?)\.?$/,
  );
  if (parentWallMatch?.[1]) {
    return normalizePhysicalRunReferent(parentWallMatch[1]);
  }
  return null;
}

function extractFloorParentSystemReferent(
  entry: EnrichedReview,
  floorFraming: FloorFramingPayload | undefined,
): string | null {
  const area = floorFraming?.areas.find((item) => item.id === entry.objectId);
  if (area?.parentSystemId) {
    return area.parentSystemId;
  }
  const match = entry.reviewItem.description.match(
    /missing parent system (\S+?)\.?$/,
  );
  return match?.[1] ?? null;
}

function wallsLackPartitionKeys(
  wallFraming: WallFramingPayload | undefined,
  objectIds: readonly ObjectId[],
): boolean {
  if (!wallFraming) {
    // Without wall payloads, M.8-established unpartitioned height family still
    // applies when all height reviews share the same rule with no partition key.
    return true;
  }
  for (const objectId of objectIds) {
    const wall = wallFraming.walls.find((item) => item.id === objectId);
    if (!wall) {
      continue;
    }
    if (wall.level !== null && wall.level !== undefined) {
      return false;
    }
    if (wall.location !== "unknown") {
      return false;
    }
  }
  return true;
}

function worstBlockingStatus(
  reviews: readonly EnrichedReview[],
): ReviewRootCause["blockingStatus"] {
  if (reviews.some((entry) => entry.reviewItem.blockingStatus === "blocked")) {
    return "blocked";
  }
  if (
    reviews.some(
      (entry) => entry.reviewItem.blockingStatus === "partially-blocked",
    )
  ) {
    return "partially-blocked";
  }
  return "not-blocked";
}

function isPrimaryActionableReview(entry: EnrichedReview): boolean {
  const status = entry.reviewItem.blockingStatus;
  return status === "blocked" || status === "partially-blocked";
}

function isInformationalReview(entry: EnrichedReview): boolean {
  return (
    INFORMATIONAL_RULES.has(entry.ruleId) ||
    (entry.reviewItem.blockingStatus === "not-blocked" &&
      entry.reviewItem.reviewStatus === "review-recommended" &&
      entry.reviewItem.quantityImpacts.length === 0)
  );
}

function createGoverningGroup(
  rootCauseId: string,
  decisionReadiness: DecisionReadiness,
  contractorSummary: string,
  reviews: readonly EnrichedReview[],
): GoverningDecisionGroup {
  const affectedObjectIds = [
    ...new Set(reviews.map((entry) => entry.objectId)),
  ].sort(compareIds) as ObjectId[];
  const affectedReviewItemIds = reviews
    .map((entry) => entry.reviewItem.id)
    .sort(compareIds) as ReviewItemId[];

  return {
    id: `${rootCauseId}::gov-1`,
    decisionReadiness,
    contractorSummary,
    affectedReviewItemIds,
    affectedObjectIds,
    affectedObjectCount: affectedObjectIds.length,
  };
}

function finalizeRootCause(pending: PendingGroup): ReviewRootCause {
  const affectedObjectIds = [
    ...new Set(pending.reviews.map((entry) => entry.objectId)),
  ].sort(compareIds) as ObjectId[];
  const affectedReviewItemIds = pending.reviews
    .map((entry) => entry.reviewItem.id)
    .sort(compareIds) as ReviewItemId[];
  const validationIssueIds = [
    ...new Set(
      pending.reviews.flatMap((entry) => entry.validationIssueIds),
    ),
  ].sort(compareIds);

  const id = `RC-${slugPart(pending.authorityKind)}-${slugPart(pending.authorityKey)}`;
  const governingGroups =
    pending.decisionReadiness === "INFORMATIONAL"
      ? []
      : [
          createGoverningGroup(
            id,
            pending.decisionReadiness,
            pending.contractorSummary,
            pending.reviews,
          ),
        ];

  return {
    id,
    code: pending.code,
    ruleIds: [...pending.ruleIds].sort(compareIds),
    propertyPaths: [...pending.propertyPaths].sort(compareIds),
    domain: pending.domain,
    scope: pending.scope,
    decisionReadiness: pending.decisionReadiness,
    groupingConfidence: pending.groupingConfidence,
    contractorSummary: pending.contractorSummary,
    blockingStatus: worstBlockingStatus(pending.reviews),
    materialRelevant: pending.materialRelevant,
    affectedReviewItemIds,
    affectedObjectIds,
    affectedObjectCount: affectedObjectIds.length,
    validationIssueIds: validationIssueIds as ReviewRootCause["validationIssueIds"],
    groupingAuthority: {
      strength: pending.authorityStrength,
      kind: pending.authorityKind,
      key: pending.authorityKey,
      explanation: pending.authorityExplanation,
    },
    governingGroups,
    resolutionState: "unresolved",
  };
}

function upsertPending(
  pendingByKey: Map<string, PendingGroup>,
  key: string,
  seed: Omit<PendingGroup, "reviews" | "ruleIds" | "propertyPaths"> & {
    ruleId: string;
    propertyPath: string | null;
  },
  entry: EnrichedReview,
): void {
  const existing = pendingByKey.get(key);
  if (existing) {
    existing.reviews.push(entry);
    existing.ruleIds.add(seed.ruleId);
    if (seed.propertyPath) {
      existing.propertyPaths.add(seed.propertyPath);
    }
    return;
  }
  pendingByKey.set(key, {
    authorityKind: seed.authorityKind,
    authorityKey: seed.authorityKey,
    authorityStrength: seed.authorityStrength,
    authorityExplanation: seed.authorityExplanation,
    code: seed.code,
    domain: seed.domain,
    scope: seed.scope,
    decisionReadiness: seed.decisionReadiness,
    groupingConfidence: seed.groupingConfidence,
    contractorSummary: seed.contractorSummary,
    materialRelevant: seed.materialRelevant,
    ruleIds: new Set([seed.ruleId]),
    propertyPaths: new Set(
      seed.propertyPath ? [seed.propertyPath] : [],
    ),
    reviews: [entry],
  });
}

/**
 * Projects ReviewItems into root-cause families and a contractor primary queue.
 *
 * Strong grouping requires a structured shared missing referent (or an
 * explicitly encoded unpartitioned population). Same ruleId / property path
 * alone never produces ACTIONABLE_SINGLE_DECISION.
 */
export function projectReviewRootCauses(
  input: ReviewRootCauseProjectionInput,
): ReviewRootCauseProjection {
  const enriched = enrichReviewItems(input.validation);
  const pendingByKey = new Map<string, PendingGroup>();
  const groupedReviewIds = new Set<string>();

  // Pass 1: strong opening-parent consolidation by normalized missing referent.
  for (const entry of enriched) {
    if (!OPENING_PARENT_RULES.has(entry.ruleId)) {
      continue;
    }
    const referent = extractMissingParentReferent(entry, input.openings);
    if (!referent) {
      continue;
    }
    const key = `missing-parent-wall::${referent}`;
    upsertPending(
      pendingByKey,
      key,
      {
        authorityKind: "missing-parent-wall",
        authorityKey: referent,
        authorityStrength: "strong",
        authorityExplanation:
          "Same structured missing parent wall/run referent across opening.parent and opening.parentWall reviews.",
        code: "opening.missing_parent_wall",
        domain: "opening",
        scope: "system",
        decisionReadiness: "ACTIONABLE_SINGLE_DECISION",
        groupingConfidence: "high",
        contractorSummary: `Resolve missing parent wall/run ${referent} shared by ${0} openings.`,
        materialRelevant: true,
        ruleId: entry.ruleId,
        propertyPath: entry.targetProperty,
      },
      entry,
    );
    groupedReviewIds.add(entry.reviewItem.id);
  }

  // Fix summaries now that group sizes are known (opening parent).
  for (const pending of pendingByKey.values()) {
    if (pending.authorityKind !== "missing-parent-wall") {
      continue;
    }
    const objectCount = new Set(pending.reviews.map((item) => item.objectId))
      .size;
    pending.contractorSummary = `Resolve missing parent wall/run ${pending.authorityKey} shared by ${objectCount} openings (${pending.reviews.length} dependent reviews).`;
  }

  // Pass 2: wall height unpartitioned population (NEEDS_PARTITIONING).
  const heightReviews = enriched.filter(
    (entry) =>
      entry.ruleId === WALL_HEIGHT_RULE &&
      !groupedReviewIds.has(entry.reviewItem.id),
  );
  if (heightReviews.length >= 2) {
    const objectIds = heightReviews.map((entry) => entry.objectId);
    if (wallsLackPartitionKeys(input.wallFraming, objectIds)) {
      const key = "wall-height-unpartitioned::all";
      for (const entry of heightReviews) {
        upsertPending(
          pendingByKey,
          key,
          {
            authorityKind: "wall-height-unpartitioned",
            authorityKey: "all",
            authorityStrength: "strong",
            authorityExplanation:
              "Shared wall.height.resolved failure without bindable level/location partitions (M.8 multi-population).",
            code: "wall.height.authority_unresolved",
            domain: "wall",
            scope: "population",
            decisionReadiness: "NEEDS_PARTITIONING",
            groupingConfidence: "high",
            contractorSummary: `Wall-height authority unresolved for ${objectIds.length} walls. Additional grouping is required before a single value can safely apply.`,
            materialRelevant: true,
            ruleId: entry.ruleId,
            propertyPath: entry.targetProperty,
          },
          entry,
        );
        groupedReviewIds.add(entry.reviewItem.id);
      }
    }
  }

  // Pass 3: floor parent-system shared sentinel → NEEDS_PARTITIONING.
  for (const entry of enriched) {
    if (
      entry.ruleId !== FLOOR_PARENT_SYSTEM_RULE ||
      groupedReviewIds.has(entry.reviewItem.id)
    ) {
      continue;
    }
    const referent = extractFloorParentSystemReferent(
      entry,
      input.floorFraming,
    );
    if (referent !== "FFS-UNRESOLVED") {
      continue;
    }
    const key = `floor-parent-system-sentinel::${referent}`;
    upsertPending(
      pendingByKey,
      key,
      {
        authorityKind: "floor-parent-system-sentinel",
        authorityKey: referent,
        authorityStrength: "strong",
        authorityExplanation:
          "Multiple floor areas share the unresolved parent-system sentinel; distinct real systems are still required.",
        code: "floor.parent_system.authority_unresolved",
        domain: "floor",
        scope: "population",
        decisionReadiness: "NEEDS_PARTITIONING",
        groupingConfidence: "medium",
        contractorSummary: `Floor parent-system authority unresolved (${referent}) for multiple areas. Partitioning into real systems is required before safe binding.`,
        materialRelevant: true,
        ruleId: entry.ruleId,
        propertyPath: entry.targetProperty,
      },
      entry,
    );
    groupedReviewIds.add(entry.reviewItem.id);
  }

  // Pass 4: informational families (location / bearing) — weak family, not primary answers.
  for (const ruleId of INFORMATIONAL_RULES) {
    const items = enriched.filter(
      (entry) =>
        entry.ruleId === ruleId && !groupedReviewIds.has(entry.reviewItem.id),
    );
    if (items.length === 0) {
      continue;
    }
    const key = `informational-rule::${ruleId}`;
    for (const entry of items) {
      upsertPending(
        pendingByKey,
        key,
        {
          authorityKind: "informational-rule",
          authorityKey: ruleId,
          authorityStrength: "weak",
          authorityExplanation:
            "Repeated not-blocked / review-recommended classification without quantity impact; retained for audit, excluded from primary contractor queue.",
          code: ruleId,
          domain: ruleId.split(".")[0] ?? "unknown",
          scope: "population",
          decisionReadiness: "INFORMATIONAL",
          groupingConfidence: "medium",
          contractorSummary:
            ruleId === WALL_LOCATION_RULE
              ? `Wall location classification unresolved for ${items.length} walls (informational; not calculation-blocking).`
              : `Wall bearing classification unresolved for ${items.length} walls (informational; not calculation-blocking).`,
          materialRelevant: false,
          ruleId: entry.ruleId,
          propertyPath: entry.targetProperty,
        },
        entry,
      );
      groupedReviewIds.add(entry.reviewItem.id);
    }
  }

  const rootCauses = [...pendingByKey.values()]
    .map(finalizeRootCause)
    .sort((left, right) => compareIds(left.id, right.id));

  const dependentReviewItemIds = rootCauses
    .flatMap((cause) => cause.affectedReviewItemIds)
    .sort(compareIds) as ReviewItemId[];

  const primaryQueue: ContractorPrimaryQueueEntry[] = [];

  for (const cause of rootCauses) {
    if (cause.decisionReadiness === "INFORMATIONAL") {
      continue;
    }
    for (const group of cause.governingGroups) {
      primaryQueue.push({
        kind: "governing-issue",
        rootCauseId: cause.id,
        governingGroupId: group.id,
        decisionReadiness: group.decisionReadiness,
        title: group.contractorSummary,
        affectedObjectCount: group.affectedObjectCount,
        dependentReviewItemCount: group.affectedReviewItemIds.length,
      });
    }
  }

  const ungroupedPrimary = enriched.filter(
    (entry) =>
      !groupedReviewIds.has(entry.reviewItem.id) &&
      isPrimaryActionableReview(entry) &&
      !isInformationalReview(entry),
  );

  for (const entry of ungroupedPrimary.sort((left, right) =>
    compareIds(left.reviewItem.id, right.reviewItem.id),
  )) {
    primaryQueue.push({
      kind: "object-specific-review",
      reviewItemId: entry.reviewItem.id,
      objectId: entry.objectId,
      targetProperty: entry.targetProperty,
      title: entry.reviewItem.title,
      blockingStatus: entry.reviewItem.blockingStatus,
    });
  }

  primaryQueue.sort((left, right) => {
    const leftKey =
      left.kind === "governing-issue"
        ? `0:${left.rootCauseId}:${left.governingGroupId}`
        : `1:${left.reviewItemId}`;
    const rightKey =
      right.kind === "governing-issue"
        ? `0:${right.rootCauseId}:${right.governingGroupId}`
        : `1:${right.reviewItemId}`;
    return compareIds(leftKey, rightKey);
  });

  const secondaryInformationalRootCauseIds = rootCauses
    .filter((cause) => cause.decisionReadiness === "INFORMATIONAL")
    .map((cause) => cause.id)
    .sort(compareIds);

  const actionableGoverningDecisions = rootCauses.filter(
    (cause) => cause.decisionReadiness === "ACTIONABLE_SINGLE_DECISION",
  ).length;
  const needsPartitioningGroups = rootCauses.filter(
    (cause) => cause.decisionReadiness === "NEEDS_PARTITIONING",
  ).length;
  const informationalIssues = rootCauses.filter(
    (cause) => cause.decisionReadiness === "INFORMATIONAL",
  ).length;
  const objectSpecificDecisions = primaryQueue.filter(
    (entry) => entry.kind === "object-specific-review",
  ).length;

  const objectsCoveredByGroupedDecisions = new Set(
    rootCauses
      .filter((cause) => cause.decisionReadiness !== "INFORMATIONAL")
      .flatMap((cause) => cause.affectedObjectIds),
  ).size;

  const largestGroupSize = rootCauses.reduce(
    (max, cause) => Math.max(max, cause.affectedReviewItemIds.length),
    0,
  );

  const dependentCount = new Set(dependentReviewItemIds).size;
  const groupingCoveragePercent =
    enriched.length === 0
      ? 0
      : Math.round((dependentCount / enriched.length) * 1000) / 10;

  const blockingReviewItems = enriched.filter((entry) =>
    isPrimaryActionableReview(entry),
  ).length;

  return reviewRootCauseProjectionSchema.parse({
    rootCauses,
    primaryQueue,
    secondaryInformationalRootCauseIds,
    dependentReviewItemIds: [...new Set(dependentReviewItemIds)].sort(
      compareIds,
    ),
    summary: {
      rawReviewItems: enriched.length,
      blockingReviewItems,
      dependentReviewItems: dependentCount,
      rootCauseFamilies: rootCauses.length,
      actionableGoverningDecisions,
      needsPartitioningGroups,
      objectSpecificDecisions,
      informationalIssues,
      contractorPrimaryQueueCount: primaryQueue.length,
      objectsCoveredByGroupedDecisions,
      largestGroupSize,
      groupingCoveragePercent,
    },
  });
}
