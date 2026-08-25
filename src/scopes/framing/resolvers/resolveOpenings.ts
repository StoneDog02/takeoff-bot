import type { Evidence } from "../../../core/schemas/evidence.schema.js";
import type { ReviewItemId, EvidenceId, ObjectId } from "../../../core/schemas/identity.schema.js";
import type { ReviewItem } from "../../../core/schemas/review-item.schema.js";
import type { UserDecision } from "../../../core/schemas/user-decision.schema.js";
import type { GoverningApplyEligibility } from "../../../core/schemas/governing-propagation.schema.js";
import type { GoverningDecisionAnswer } from "../../../core/schemas/governing-propagation.schema.js";
import type { ReviewRootCause } from "../../../core/schemas/review-root-cause.schema.js";
import {
  buildCombinedOverrideIndex,
  filterOutGoverningUserDecisions,
} from "./applyGoverningDecision.js";
import {
  buildUserDecisionIndex,
  createUserOverrideTrace,
  filterUserDecisionsForPropertyPaths,
  findAppliedUserDecision,
  type SubjectBinding,
  type UserDecisionIndex,
} from "./applyUserDecisions.js";
import type {
  PropertyResolutionTrace,
  ResolutionMethod,
} from "../../../core/schemas/resolved-object.schema.js";
import type { Completion } from "../../../core/schemas/status.schema.js";
import {
  openingsPayloadSchema,
  type OpeningsPayload,
  type WallFramingPayload,
} from "../schemas/framing-artifacts.schema.js";
import type { Opening } from "../schemas/opening.schema.js";
import {
  createDisambiguatedOpeningObjectId,
  createOpeningObjectId,
  createWallObjectId,
  createWallSegmentObjectId,
  sanitizeSubjectKey,
} from "./ids.js";
import {
  isResolvedOpeningPropertyValue,
  normalizeOpeningCandidate,
  normalizeOpeningRelationshipCandidate,
  OPENING_COMPLETION_PROPERTY_PATHS,
  OPENING_PROPERTY_PATHS,
  OPENING_RELATIONSHIP_PROPERTY_PATHS,
  isOpeningPropertyPath,
  type OpeningCompletionPropertyPath,
  type OpeningPropertyPath,
  type OpeningRelationshipPropertyPath,
} from "./openingPropertyPaths.js";

type CandidateDecision =
  | { kind: "missing" }
  | { kind: "resolved"; value: string | number; evidenceIds: EvidenceId[] }
  | { kind: "conflict"; evidenceIds: EvidenceId[] };

export type ResolveOpeningsOptions = {
  wallFraming?: WallFramingPayload;
  userDecisions?: readonly UserDecision[];
  reviewItemsById?: ReadonlyMap<ReviewItemId, ReviewItem>;
  governingAnswers?: readonly GoverningDecisionAnswer[];
  rootCausesById?: ReadonlyMap<string, ReviewRootCause>;
  governingEligibilityByAnswerId?: ReadonlyMap<string, GoverningApplyEligibility>;
};

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueSortedIds(ids: readonly string[]): EvidenceId[] {
  return [...new Set(ids)].sort(compareIds) as EvidenceId[];
}

