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
import {
  openingsPayloadSchema,
  type OpeningsPayload,
  type WallFramingPayload,
} from "../schemas/framing-artifacts.schema.js";
import type { Opening } from "../schemas/opening.schema.js";
import { isMarkDecodedOpeningDimensionEvidence } from "../geometry/openingMarkText.js";
import {
  createDisambiguatedOpeningObjectId,
  createOpeningObjectId,
  createWallObjectId,
  createWallSegmentObjectId,
  sanitizeSubjectKey,
} from "./ids.js";
import {
  normalizeOpeningCandidate,
  normalizeOpeningRelationshipCandidate,
  OPENING_PROPERTY_PATHS,
  OPENING_RELATIONSHIP_PROPERTY_PATHS,
  isOpeningPropertyPath,
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

    if (isMarkDecodedOpeningDimensionEvidence(record)) {
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
): PropertyResolutionTrace {
  return {
    propertyPath,
    method,
    explanation,
    assumptionIds: [],
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
      createTrace(propertyPath, "explicit-project-value", explanation),
    ];
  }

  if (decision.kind === "conflict") {
    return [
      createTrace(
        propertyPath,
        "unresolved",
        `Conflicting candidate values (${formatValues(records, propertyPath)}); this slice does not apply precedence.`,
      ),
    ];
  }

  return [];
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
      ),
      createTrace(
        "parentObjectId",
        "deterministic-calculation",
        `Mapped physical run key ${runKey} to wall segment ${parentObjectId}.`,
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
    ),
    createTrace(
      "parentObjectId",
      "deterministic-calculation",
      `Mapped physical run key ${runKey} to segment ObjectId ${parentObjectId}, but no matching wall segment exists.`,
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
      ),
      createTrace(
        "parentObjectId",
        "deterministic-calculation",
        `Mapped explicit wall tag ${wallTag} to current wall segment ${parentObjectId}.`,
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
    ),
    createTrace(
      "parentObjectId",
      "deterministic-calculation",
      `Mapped explicit wall tag ${wallTag} to segment ObjectId ${parentObjectId}, but no matching resolved wall segment exists.`,
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
    | "disambiguated"
    | "identity-binding-merge";
  /** Binding Evidence ids that authorized a cross-subject merge (if any). */
  bindingEvidenceIds?: EvidenceId[];
  /** True when competing bindings blocked a merge for this cluster. */
  bindingConflict?: boolean;
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

  return applyExplicitIdentityBindingMerges([
    ...geometryClusters,
    ...semanticClusters,
  ]);
}

/**
 * Merge clusters only when Evidence propertyPath identity.boundSubjectKey
 * uniquely binds two subjectKeys. Competing bindings leave clusters separate.
 * Never uses proximity, mark decode, or best-match heuristics.
 */
