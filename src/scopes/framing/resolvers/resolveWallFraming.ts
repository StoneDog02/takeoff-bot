import type { Evidence } from "../../../core/schemas/evidence.schema.js";
import type {
  EvidenceId,
  ObjectId,
  ReviewItemId,
} from "../../../core/schemas/identity.schema.js";
import type {
  PropertyResolutionTrace,
  ResolutionMethod,
} from "../../../core/schemas/resolved-object.schema.js";
import type { ReviewItem } from "../../../core/schemas/review-item.schema.js";
import type { Completion } from "../../../core/schemas/status.schema.js";
import type { UserDecision } from "../../../core/schemas/user-decision.schema.js";
import {
  wallFramingPayloadSchema,
  type WallFramingPayload,
} from "../schemas/framing-artifacts.schema.js";
import {
  type BuildingWall,
  type WallSegment,
} from "../schemas/wall.schema.js";
import {
  buildUserDecisionIndex,
  findAppliedUserDecision,
  createUserOverrideTrace,
  type UserDecisionIndex,
} from "./applyUserDecisions.js";
import { createWallObjectId, createWallSegmentObjectId } from "./ids.js";
import {
  isSegmentPropertyPath,
  normalizeWallFramingCandidate,
  SEGMENT_PROPERTY_PATHS,
  WALL_PROPERTY_PATHS,
  type SegmentPropertyPath,
  type WallPropertyPath,
} from "./wallFramingPropertyPaths.js";

type SupportedPropertyPath = WallPropertyPath | SegmentPropertyPath;

type CandidateDecision =
  | { kind: "missing" }
  | { kind: "resolved"; value: string | number | boolean; evidenceIds: EvidenceId[] }
  | { kind: "conflict"; evidenceIds: EvidenceId[] };

export type ResolveWallFramingOptions = {
  userDecisions?: readonly UserDecision[];
  reviewItemsById?: ReadonlyMap<ReviewItemId, ReviewItem>;
};

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueSortedIds(ids: readonly string[]): EvidenceId[] {
  return [...new Set(ids)].sort(compareIds) as EvidenceId[];
}