function selectCandidate(
  records: readonly Evidence[],
  propertyPath: OpeningPropertyPath | OpeningRelationshipPropertyPath,
  normalize: (
    path: OpeningPropertyPath | OpeningRelationshipPropertyPath,
    candidateValue: Evidence["candidateValue"],
  ) => string | number | undefined,
): CandidateDecision {
  const usable: Array<{ value: string | number; id: EvidenceId }> = [];

  for (const record of records) {
    if (record.propertyPath !== propertyPath) {
      continue;
    }

    const value = normalize(propertyPath, record.candidateValue);
    if (value === undefined) {
      continue;
    }

    usable.push({ value, id: record.id });
  }

  if (usable.length === 0) {
    return { kind: "missing" };
  }

  const grouped = new Map<string, { value: string | number; ids: EvidenceId[] }>();
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

function normalizeOpeningPropertyOrRelationship(
  propertyPath: OpeningPropertyPath | OpeningRelationshipPropertyPath,
  candidateValue: Evidence["candidateValue"],
): string | number | undefined {
  if (
    (OPENING_RELATIONSHIP_PROPERTY_PATHS as readonly string[]).includes(propertyPath)
  ) {
    return normalizeOpeningRelationshipCandidate(
      propertyPath as OpeningRelationshipPropertyPath,
      candidateValue,
    );
  }

  return normalizeOpeningCandidate(propertyPath as OpeningPropertyPath, candidateValue);
}

function formatValues(
  records: readonly Evidence[],
  propertyPath: OpeningPropertyPath | OpeningRelationshipPropertyPath,
): string {
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

function createTrace(
  propertyPath: string,
  method: ResolutionMethod,
  explanation: string,
  evidenceIds: readonly EvidenceId[],
): PropertyResolutionTrace {
  return {
    propertyPath,
    method,
    explanation,
    evidenceIds: uniqueSortedIds(evidenceIds),
    assumptionIds: [],
    userDecisionIds: [],
    validationIssueIds: [],
    reviewItemIds: [],
  };
}

function tracesForDecision(
  propertyPath: OpeningPropertyPath | OpeningRelationshipPropertyPath,
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

function resolvedStringValue(
  decision: CandidateDecision,
  fallback: string | null,
): string | null {
  return decision.kind === "resolved" ? (decision.value as string) : fallback;
}

function resolvedNumberValue(
  decision: CandidateDecision,
  fallback: number | null,
): number | null {
  return decision.kind === "resolved" ? (decision.value as number) : fallback;
}

function valueForCompletionPath(
  values: {
    category: Opening["category"];
    dimensions: Opening["dimensions"];
    quantity: number | null;
  },
  propertyPath: OpeningCompletionPropertyPath,
): string | number | null {
  switch (propertyPath) {
    case "category":
      return values.category;
    case "dimensions.nominalWidthFeet":
      return values.dimensions.nominalWidthFeet;
    case "dimensions.nominalHeightFeet":
      return values.dimensions.nominalHeightFeet;
    case "dimensions.roughWidthFeet":
      return values.dimensions.roughWidthFeet;
    case "dimensions.roughHeightFeet":
      return values.dimensions.roughHeightFeet;
    case "quantity":
      return values.quantity;
  }
}

function resolvePhysicalRunRelationship(
  parentPhysicalRunKeyDecision: CandidateDecision,
  records: readonly Evidence[],
  wallFraming: WallFramingPayload | undefined,
): {
  parentWallId: ObjectId | null;
  parentObjectId: ObjectId | null;
  traces: PropertyResolutionTrace[];
} {
  const keyTraces = tracesForDecision(
    "parentPhysicalRunKey",
    parentPhysicalRunKeyDecision,
    records,
  );

  if (parentPhysicalRunKeyDecision.kind !== "resolved") {
    return {
      parentWallId: null,
      parentObjectId: null,
      traces: keyTraces,
    };
  }

  const runKey = parentPhysicalRunKeyDecision.value as string;
  const parentWallId = createWallObjectId(runKey);
  const parentObjectId = createWallSegmentObjectId(parentWallId);

  const wall = wallFraming?.walls.find((candidate) => candidate.id === parentWallId);
  const segment = wallFraming?.segments.find(
    (candidate) => candidate.id === parentObjectId,
  );

  const relationshipTraces: PropertyResolutionTrace[] = [...keyTraces];

  if (wall && segment && segment.parentWallId === parentWallId) {
    relationshipTraces.push(
      createTrace(
        "parentWallId",
        "deterministic-calculation",
        `Mapped physical run key ${runKey} to resolved wall ${parentWallId}.`,
        parentPhysicalRunKeyDecision.evidenceIds,
      ),
      createTrace(
        "parentObjectId",
        "deterministic-calculation",
        `Mapped physical run key ${runKey} to wall segment ${parentObjectId}.`,
        parentPhysicalRunKeyDecision.evidenceIds,
      ),
    );

    return {
      parentWallId,
      parentObjectId,
      traces: relationshipTraces,
    };
  }

  relationshipTraces.push(
    createTrace(
      "parentWallId",
      "deterministic-calculation",
      `Mapped physical run key ${runKey} to ObjectId ${parentWallId}, but no matching resolved wall exists.`,
      parentPhysicalRunKeyDecision.evidenceIds,
    ),
    createTrace(
      "parentObjectId",
      "deterministic-calculation",
      `Mapped physical run key ${runKey} to segment ObjectId ${parentObjectId}, but no matching wall segment exists.`,
      parentPhysicalRunKeyDecision.evidenceIds,
    ),
  );

  return {
    parentWallId,
    parentObjectId,
    traces: relationshipTraces,
  };
}

function resolveWallRelationship(
  parentWallTagDecision: CandidateDecision,
  records: readonly Evidence[],
  wallFraming: WallFramingPayload | undefined,
): {
  parentWallId: ObjectId | null;
  parentObjectId: ObjectId | null;
  traces: PropertyResolutionTrace[];
} {
  const tagTraces = tracesForDecision("parentWallTag", parentWallTagDecision, records);

  if (parentWallTagDecision.kind !== "resolved") {
    return {
      parentWallId: null,
      parentObjectId: null,
      traces: tagTraces,
    };
  }

  const wallTag = parentWallTagDecision.value as string;
  const parentWallId = createWallObjectId(wallTag);
  const parentObjectId = createWallSegmentObjectId(parentWallId);

  const wall = wallFraming?.walls.find((candidate) => candidate.id === parentWallId);
  const segment = wallFraming?.segments.find(
    (candidate) => candidate.id === parentObjectId,
  );

  const relationshipTraces: PropertyResolutionTrace[] = [...tagTraces];

  if (wall && segment && segment.parentWallId === parentWallId) {
    relationshipTraces.push(
      createTrace(
        "parentWallId",
        "deterministic-calculation",
        `Mapped explicit wall tag ${wallTag} to resolved wall ${parentWallId}.`,
        parentWallTagDecision.evidenceIds,
      ),
      createTrace(
        "parentObjectId",
        "deterministic-calculation",
        `Mapped explicit wall tag ${wallTag} to current wall segment ${parentObjectId}.`,
        parentWallTagDecision.evidenceIds,
      ),
    );

    return {
      parentWallId,
      parentObjectId,
      traces: relationshipTraces,
    };
  }

  relationshipTraces.push(
    createTrace(
      "parentWallId",
      "deterministic-calculation",
      `Mapped explicit wall tag ${wallTag} to ObjectId ${parentWallId}, but no matching resolved wall exists.`,
      parentWallTagDecision.evidenceIds,
    ),
    createTrace(
      "parentObjectId",
      "deterministic-calculation",
      `Mapped explicit wall tag ${wallTag} to segment ObjectId ${parentObjectId}, but no matching resolved wall segment exists.`,
      parentWallTagDecision.evidenceIds,
    ),
  );

  return {
    parentWallId,
    parentObjectId,
    traces: relationshipTraces,
  };
}

function groupBySubjectKey(evidence: readonly Evidence[]): Map<string, Evidence[]> {
  const groups = new Map<string, Evidence[]>();

  for (const record of evidence) {
    if (record.subjectKind !== "opening") {
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

type SourceRegion = NonNullable<Evidence["source"]["region"]>;

function isGeometryOpeningKey(subjectKey: string): boolean {
  return subjectKey.startsWith("opening:p");
}

function regionsOverlap(left: SourceRegion, right: SourceRegion): boolean {
  if (left.coordinateSpace !== right.coordinateSpace) {
    return false;
  }

  const leftRight = left.x + left.width;
  const leftBottom = left.y + left.height;
  const rightRight = right.x + right.width;
  const rightBottom = right.y + right.height;

  return (
    left.x < rightRight &&
    right.x < leftRight &&
    left.y < rightBottom &&
    right.y < leftBottom
  );
}

function regionsFromRecords(records: readonly Evidence[]): SourceRegion[] {
  return records
    .map((record) => record.source.region)
    .filter((region): region is SourceRegion => region != null);
}

function parentPhysicalRunKeyFromRecords(records: readonly Evidence[]): string | null {
  for (const record of records) {
    if (
      record.propertyPath === "parentPhysicalRunKey" &&
      typeof record.candidateValue === "string" &&
      record.candidateValue.length > 0
    ) {
      return record.candidateValue;
    }
  }

  return null;
}

function groupsPhysicallyCorroborate(
  leftRecords: readonly Evidence[],
  rightRecords: readonly Evidence[],
): boolean {
  const leftRegions = regionsFromRecords(leftRecords);
  const rightRegions = regionsFromRecords(rightRecords);

  for (const leftRegion of leftRegions) {
    for (const rightRegion of rightRegions) {
      if (regionsOverlap(leftRegion, rightRegion)) {
        return true;
      }
    }
  }

  const leftRun = parentPhysicalRunKeyFromRecords(leftRecords);
  const rightRun = parentPhysicalRunKeyFromRecords(rightRecords);
  if (leftRun != null && rightRun != null && leftRun === rightRun) {
    const leftOffsets = leftRecords
      .filter((record) => record.propertyPath === "positionOffsetFeetFromSegmentStart")
      .map((record) => record.candidateValue);
    const rightOffsets = rightRecords
      .filter((record) => record.propertyPath === "positionOffsetFeetFromSegmentStart")
      .map((record) => record.candidateValue);

    if (leftOffsets.length === 0 || rightOffsets.length === 0) {
      return true;
    }

    return leftOffsets.some((leftOffset) => rightOffsets.includes(leftOffset));
  }

  for (const leftRecord of leftRecords) {
    for (const rightRecord of rightRecords) {
      const leftLabel = leftRecord.source.elementLabel;
      const rightLabel = rightRecord.source.elementLabel;
      if (
        leftLabel &&
        rightLabel &&
        leftLabel === rightLabel &&
        leftRecord.source.region &&
        rightRecord.source.region &&
        regionsOverlap(leftRecord.source.region, rightRecord.source.region)
      ) {
        return true;
      }
    }
  }

  return false;
}

function groupsHaveDistinguishingGeometry(
  leftRecords: readonly Evidence[],
  rightRecords: readonly Evidence[],
): boolean {
  const leftRegions = regionsFromRecords(leftRecords);
  const rightRegions = regionsFromRecords(rightRecords);

  if (leftRegions.length === 0 || rightRegions.length === 0) {
    return false;
  }

  for (const leftRegion of leftRegions) {
    for (const rightRegion of rightRegions) {
      if (!regionsOverlap(leftRegion, rightRegion)) {
        return true;
      }
    }
  }

  return false;
}

function locationBucketKey(records: readonly Evidence[]): string {
  const pageNumber = records[0]?.source.page.pageNumber ?? 0;
  const tileId = records[0]?.source.tileId ?? "";
  return `${pageNumber}|${tileId}`;
}

function locationFingerprint(records: readonly Evidence[]): string {
  const regions = regionsFromRecords(records).sort((left, right) => {
    const leftKey = `${left.x}:${left.y}:${left.width}:${left.height}`;
    const rightKey = `${right.x}:${right.y}:${right.width}:${right.height}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });

  if (regions.length > 0) {
    const region = regions[0]!;
    const x = Math.round(region.x * 10_000);
    const y = Math.round(region.y * 10_000);
    const width = Math.round(region.width * 10_000);
    const height = Math.round(region.height * 10_000);
    return `p${records[0]?.source.page.pageNumber}-r${x}-${y}-${width}-${height}`;
  }

  const pageNumber = records[0]?.source.page.pageNumber ?? 0;
  const tileId = records[0]?.source.tileId;
  if (tileId) {
    return `p${pageNumber}-t${tileId}`;
  }

  return `p${pageNumber}`;
}

type OpeningResolveCluster = {
  canonicalSubjectKey: string;
  openingId: ObjectId;
  records: Evidence[];
  rawSubjectKeys: string[];
  identityMode:
    | "geometry"
    | "semantic"
    | "confirmed-physical"
    | "semantic-pending"
    | "disambiguated";
};

function mergeRecords(groups: Array<{ subjectKey: string; records: Evidence[] }>): Evidence[] {
  return groups.flatMap((group) => group.records);
}

function clusterWithinLocationBucket(
  subjectKeyGroups: Array<{ subjectKey: string; records: Evidence[] }>,
  sanitizedKey: string,
): OpeningResolveCluster[] {
  if (subjectKeyGroups.length === 1) {
    const only = subjectKeyGroups[0]!;
    return [
      {
        canonicalSubjectKey: only.subjectKey,
        openingId: createOpeningObjectId(only.subjectKey),
        records: only.records,
        rawSubjectKeys: [only.subjectKey],
        identityMode: "semantic",
      },
    ];
  }

  const geometryDistinctPairs = subjectKeyGroups.some((left, leftIndex) =>
    subjectKeyGroups.some(
      (right, rightIndex) =>
        leftIndex < rightIndex &&
        groupsHaveDistinguishingGeometry(left.records, right.records),
    ),
  );

  if (geometryDistinctPairs) {
    return subjectKeyGroups.map((group) => ({
      canonicalSubjectKey: group.subjectKey,
      openingId: createDisambiguatedOpeningObjectId(
        sanitizedKey,
        locationFingerprint(group.records),
      ),
      records: group.records,
      rawSubjectKeys: [group.subjectKey],
      identityMode: "disambiguated" as const,
    }));
  }

  const hasPhysicalCorroboration = subjectKeyGroups.some((left, leftIndex) =>
    subjectKeyGroups.some(
      (right, rightIndex) =>
        leftIndex < rightIndex &&
        groupsPhysicallyCorroborate(left.records, right.records),
    ),
  );

  if (hasPhysicalCorroboration) {
    const mergedRecords = mergeRecords(subjectKeyGroups);
    return [
      {
        canonicalSubjectKey: sanitizedKey,
        openingId: createOpeningObjectId(sanitizedKey),
        records: mergedRecords,
        rawSubjectKeys: subjectKeyGroups.map((group) => group.subjectKey).sort(compareIds),
        identityMode: "confirmed-physical",
      },
    ];
  }

  const mergedRecords = mergeRecords(subjectKeyGroups);
  return [
    {
      canonicalSubjectKey: sanitizedKey,
      openingId: createOpeningObjectId(sanitizedKey),
      records: mergedRecords,
      rawSubjectKeys: subjectKeyGroups.map((group) => group.subjectKey).sort(compareIds),
      identityMode: "semantic-pending",
    },
  ];
}

function clusterSemanticOpeningGroups(
  groups: Map<string, Evidence[]>,
): OpeningResolveCluster[] {
  const semanticGroups = [...groups.entries()]
    .filter(([subjectKey]) => !isGeometryOpeningKey(subjectKey))
    .map(([subjectKey, records]) => ({ subjectKey, records }));

  const sanitizeBuckets = new Map<string, Array<{ subjectKey: string; records: Evidence[] }>>();
  for (const group of semanticGroups) {
    const bucketKey = sanitizeSubjectKey(group.subjectKey);
    const bucket = sanitizeBuckets.get(bucketKey);
    if (bucket) {
      bucket.push(group);
    } else {
      sanitizeBuckets.set(bucketKey, [group]);
    }
  }

  const clusters: OpeningResolveCluster[] = [];

  for (const [sanitizedKey, bucketGroups] of sanitizeBuckets) {
    if (bucketGroups.length === 1) {
      const only = bucketGroups[0]!;
      clusters.push({
        canonicalSubjectKey: only.subjectKey,
        openingId: createOpeningObjectId(only.subjectKey),
        records: only.records,
        rawSubjectKeys: [only.subjectKey],
        identityMode: "semantic",
      });
      continue;
    }

    const locationBuckets = new Map<
      string,
      Array<{ subjectKey: string; records: Evidence[] }>
    >();
    for (const group of bucketGroups) {
      const key = locationBucketKey(group.records);
      const bucket = locationBuckets.get(key);
      if (bucket) {
        bucket.push(group);
      } else {
        locationBuckets.set(key, [group]);
      }
    }

    if (locationBuckets.size > 1) {
      for (const locationGroups of locationBuckets.values()) {
        clusters.push(
          ...clusterWithinLocationBucket(locationGroups, sanitizedKey).map((cluster) => ({
            ...cluster,
            openingId:
              locationGroups.length === 1 && cluster.identityMode !== "disambiguated"
                ? createDisambiguatedOpeningObjectId(
                    sanitizedKey,
                    locationFingerprint(locationGroups[0]!.records),
                  )
                : cluster.openingId,
            identityMode:
              locationGroups.length === 1 && cluster.identityMode !== "disambiguated"
                ? ("disambiguated" as const)
                : cluster.identityMode,
          })),
        );
      }
      continue;
    }

    clusters.push(
      ...clusterWithinLocationBucket([...locationBuckets.values()][0]!, sanitizedKey),
    );
  }

  return clusters;
}

function buildOpeningResolveClusters(
  groups: Map<string, Evidence[]>,
): OpeningResolveCluster[] {
  const geometryClusters = [...groups.entries()]
    .filter(([subjectKey]) => isGeometryOpeningKey(subjectKey))
    .sort(([left], [right]) => compareIds(left, right))
    .map(([subjectKey, records]) => ({
      canonicalSubjectKey: subjectKey,
      openingId: createOpeningObjectId(subjectKey),
      records,
      rawSubjectKeys: [subjectKey],
      identityMode: "geometry" as const,
    }));

  const semanticClusters = clusterSemanticOpeningGroups(groups).sort((left, right) =>
    compareIds(left.openingId, right.openingId),
  );

  return [...geometryClusters, ...semanticClusters];
}

function identityTracesForCluster(cluster: OpeningResolveCluster): PropertyResolutionTrace[] {
  if (cluster.identityMode === "semantic-pending") {
    return [
      createTrace(
        "physicalIdentity",
        "semantic-cluster-pending-physical-link",
        `Semantic subjectKeys ${cluster.rawSubjectKeys.map((key) => `"${key}"`).join(", ")} sanitize to the same label without sufficient physical-location authority to confirm one physical opening.`,
        cluster.records.map((record) => record.id),
      ),
    ];
  }

  if (cluster.identityMode === "confirmed-physical") {
    return [
      createTrace(
        "physicalIdentity",
        "deterministic-calculation",
        `Corroborating physical signals merge semantic subjectKeys ${cluster.rawSubjectKeys.map((key) => `"${key}"`).join(", ")} into one opening.`,
        cluster.records.map((record) => record.id),
      ),
    ];
  }

  if (cluster.identityMode === "disambiguated") {
    return [
      createTrace(
        "physicalIdentity",
        "deterministic-calculation",
        `Distinct physical geometry or location disambiguates semantic label "${cluster.canonicalSubjectKey}" at ${locationFingerprint(cluster.records)}.`,
        cluster.records.map((record) => record.id),
      ),
    ];
  }

  return [];
}

function resolveOpeningPropertyAuthority(
  propertyPath: OpeningPropertyPath,
  records: readonly Evidence[],
  openingId: ObjectId,
  userDecisionIndex: UserDecisionIndex,
): { decision: CandidateDecision; traces: PropertyResolutionTrace[] } {
  const applied = findAppliedUserDecision(
    userDecisionIndex,
    openingId,
    propertyPath,
  );
  if (applied) {
    return {
      decision: {
        kind: "resolved",
        value: applied.value as string | number,
        evidenceIds: applied.acceptedEvidenceIds,
      },
      traces: [createUserOverrideTrace(applied)],
    };
  }

  const decision = selectCandidate(
    records,
    propertyPath,
    normalizeOpeningPropertyOrRelationship,
  );
  return {
    decision,
    traces: tracesForDecision(propertyPath, decision, records),
  };
}

function buildEvidenceById(
  evidence: readonly Evidence[],
): ReadonlyMap<EvidenceId, Evidence> {
  return new Map(evidence.map((record) => [record.id, record]));
}

function buildOpeningSubjectBindingByObjectId(
  clusters: readonly OpeningResolveCluster[],
): Map<ObjectId, SubjectBinding> {
  const subjectBindingByObjectId = new Map<ObjectId, SubjectBinding>();

  for (const cluster of clusters) {
    subjectBindingByObjectId.set(cluster.openingId, {
      subjectKey: cluster.canonicalSubjectKey,
      subjectKind: "opening",
    });
  }

  return subjectBindingByObjectId;
}

function buildUserDecisionContext(
  evidence: readonly Evidence[],
  clusters: readonly OpeningResolveCluster[],
  options?: ResolveOpeningsOptions,
): UserDecisionIndex {
  const userDecisions = options?.userDecisions ?? [];
  const governingAnswers = options?.governingAnswers ?? [];
  if (userDecisions.length === 0 && governingAnswers.length === 0) {
    return new Map();
  }

  if (!options?.reviewItemsById) {
    throw new Error(
      "resolveOpenings requires reviewItemsById when userDecisions or governingAnswers are supplied.",
    );
  }

  const subjectBindingByObjectId = buildOpeningSubjectBindingByObjectId(clusters);
  const ordinaryDecisions = filterOutGoverningUserDecisions(
    userDecisions,
    governingAnswers,
  );

  const ordinaryIndex =
    ordinaryDecisions.length === 0
      ? new Map()
      : buildUserDecisionIndex(
          filterUserDecisionsForPropertyPaths(
            {
              userDecisions: ordinaryDecisions,
              reviewItemsById: options.reviewItemsById,
              evidenceById: buildEvidenceById(evidence),
            },
            isOpeningPropertyPath,
            new Set(subjectBindingByObjectId.keys()),
          ),
          subjectBindingByObjectId,
        );

  if (governingAnswers.length === 0) {
    return ordinaryIndex;
  }

  if (!options.rootCausesById) {
    throw new Error(
      "resolveOpenings requires rootCausesById when governingAnswers are supplied.",
    );
  }

  const { index } = buildCombinedOverrideIndex({
    ordinaryIndex,
    governingAnswers,
    userDecisions,
    rootCausesById: options.rootCausesById,
    reviewItemsById: options.reviewItemsById,
    subjectBindingByObjectId,
    eligibilityByAnswerId: options.governingEligibilityByAnswerId,
  });
  return index;
}

function resolveOneOpening(
  cluster: OpeningResolveCluster,
  wallFraming: WallFramingPayload | undefined,
  userDecisionIndex: UserDecisionIndex,
): Opening {
  const { canonicalSubjectKey: subjectKey, records, openingId } = cluster;
  const propertyResults = Object.fromEntries(
    OPENING_PROPERTY_PATHS.map((propertyPath) => [
      propertyPath,
      resolveOpeningPropertyAuthority(
        propertyPath,
        records,
        openingId,
        userDecisionIndex,
      ),
    ]),
  ) as Record<
    OpeningPropertyPath,
    { decision: CandidateDecision; traces: PropertyResolutionTrace[] }
  >;

  const decisions = Object.fromEntries(
    OPENING_PROPERTY_PATHS.map((propertyPath) => [
      propertyPath,
      propertyResults[propertyPath]!.decision,
    ]),
  ) as Record<OpeningPropertyPath, CandidateDecision>;

  const parentPhysicalRunKeyDecision = selectCandidate(
    records,
    "parentPhysicalRunKey",
    normalizeOpeningPropertyOrRelationship,
  );
  const parentWallTagDecision = selectCandidate(
    records,
    "parentWallTag",
    normalizeOpeningPropertyOrRelationship,
  );
  const relationship =
    parentPhysicalRunKeyDecision.kind === "resolved"
      ? resolvePhysicalRunRelationship(
          parentPhysicalRunKeyDecision,
          records,
          wallFraming,
        )
      : resolveWallRelationship(parentWallTagDecision, records, wallFraming);

  const positionOffsetDecision = selectCandidate(
    records,
    "positionOffsetFeetFromSegmentStart",
    normalizeOpeningPropertyOrRelationship,
  );
  const dimensionOwnershipDecision = selectCandidate(
    records,
    "dimensionOwnershipStatus",
    normalizeOpeningPropertyOrRelationship,
  );

  const resolutionTraces = [
    ...identityTracesForCluster(cluster),
    ...OPENING_PROPERTY_PATHS.flatMap(
      (propertyPath) => propertyResults[propertyPath]!.traces,
    ),
    ...relationship.traces,
    ...tracesForDecision(
      "positionOffsetFeetFromSegmentStart",
      positionOffsetDecision,
      records,
    ),
    ...tracesForDecision(
      "dimensionOwnershipStatus",
      dimensionOwnershipDecision,
      records,
    ),
  ];

  const categoryDecision = decisions.category;
  const category =
    categoryDecision.kind === "resolved"
      ? (categoryDecision.value as Opening["category"])
      : "unknown";

  const dimensions = {
    nominalWidthFeet: resolvedNumberValue(
      decisions["dimensions.nominalWidthFeet"],
      null,
    ),
    nominalHeightFeet: resolvedNumberValue(
      decisions["dimensions.nominalHeightFeet"],
      null,
    ),
    roughWidthFeet: resolvedNumberValue(
      decisions["dimensions.roughWidthFeet"],
      null,
    ),
    roughHeightFeet: resolvedNumberValue(
      decisions["dimensions.roughHeightFeet"],
      null,
    ),
  };

  const quantity = resolvedNumberValue(decisions.quantity, null);
  const positionOffsetFeetFromSegmentStart =
    positionOffsetDecision.kind === "resolved"
      ? (positionOffsetDecision.value as number)
      : null;

  const completionValues = {
    category,
    dimensions,
    quantity,
  };

  const resolvedCount = OPENING_COMPLETION_PROPERTY_PATHS.filter((propertyPath) =>
    isResolvedOpeningPropertyValue(
      propertyPath,
      valueForCompletionPath(completionValues, propertyPath),
    ),
  ).length;

  return {
    id: openingId,
    objectType: "opening",
    completion: createCompletion(
      resolvedCount,
      OPENING_COMPLETION_PROPERTY_PATHS.length,
    ),
    reviewStatus: "no-review-required",
    blockingStatus: "not-blocked",
    evidenceIds: uniqueSortedIds(records.map((record) => record.id)),
    assumptionIds: [],
    validationIssueIds: [],
    reviewItemIds: [],
    resolutionTraces,
    category,
    parentObjectId: relationship.parentObjectId,
    parentWallId: relationship.parentWallId,
    dimensions,
    quantity,
    scheduleReference: resolvedStringValue(decisions.scheduleReference, null),
    detailReference: resolvedStringValue(decisions.detailReference, null),
    headerMemberId: null,
    fireRating: resolvedStringValue(decisions.fireRating, null),
    kingStudCount: resolvedNumberValue(decisions.kingStudCount, null),
    jackStudCount: resolvedNumberValue(decisions.jackStudCount, null),
    positionOffsetFeetFromSegmentStart,
  };
}

function assertUniqueOpeningIds(clusters: readonly OpeningResolveCluster[]): void {
  const seen = new Map<ObjectId, string[]>();

  for (const cluster of clusters) {
    const existing = seen.get(cluster.openingId);
    if (existing) {
      existing.push(cluster.canonicalSubjectKey);
    } else {
      seen.set(cluster.openingId, [cluster.canonicalSubjectKey]);
    }
  }

  for (const [openingId, subjectKeys] of seen) {
    if (subjectKeys.length <= 1) {
      continue;
    }

    throw new Error(
      `Opening resolve clusters ${subjectKeys.map((key) => `"${key}"`).join(" and ")} both resolve to Opening ObjectId ${openingId}.`,
    );
  }
}

/**
 * Deterministic Openings resolver.
 *
 * Groups Evidence by exact subjectKind + subjectKey, clusters semantic
 * observations with corroboration-gated physical identity, resolves scalar
 * opening facts, and when wallFraming is supplied maps explicit parentWallTag
 * Evidence to parentWallId / parentObjectId against resolved Wall objects.
 */
export function resolveOpenings(
  evidence: readonly Evidence[],
  options: ResolveOpeningsOptions = {},
): OpeningsPayload {
  const groups = groupBySubjectKey(evidence);
  const clusters = buildOpeningResolveClusters(groups);

  if (clusters.length === 0) {
    return openingsPayloadSchema.parse({ openings: [] });
  }

  assertUniqueOpeningIds(clusters);

  const userDecisionIndex = buildUserDecisionContext(evidence, clusters, options);

  const openings = clusters.map((cluster) =>
    resolveOneOpening(cluster, options.wallFraming, userDecisionIndex),
  );

  return openingsPayloadSchema.parse({ openings });
}