function applyExplicitIdentityBindingMerges(
  clusters: readonly OpeningResolveCluster[],
): OpeningResolveCluster[] {
  if (clusters.length === 0) {
    return [];
  }

  const working: OpeningResolveCluster[] = clusters.map((cluster) => ({
    ...cluster,
    records: [...cluster.records],
    rawSubjectKeys: [...cluster.rawSubjectKeys],
  }));

  const indexBySubject = new Map<string, number>();
  for (let index = 0; index < working.length; index += 1) {
    for (const subjectKey of working[index]!.rawSubjectKeys) {
      indexBySubject.set(subjectKey, index);
    }
  }

  type Edge = {
    leftIndex: number;
    rightIndex: number;
    evidenceIds: EvidenceId[];
  };
  const edges: Edge[] = [];
  const conflictedIndexes = new Set<number>();

  for (let index = 0; index < working.length; index += 1) {
    const cluster = working[index]!;
    const targets = new Map<string, EvidenceId[]>();

    for (const record of cluster.records) {
      if (record.propertyPath !== "identity.boundSubjectKey") {
        continue;
      }
      const target = normalizeOpeningRelationshipCandidate(
        "identity.boundSubjectKey",
        record.candidateValue,
      );
      if (target === undefined) {
        continue;
      }
      const existing = targets.get(target);
      if (existing) {
        existing.push(record.id);
      } else {
        targets.set(target, [record.id]);
      }
    }

    if (targets.size === 0) {
      continue;
    }

    if (targets.size > 1) {
      conflictedIndexes.add(index);
      continue;
    }

    const [targetKey, evidenceIds] = [...targets.entries()][0]!;
    const targetIndex = indexBySubject.get(targetKey);
    if (targetIndex === undefined) {
      // Binding names an unknown subject — leave unresolved; no invent.
      conflictedIndexes.add(index);
      continue;
    }
    if (targetIndex === index) {
      continue;
    }

    edges.push({
      leftIndex: index,
      rightIndex: targetIndex,
      evidenceIds: uniqueSortedIds(evidenceIds),
    });
  }

  // Competing edges: more than one distinct partner for a cluster → conflict.
  const partnersByIndex = new Map<number, Set<number>>();
  for (const edge of edges) {
    for (const [from, to] of [
      [edge.leftIndex, edge.rightIndex],
      [edge.rightIndex, edge.leftIndex],
    ] as const) {
      const partners = partnersByIndex.get(from) ?? new Set<number>();
      partners.add(to);
      partnersByIndex.set(from, partners);
    }
  }
  for (const [index, partners] of partnersByIndex) {
    if (partners.size > 1) {
      conflictedIndexes.add(index);
      for (const partner of partners) {
        conflictedIndexes.add(partner);
      }
    }
  }

  const parent = working.map((_, index) => index);
  function find(index: number): number {
    let current = index;
    while (parent[current] !== current) {
      current = parent[current]!;
    }
    let walk = index;
    while (parent[walk] !== walk) {
      const next = parent[walk]!;
      parent[walk] = current;
      walk = next;
    }
    return current;
  }
  function union(left: number, right: number): void {
    const rootLeft = find(left);
    const rootRight = find(right);
    if (rootLeft === rootRight) {
      return;
    }
    if (rootLeft < rootRight) {
      parent[rootRight] = rootLeft;
    } else {
      parent[rootLeft] = rootRight;
    }
  }

  const mergeEvidenceByRoot = new Map<number, EvidenceId[]>();
  for (const edge of edges) {
    if (
      conflictedIndexes.has(edge.leftIndex) ||
      conflictedIndexes.has(edge.rightIndex)
    ) {
      continue;
    }
    union(edge.leftIndex, edge.rightIndex);
    const root = find(edge.leftIndex);
    const existing = mergeEvidenceByRoot.get(root) ?? [];
    mergeEvidenceByRoot.set(
      root,
      uniqueSortedIds([...existing, ...edge.evidenceIds]),
    );
  }

  const groupsByRoot = new Map<number, number[]>();
  for (let index = 0; index < working.length; index += 1) {
    const root = find(index);
    const group = groupsByRoot.get(root) ?? [];
    group.push(index);
    groupsByRoot.set(root, group);
  }

  const merged: OpeningResolveCluster[] = [];
  for (const [, memberIndexes] of [...groupsByRoot.entries()].sort(
    ([left], [right]) => left - right,
  )) {
    if (memberIndexes.length === 1) {
      const only = working[memberIndexes[0]!]!;
      merged.push({
        ...only,
        bindingConflict: conflictedIndexes.has(memberIndexes[0]!),
      });
      continue;
    }

    const members = memberIndexes.map((index) => working[index]!);
    const geometryMember = members.find((member) =>
      member.rawSubjectKeys.some((key) => isGeometryOpeningKey(key)),
    );
    const survivor = geometryMember ?? [...members].sort((left, right) =>
      compareIds(left.openingId, right.openingId),
    )[0]!;
    const absorbedKeys = [
      ...new Set(members.flatMap((member) => member.rawSubjectKeys)),
    ].sort(compareIds);
    const root = find(memberIndexes[0]!);
    merged.push({
      canonicalSubjectKey: survivor.canonicalSubjectKey,
      openingId: survivor.openingId,
      records: members.flatMap((member) => member.records),
      rawSubjectKeys: absorbedKeys,
      identityMode: "identity-binding-merge",
      bindingEvidenceIds: mergeEvidenceByRoot.get(root) ?? [],
    });
  }

  return merged.sort((left, right) => compareIds(left.openingId, right.openingId));
}

