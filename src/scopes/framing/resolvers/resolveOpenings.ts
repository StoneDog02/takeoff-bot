import type { Evidence } from "../../../core/schemas/evidence.schema.js";
import type { ReviewItemId, EvidenceId, ObjectId } from "../../../core/schemas/identity.schema.js";
import type { ReviewItem } from "../../../core/schemas/review-item.schema.js";
import type { UserDecision } from "../../../core/schemas/user-decision.schema.js";
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
  createOpeningObjectId,
  createWallObjectId,
  createWallSegmentObjectId,
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
  subjectKeys: readonly string[],
): Map<ObjectId, SubjectBinding> {
  const subjectBindingByObjectId = new Map<ObjectId, SubjectBinding>();

  for (const subjectKey of subjectKeys) {
    subjectBindingByObjectId.set(createOpeningObjectId(subjectKey), {
      subjectKey,
      subjectKind: "opening",
    });
  }

  return subjectBindingByObjectId;
}

function buildUserDecisionContext(
  evidence: readonly Evidence[],
  subjectKeys: readonly string[],
  options?: ResolveOpeningsOptions,
): UserDecisionIndex {
  const userDecisions = options?.userDecisions ?? [];
  if (userDecisions.length === 0) {
    return new Map();
  }

  if (!options?.reviewItemsById) {
    throw new Error(
      "resolveOpenings requires reviewItemsById when userDecisions are supplied.",
    );
  }

  return buildUserDecisionIndex(
    filterUserDecisionsForPropertyPaths(
      {
        userDecisions,
        reviewItemsById: options.reviewItemsById,
        evidenceById: buildEvidenceById(evidence),
      },
      isOpeningPropertyPath,
      new Set(buildOpeningSubjectBindingByObjectId(subjectKeys).keys()),
    ),
    buildOpeningSubjectBindingByObjectId(subjectKeys),
  );
}

function resolveOneOpening(
  subjectKey: string,
  records: readonly Evidence[],
  wallFraming: WallFramingPayload | undefined,
  userDecisionIndex: UserDecisionIndex,
): Opening {
  const openingId = createOpeningObjectId(subjectKey);
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

type ResolvedSubjectIdentity = {
  subjectKey: string;
  openingId: ObjectId;
};

function assertNoObjectIdCollisions(identities: readonly ResolvedSubjectIdentity[]): void {
  const owners = new Map<string, string[]>();

  for (const identity of identities) {
    const existing = owners.get(identity.openingId);
    if (existing) {
      existing.push(identity.subjectKey);
    } else {
      owners.set(identity.openingId, [identity.subjectKey]);
    }
  }

  for (const [openingId, subjectKeys] of owners) {
    if (subjectKeys.length <= 1) {
      continue;
    }

    const sortedSubjectKeys = [...subjectKeys].sort(compareIds);
    throw new Error(
      `subjectKeys ${sortedSubjectKeys.map((key) => `"${key}"`).join(" and ")} both resolve to Opening ObjectId ${openingId}.`,
    );
  }
}

/**
 * Deterministic Openings resolver.
 *
 * Groups Evidence by exact subjectKind + subjectKey, resolves scalar opening
 * facts, and when wallFraming is supplied maps explicit parentWallTag Evidence
 * to parentWallId / parentObjectId against resolved Wall objects.
 */
export function resolveOpenings(
  evidence: readonly Evidence[],
  options: ResolveOpeningsOptions = {},
): OpeningsPayload {
  const groups = groupBySubjectKey(evidence);
  const subjectKeys = [...groups.keys()].sort(compareIds);

  if (subjectKeys.length === 0) {
    return openingsPayloadSchema.parse({ openings: [] });
  }

  const identities: ResolvedSubjectIdentity[] = subjectKeys.map((subjectKey) => ({
    subjectKey,
    openingId: createOpeningObjectId(subjectKey),
  }));
  assertNoObjectIdCollisions(identities);

  const userDecisionIndex = buildUserDecisionContext(evidence, subjectKeys, options);

  const openings = subjectKeys.map((subjectKey) =>
    resolveOneOpening(
      subjectKey,
      groups.get(subjectKey) ?? [],
      options.wallFraming,
      userDecisionIndex,
    ),
  );

  return openingsPayloadSchema.parse({ openings });
}