function selectCandidate(
  records: readonly Evidence[],
  propertyPath: SupportedPropertyPath,
): CandidateDecision {
  const usable: Array<{ value: string | number | boolean; id: EvidenceId }> = [];

  for (const record of records) {
    if (record.propertyPath !== propertyPath) {
      continue;
    }

    const value = normalizeWallFramingCandidate(propertyPath, record.candidateValue);
    if (value === undefined) {
      continue;
    }

    usable.push({ value, id: record.id });
  }

  if (usable.length === 0) {
    return { kind: "missing" };
  }

  const grouped = new Map<string, { value: string | number | boolean; ids: EvidenceId[] }>();
  for (const entry of usable) {
    const key = `${typeof entry.value}:${String(entry.value)}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.ids.push(entry.id);
    } else {
      grouped.set(key, { value: entry.value, ids: [entry.id] });
    }
  }

  if (grouped.size === 1) {
    const only = [...grouped.values()][0]!;
    return {
      kind: "resolved",
      value: only.value,
      evidenceIds: uniqueSortedIds(only.ids),
    };
  }

  return {
    kind: "conflict",
    evidenceIds: uniqueSortedIds(usable.map((entry) => entry.id)),
  };
}

function formatValues(records: readonly Evidence[], propertyPath: SupportedPropertyPath): string {
  const values = [
    ...new Set(
      records
        .filter((record) => record.propertyPath === propertyPath)
        .map((record) => String(record.candidateValue))
        .sort(compareIds),
    ),
  ];
  return values.join(", ");
}

function uniqueSortedReviewItemIds(
  ids: readonly ReviewItemId[],
): ReviewItemId[] {
  return [...new Set(ids)].sort(compareIds) as ReviewItemId[];
}

function createTrace(
  propertyPath: string,
  method: ResolutionMethod,
  explanation: string,
  evidenceIds: readonly EvidenceId[],
  reviewItemIds: readonly ReviewItemId[] = [],
): PropertyResolutionTrace {
  return {
    propertyPath,
    method,
    explanation,
    evidenceIds: uniqueSortedIds(evidenceIds),
    assumptionIds: [],
    userDecisionIds: [],
    validationIssueIds: [],
    reviewItemIds: uniqueSortedReviewItemIds(reviewItemIds),
  };
}

function tracesForDecision(
  propertyPath: SupportedPropertyPath,
  decision: CandidateDecision,
  records: readonly Evidence[],
): PropertyResolutionTrace[] {
  if (decision.kind === "resolved") {
    const explanation =
      decision.evidenceIds.length === 1
        ? `Resolved from explicit project evidence ${decision.evidenceIds[0]}.`
        : `Resolved from corroborating project evidence ${decision.evidenceIds.join(", ")}.`;

    return [
      createTrace(
        propertyPath,
        "explicit-project-value",
        explanation,
        decision.evidenceIds,
      ),
    ];
  }

  if (decision.kind === "conflict") {
    return [
      createTrace(
        propertyPath,
        "unresolved",
        `Conflicting candidate values (${formatValues(records, propertyPath)}); this slice does not apply precedence.`,
        decision.evidenceIds,
      ),
    ];
  }

  return [];
}

function resolvePropertyAuthority(
  propertyPath: SupportedPropertyPath,
  records: readonly Evidence[],
  objectId: ObjectId,
  userDecisionIndex: UserDecisionIndex,
): { decision: CandidateDecision; traces: PropertyResolutionTrace[] } {
  const applied = findAppliedUserDecision(
    userDecisionIndex,
    objectId,
    propertyPath,
  );
  if (applied) {
    return {
      decision: {
        kind: "resolved",
        value: applied.value,
        evidenceIds: applied.acceptedEvidenceIds,
      },
      traces: [createUserOverrideTrace(applied)],
    };
  }

  const decision = selectCandidate(records, propertyPath);
  return {
    decision,
    traces: tracesForDecision(propertyPath, decision, records),
  };
}

function isResolvedValue(
  propertyPath: SupportedPropertyPath,
  value: string | number | boolean | null,
): boolean {
  if (value === null) {
    return false;
  }

  if (
    propertyPath === "location" ||
    propertyPath === "bearingStatus" ||
    propertyPath === "constructionPhase"
  ) {
    return value !== "unknown";
  }

  return true;
}

function createCompletion(resolvedCount: number, totalCount: number): Completion {
  const percentage = totalCount === 0 ? 0 : (resolvedCount / totalCount) * 100;
  const status =
    resolvedCount === 0
      ? "not-started"
      : resolvedCount === totalCount
        ? "complete"
        : "partial";

  return {
    status,
    percentage,
    completedItems: resolvedCount,
    totalItems: totalCount,
  };
}

function resolvedValue<T extends string | number | boolean>(
  decision: CandidateDecision,
  fallback: T | null,
): T | null {
  return decision.kind === "resolved" ? (decision.value as T) : fallback;
}

function groupBySubjectKey(evidence: readonly Evidence[]): Map<string, Evidence[]> {
  const groups = new Map<string, Evidence[]>();

  for (const record of evidence) {
    if (record.subjectKind !== "wall") {
      continue;
    }

    const existing = groups.get(record.subjectKey);
    if (existing) {
      existing.push(record);
    } else {
      groups.set(record.subjectKey, [record]);
    }
  }

  return groups;
}

function resolveOneWall(
  subjectKey: string,
  records: readonly Evidence[],
  userDecisionIndex: UserDecisionIndex,
): { wall: BuildingWall; segment: WallSegment } {
  const wallId = createWallObjectId(subjectKey);
  const segmentId = createWallSegmentObjectId(wallId);

  const wallPropertyResults = Object.fromEntries(
    WALL_PROPERTY_PATHS.map((propertyPath) => [
      propertyPath,
      resolvePropertyAuthority(propertyPath, records, wallId, userDecisionIndex),
    ]),
  ) as Record<
    WallPropertyPath,
    { decision: CandidateDecision; traces: PropertyResolutionTrace[] }
  >;

  const wallDecisions = Object.fromEntries(
    WALL_PROPERTY_PATHS.map((propertyPath) => [
      propertyPath,
      wallPropertyResults[propertyPath]!.decision,
    ]),
  ) as Record<WallPropertyPath, CandidateDecision>;

  const wallTraces = WALL_PROPERTY_PATHS.flatMap(
    (propertyPath) => wallPropertyResults[propertyPath]!.traces,
  );

  const lengthResolved = resolvePropertyAuthority(
    "lengthFeet",
    records,
    segmentId,
    userDecisionIndex,
  );
  const segmentTraces = lengthResolved.traces;

  const wallValues = {
    wallType: resolvedValue<string>(wallDecisions.wallType, null),
    location: resolvedValue<"exterior" | "interior" | "unknown">(
      wallDecisions.location,
      "unknown",
    ) ?? "unknown",
    bearingStatus: resolvedValue<"bearing" | "non-bearing" | "unknown">(
      wallDecisions.bearingStatus,
      "unknown",
    ) ?? "unknown",
    isShearOrBraced: resolvedValue<boolean>(
      wallDecisions.isShearOrBraced,
      null,
    ),
    fireRating: resolvedValue<string>(wallDecisions.fireRating, null),
    constructionPhase: resolvedValue<"new" | "existing" | "demolition" | "unknown">(
      wallDecisions.constructionPhase,
      "unknown",
    ) ?? "unknown",
    assembly: {
      material: resolvedValue<string>(wallDecisions["assembly.material"], null),
      studSize: resolvedValue<string>(wallDecisions["assembly.studSize"], null),
      studSpacingInches: resolvedValue<number>(
        wallDecisions["assembly.studSpacingInches"],
        null,
      ),
      heightFeet: resolvedValue<number>(
        wallDecisions["assembly.heightFeet"],
        null,
      ),
      plateCount: resolvedValue<number>(
        wallDecisions["assembly.plateCount"],
        null,
      ),
      sheathing: resolvedValue<string>(wallDecisions["assembly.sheathing"], null),
    },
  };

  const wallResolvedCount = WALL_PROPERTY_PATHS.filter((propertyPath) => {
    if (propertyPath.startsWith("assembly.")) {
      const key = propertyPath.slice("assembly.".length) as keyof typeof wallValues.assembly;
      return isResolvedValue(propertyPath, wallValues.assembly[key]);
    }

    const key = propertyPath as Exclude<WallPropertyPath, `assembly.${string}`>;
    return isResolvedValue(propertyPath, wallValues[key]);
  }).length;

  const lengthFeet = resolvedValue<number>(lengthResolved.decision, null);
  const wallEvidenceIds = uniqueSortedIds(
    records
      .filter((record) => !isSegmentPropertyPath(record.propertyPath))
      .map((record) => record.id),
  );
  const segmentEvidenceIds = uniqueSortedIds(
    records
      .filter((record) => isSegmentPropertyPath(record.propertyPath))
      .map((record) => record.id),
  );

  const wall: BuildingWall = {
    id: wallId,
    objectType: "building-wall",
    completion: createCompletion(wallResolvedCount, WALL_PROPERTY_PATHS.length),
    reviewStatus: "no-review-required",
    blockingStatus: "not-blocked",
    evidenceIds: wallEvidenceIds,
    assumptionIds: [],
    validationIssueIds: [],
    reviewItemIds: [],
    resolutionTraces: wallTraces,
    name: subjectKey,
    level: null,
    ...wallValues,
    segmentIds: [segmentId],
  };

  const segment: WallSegment = {
    id: segmentId,
    objectType: "wall-segment",
    completion: createCompletion(lengthFeet === null ? 0 : 1, 1),
    reviewStatus: "no-review-required",
    blockingStatus: "not-blocked",
    evidenceIds: segmentEvidenceIds,
    assumptionIds: [],
    validationIssueIds: [],
    reviewItemIds: [],
    resolutionTraces: segmentTraces,
    parentWallId: wallId,
    lengthFeet,
    openingIds: [],
  };

  return { wall, segment };
}

type ResolvedSubjectIdentity = {
  subjectKey: string;
  wallId: BuildingWall["id"];
  segmentId: WallSegment["id"];
};

function assertNoObjectIdCollisions(identities: readonly ResolvedSubjectIdentity[]): void {
  const wallOwners = new Map<string, string[]>();
  const segmentOwners = new Map<string, string[]>();

  for (const identity of identities) {
    const wallSubjectKeys = wallOwners.get(identity.wallId) ?? [];
    wallSubjectKeys.push(identity.subjectKey);
    wallOwners.set(identity.wallId, wallSubjectKeys);

    const segmentSubjectKeys = segmentOwners.get(identity.segmentId) ?? [];
    segmentSubjectKeys.push(identity.subjectKey);
    segmentOwners.set(identity.segmentId, segmentSubjectKeys);
  }

  for (const [objectId, subjectKeys] of wallOwners) {
    if (subjectKeys.length <= 1) {
      continue;
    }

    const sortedSubjectKeys = [...subjectKeys].sort(compareIds);
    throw new Error(
      `subjectKeys ${sortedSubjectKeys.map((key) => `"${key}"`).join(" and ")} both resolve to Wall ObjectId ${objectId}.`,
    );
  }

  for (const [objectId, subjectKeys] of segmentOwners) {
    if (subjectKeys.length <= 1) {
      continue;
    }

    const sortedSubjectKeys = [...subjectKeys].sort(compareIds);
    throw new Error(
      `subjectKeys ${sortedSubjectKeys.map((key) => `"${key}"`).join(" and ")} both resolve to Segment ObjectId ${objectId}.`,
    );
  }
}

function buildEvidenceById(evidence: readonly Evidence[]): Map<EvidenceId, Evidence> {
  return new Map(evidence.map((record) => [record.id, record]));
}

function buildSubjectKeyByObjectId(
  subjectKeys: readonly string[],
): Map<ObjectId, string> {
  const subjectKeyByObjectId = new Map<ObjectId, string>();

  for (const subjectKey of subjectKeys) {
    const wallId = createWallObjectId(subjectKey);
    const segmentId = createWallSegmentObjectId(wallId);
    subjectKeyByObjectId.set(wallId, subjectKey);
    subjectKeyByObjectId.set(segmentId, subjectKey);
  }

  return subjectKeyByObjectId;
}

function buildUserDecisionContext(
  evidence: readonly Evidence[],
  subjectKeys: readonly string[],
  options?: ResolveWallFramingOptions,
): UserDecisionIndex {
  const userDecisions = options?.userDecisions ?? [];
  if (userDecisions.length === 0) {
    return new Map();
  }

  if (!options?.reviewItemsById) {
    throw new Error(
      "resolveWallFraming requires reviewItemsById when userDecisions are supplied.",
    );
  }

  return buildUserDecisionIndex(
    {
      userDecisions,
      reviewItemsById: options.reviewItemsById,
      evidenceById: buildEvidenceById(evidence),
    },
    buildSubjectKeyByObjectId(subjectKeys),
  );
}

/**
 * Deterministic Wall Framing resolver.
 *
 * Groups Evidence by exact subjectKey (after schema trim), resolves each
 * subject independently into one Building Wall and one Wall Segment, and
 * fails deterministically when distinct subjectKeys sanitize to the same
 * ObjectId. Optional User Decisions may resolve conflicted properties before
 * Evidence candidate selection runs. It never applies assumptions, sheet
 * precedence, validation, or quantity calculation.
 */
export function resolveWallFraming(
  evidence: readonly Evidence[],
  options?: ResolveWallFramingOptions,
): WallFramingPayload {
  const groups = groupBySubjectKey(evidence);
  const subjectKeys = [...groups.keys()].sort(compareIds);

  if (subjectKeys.length === 0) {
    return wallFramingPayloadSchema.parse({ walls: [], segments: [] });
  }

  const identities: ResolvedSubjectIdentity[] = subjectKeys.map((subjectKey) => ({
    subjectKey,
    wallId: createWallObjectId(subjectKey),
    segmentId: createWallSegmentObjectId(createWallObjectId(subjectKey)),
  }));
  assertNoObjectIdCollisions(identities);

  const userDecisionIndex = buildUserDecisionContext(evidence, subjectKeys, options);

  const walls: BuildingWall[] = [];
  const segments: WallSegment[] = [];

  for (const subjectKey of subjectKeys) {
    const { wall, segment } = resolveOneWall(
      subjectKey,
      groups.get(subjectKey) ?? [],
      userDecisionIndex,
    );
    walls.push(wall);
    segments.push(segment);
  }

  return wallFramingPayloadSchema.parse({ walls, segments });
}