function identityTracesForCluster(cluster: OpeningResolveCluster): PropertyResolutionTrace[] {
  const traces: PropertyResolutionTrace[] = [];

  if (cluster.identityMode === "semantic-pending") {
    traces.push(
      createTrace(
        "physicalIdentity",
        "semantic-cluster-pending-physical-link",
        `Semantic subjectKeys ${cluster.rawSubjectKeys.map((key) => `"${key}"`).join(", ")} sanitize to the same label without sufficient physical-location authority to confirm one physical opening.`,
      ),
    );
  }

  if (cluster.identityMode === "confirmed-physical") {
    traces.push(
      createTrace(
        "physicalIdentity",
        "deterministic-calculation",
        `Corroborating physical signals merge semantic subjectKeys ${cluster.rawSubjectKeys.map((key) => `"${key}"`).join(", ")} into one opening.`,
      ),
    );
  }

  if (cluster.identityMode === "disambiguated") {
    traces.push(
      createTrace(
        "physicalIdentity",
        "deterministic-calculation",
        `Distinct physical geometry or location disambiguates semantic label "${cluster.canonicalSubjectKey}" at ${locationFingerprint(cluster.records)}.`,
      ),
    );
  }

  if (cluster.identityMode === "identity-binding-merge") {
    traces.push(
      createTrace(
        "physicalIdentity",
        "identity-binding-merge",
        `Explicit identity.boundSubjectKey Evidence merges subjectKeys ${cluster.rawSubjectKeys.map((key) => `"${key}"`).join(", ")} into opening ${cluster.openingId}.`,
      ),
    );
  }

  if (cluster.bindingConflict) {
    traces.push(
      createTrace(
        "physicalIdentity",
        "unresolved",
        `Competing or unbound identity.boundSubjectKey Evidence left subjectKeys ${cluster.rawSubjectKeys.map((key) => `"${key}"`).join(", ")} unmerged.`,
      ),
    );
  }

  return traces;
}

function classifyOpeningIdentityRole(input: {
  cluster: OpeningResolveCluster;
  parentObjectId: ObjectId | null;
  identityRoleDecision: CandidateDecision;
}): Opening["identityRole"] {
  if (
    input.identityRoleDecision.kind === "resolved" &&
    input.identityRoleDecision.value === "schedule_definition"
  ) {
    return "schedule_definition";
  }

  if (input.cluster.rawSubjectKeys.some((key) => isGeometryOpeningKey(key))) {
    return "occurrence";
  }

  if (input.parentObjectId !== null) {
    return "occurrence";
  }

  if (
    input.identityRoleDecision.kind === "resolved" &&
    input.identityRoleDecision.value === "occurrence"
  ) {
    return "occurrence";
  }

  return "unresolved_identity";
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

  const identityRole = classifyOpeningIdentityRole({
    cluster,
    parentObjectId: relationship.parentObjectId,
    identityRoleDecision: decisions.identityRole,
  });

  const absorbedSubjectKeys =
    cluster.identityMode === "identity-binding-merge"
      ? [...new Set(cluster.rawSubjectKeys.filter((key) => key !== cluster.canonicalSubjectKey))].sort(
          compareIds,
        )
      : [];

  return {
    id: openingId,
    objectType: "opening",
    resolutionTraces,
    category,
    identityRole,
    absorbedSubjectKeys,
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
