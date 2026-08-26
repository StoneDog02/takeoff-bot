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
  floorFramingPayloadSchema,
  type FloorFramingPayload,
} from "../schemas/framing-artifacts.schema.js";
import type {
  FloorConstructionPhase,
  FloorFramingArea,
  FloorFramingSystem,
} from "../schemas/floor-framing.schema.js";
import {
  buildUserDecisionIndex,
  createUserOverrideTrace,
  filterUserDecisionsForPropertyPaths,
  findAppliedUserDecision,
  type SubjectBinding,
  type UserDecisionIndex,
  type UserDecisionPropertyPath,
} from "./applyUserDecisions.js";
import {
  convergeEvidenceByCanonicalObjectId,
  formatSubjectKeyConvergenceNote,
  type CanonicalEvidenceCluster,
} from "./convergeEvidenceByCanonicalObjectId.js";
import {
  createFloorFramingAreaObjectId,
  createFloorFramingSystemObjectId,
  createOpeningObjectId,
  createStructuralMemberObjectId,
  createWallObjectId,
} from "./ids.js";
import {
  FLOOR_AREA_PROPERTY_PATHS,
  FLOOR_SYSTEM_PROPERTY_PATHS,
  isFloorFramingUserDecisionPropertyPath,
  isResolvedFloorAreaPropertyValue,
  isResolvedFloorSystemPropertyValue,
  normalizeFloorAreaCandidate,
  normalizeFloorAreaRelationshipCandidate,
  normalizeFloorSystemCandidate,
  type FloorAreaPropertyPath,
  type FloorAreaRelationshipPropertyPath,
  type FloorSystemPropertyPath,
} from "./floorFramingPropertyPaths.js";
import {
  inferJoistSizeFromJoistType,
  isSpacingAxisLayoutAuthorityEstablished,
  memberLengthFromMisassignedSpanEvidence,
  SPACING_AXIS_AUTHORITY_EXPLANATION_MARKER,
} from "./floorLayoutAuthority.js";
import {
  parentSystemLinkTrace,
  resolveFloorAreaParentSystemLink,
} from "./resolveFloorAreaParentSystem.js";

export type ResolveFloorFramingOptions = {
  userDecisions?: readonly UserDecision[];
  reviewItemsById?: ReadonlyMap<ReviewItemId, ReviewItem>;
};

type CandidateDecision =
  | { kind: "missing" }
  | { kind: "resolved"; value: string | number; evidenceIds: EvidenceId[] }
  | { kind: "conflict"; evidenceIds: EvidenceId[] };

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueSortedIds(ids: readonly string[]): EvidenceId[] {
  return [...new Set(ids)].sort(compareIds) as EvidenceId[];
}

function selectCandidate(
  records: readonly Evidence[],
  propertyPath: string,
  normalize: (
    path: string,
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

function formatValues(
  records: readonly Evidence[],
  propertyPath: string,
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
  propertyPath: string,
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
  propertyPath: FloorSystemPropertyPath | FloorAreaPropertyPath,
  records: readonly Evidence[],
  objectId: ObjectId,
  userDecisionIndex: UserDecisionIndex,
  normalize: (
    path: string,
    candidateValue: Evidence["candidateValue"],
  ) => string | number | undefined,
): { decision: CandidateDecision; traces: PropertyResolutionTrace[] } {
  const applied = findAppliedUserDecision(
    userDecisionIndex,
    objectId,
    propertyPath as UserDecisionPropertyPath,
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

  const decision = selectCandidate(records, propertyPath, normalize);
  return {
    decision,
    traces: tracesForDecision(propertyPath, decision, records),
  };
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

function groupBySubjectKind(
  evidence: readonly Evidence[],
  subjectKind: Evidence["subjectKind"],
): Map<string, Evidence[]> {
  const groups = new Map<string, Evidence[]>();

  for (const record of evidence) {
    if (record.subjectKind !== subjectKind) {
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

function collectRelationshipTags(
  records: readonly Evidence[],
  propertyPath: FloorAreaRelationshipPropertyPath,
): { tags: string[]; traces: PropertyResolutionTrace[]; evidenceIds: EvidenceId[] } {
  const tags: string[] = [];
  const traces: PropertyResolutionTrace[] = [];
  const evidenceIds: EvidenceId[] = [];

  for (const record of records) {
    if (record.propertyPath !== propertyPath) {
      continue;
    }

    const tag = normalizeFloorAreaRelationshipCandidate(
      propertyPath,
      record.candidateValue,
    );
    if (!tag) {
      continue;
    }

    tags.push(tag);
    evidenceIds.push(record.id);
    traces.push(
      createTrace(
        propertyPath,
        "explicit-project-value",
        `Resolved ${propertyPath} from explicit project evidence ${record.id}.`,
        [record.id],
      ),
    );
  }

  return {
    tags: [...new Set(tags)].sort(compareIds),
    traces,
    evidenceIds: uniqueSortedIds(evidenceIds),
  };
}

function convergenceTraces(
  cluster: CanonicalEvidenceCluster,
): PropertyResolutionTrace[] {
  const note = formatSubjectKeyConvergenceNote(
    cluster.rawSubjectKeys,
    cluster.objectId,
  );
  if (!note) {
    return [];
  }
  return [
    createTrace(
      "subjectKey",
      "supported-inference",
      note,
      cluster.records.map((record) => record.id),
    ),
  ];
}

function resolveOneSystem(
  cluster: CanonicalEvidenceCluster,
  userDecisionIndex: UserDecisionIndex,
): FloorFramingSystem {
  const subjectKey = cluster.canonicalSubjectKey;
  const records = cluster.records;
  const systemId = cluster.objectId;
  const propertyResults = Object.fromEntries(
    FLOOR_SYSTEM_PROPERTY_PATHS.map((propertyPath) => {
      const result = resolvePropertyAuthority(
        propertyPath,
        records,
        systemId,
        userDecisionIndex,
        (path, candidateValue) =>
          normalizeFloorSystemCandidate(
            path as FloorSystemPropertyPath,
            candidateValue,
          ),
      );
      return [propertyPath, result];
    }),
  ) as Record<
    FloorSystemPropertyPath,
    { decision: CandidateDecision; traces: PropertyResolutionTrace[] }
  >;

  const decisions = Object.fromEntries(
    FLOOR_SYSTEM_PROPERTY_PATHS.map((propertyPath) => [
      propertyPath,
      propertyResults[propertyPath]!.decision,
    ]),
  ) as Record<FloorSystemPropertyPath, CandidateDecision>;

  const resolutionTraces = [
    ...convergenceTraces(cluster),
    ...FLOOR_SYSTEM_PROPERTY_PATHS.flatMap(
      (propertyPath) => propertyResults[propertyPath]!.traces,
    ),
  ];

  const constructionPhaseDecision = decisions.constructionPhase;
  const constructionPhase: FloorConstructionPhase =
    constructionPhaseDecision.kind === "resolved"
      ? (constructionPhaseDecision.value as FloorConstructionPhase)
      : "unknown";

  const values = {
    name: resolvedStringValue(decisions.name, subjectKey) ?? subjectKey,
    level: resolvedStringValue(decisions.level, "Unresolved") ?? "Unresolved",
    constructionPhase,
    assembly: {
      joistType: resolvedStringValue(decisions["assembly.joistType"], null),
      joistSize: resolvedStringValue(decisions["assembly.joistSize"], null),
      joistSpacingInches: resolvedNumberValue(
        decisions["assembly.joistSpacingInches"],
        null,
      ),
      rimBoard: resolvedStringValue(decisions["assembly.rimBoard"], null),
    },
  };

  const resolvedCount = FLOOR_SYSTEM_PROPERTY_PATHS.filter((propertyPath) => {
    if (propertyPath.startsWith("assembly.")) {
      const key = propertyPath.split(".")[1] as keyof typeof values.assembly;
      return values.assembly[key] !== null;
    }

    const scalar = values[propertyPath as keyof typeof values];
    return isResolvedFloorSystemPropertyValue(
      propertyPath,
      typeof scalar === "string" || typeof scalar === "number" ? scalar : null,
    );
  }).length;

  return {
    id: systemId,
    objectType: "floor-framing-system",
    completion: createCompletion(
      resolvedCount,
      FLOOR_SYSTEM_PROPERTY_PATHS.length,
    ),
    reviewStatus: "no-review-required",
    blockingStatus: "not-blocked",
    evidenceIds: uniqueSortedIds(records.map((record) => record.id)),
    assumptionIds: [],
    validationIssueIds: [],
    reviewItemIds: [],
    resolutionTraces,
    ...values,
    areaIds: [],
  };
}

function applyJoistSizeInference(system: FloorFramingSystem): FloorFramingSystem {
  if (system.assembly.joistSize !== null) {
    return system;
  }

  const inferred = inferJoistSizeFromJoistType(system.assembly.joistType);
  if (!inferred) {
    return system;
  }

  const joistTypeTrace = system.resolutionTraces.find(
    (trace) => trace.propertyPath === "assembly.joistType",
  );

  return {
    ...system,
    assembly: {
      ...system.assembly,
      joistSize: inferred,
    },
    resolutionTraces: [
      ...system.resolutionTraces,
      createTrace(
        "assembly.joistSize",
        "supported-inference",
        `Inferred joist size "${inferred}" from resolved joist type assembly string.`,
        joistTypeTrace?.evidenceIds ?? [],
      ),
    ],
    completion: createCompletion(
      (system.completion.completedItems ?? 0) + 1,
      system.completion.totalItems ?? FLOOR_SYSTEM_PROPERTY_PATHS.length,
    ),
  };
}

function resolveOneArea(
  cluster: CanonicalEvidenceCluster,
  userDecisionIndex: UserDecisionIndex,
): FloorFramingArea {
  const subjectKey = cluster.canonicalSubjectKey;
  const records = cluster.records;
  const areaId = cluster.objectId;
  const propertyResults = Object.fromEntries(
    FLOOR_AREA_PROPERTY_PATHS.map((propertyPath) => {
      const result = resolvePropertyAuthority(
        propertyPath,
        records,
        areaId,
        userDecisionIndex,
        (path, candidateValue) =>
          normalizeFloorAreaCandidate(
            path as FloorAreaPropertyPath,
            candidateValue,
          ),
      );
      return [propertyPath, result];
    }),
  ) as Record<
    FloorAreaPropertyPath,
    { decision: CandidateDecision; traces: PropertyResolutionTrace[] }
  >;

  const parentSystemDecision = selectCandidate(
    records,
    "parentSystemTag",
    (path, candidateValue) =>
      normalizeFloorAreaRelationshipCandidate(
        path as FloorAreaRelationshipPropertyPath,
        candidateValue,
      ),
  );
  const boundingWalls = collectRelationshipTags(records, "boundingWallTag");
  const openings = collectRelationshipTags(records, "openingTag");
  const members = collectRelationshipTags(records, "structuralMemberTag");

  const parentSystemTag =
    parentSystemDecision.kind === "resolved"
      ? (parentSystemDecision.value as string)
      : null;
  const parentSystemId = parentSystemTag
    ? createFloorFramingSystemObjectId(parentSystemTag)
    : createFloorFramingSystemObjectId("UNRESOLVED");

  const decisions = Object.fromEntries(
    FLOOR_AREA_PROPERTY_PATHS.map((propertyPath) => [
      propertyPath,
      propertyResults[propertyPath]!.decision,
    ]),
  ) as Record<FloorAreaPropertyPath, CandidateDecision>;

  const resolutionTraces = [
    ...convergenceTraces(cluster),
    ...FLOOR_AREA_PROPERTY_PATHS.flatMap(
      (propertyPath) => propertyResults[propertyPath]!.traces,
    ),
    ...tracesForDecision("parentSystemTag", parentSystemDecision, records),
    ...boundingWalls.traces,
    ...openings.traces,
    ...members.traces,
  ];

  const values = {
    layout: resolvedStringValue(decisions.layout, null),
    framingDirection: resolvedStringValue(decisions.framingDirection, null),
    spanDirection: resolvedStringValue(decisions.spanDirection, null),
    joistLayoutLengthFeet: resolvedNumberValue(
      decisions.joistLayoutLengthFeet,
      null,
    ),
    joistMemberLengthFeet: resolvedNumberValue(
      decisions.joistMemberLengthFeet,
      null,
    ),
    areaSquareFeet: resolvedNumberValue(decisions.areaSquareFeet, null),
  };

  const resolvedCount =
    FLOOR_AREA_PROPERTY_PATHS.filter((propertyPath) =>
      isResolvedFloorAreaPropertyValue(propertyPath, values[propertyPath]),
    ).length + (parentSystemTag ? 1 : 0);

  const totalItems = FLOOR_AREA_PROPERTY_PATHS.length + 1;

  return {
    id: areaId,
    objectType: "floor-framing-area",
    completion: createCompletion(resolvedCount, totalItems),
    reviewStatus: "no-review-required",
    blockingStatus: "not-blocked",
    evidenceIds: uniqueSortedIds([
      ...records.map((record) => record.id),
      ...(parentSystemDecision.kind === "resolved" ||
      parentSystemDecision.kind === "conflict"
        ? parentSystemDecision.evidenceIds
        : []),
      ...boundingWalls.evidenceIds,
      ...openings.evidenceIds,
      ...members.evidenceIds,
    ]),
    assumptionIds: [],
    validationIssueIds: [],
    reviewItemIds: [],
    resolutionTraces,
    parentSystemId,
    ...values,
    boundingWallIds: [
      ...new Set(boundingWalls.tags.map((tag) => createWallObjectId(tag))),
    ].sort(compareIds),
    openingIds: [
      ...new Set(openings.tags.map((tag) => createOpeningObjectId(tag))),
    ].sort(compareIds),
    structuralMemberIds: [
      ...new Set(
        members.tags.map((tag) => createStructuralMemberObjectId(tag)),
      ),
    ].sort(compareIds),
  };
}

function applyMemberLengthFromMisassignedSpan(
  area: FloorFramingArea,
  records: readonly Evidence[],
): FloorFramingArea {
  if (area.joistMemberLengthFeet !== null) {
    return area;
  }

  const recovered = memberLengthFromMisassignedSpanEvidence(records);
  if (!recovered) {
    return area;
  }

  return {
    ...area,
    joistMemberLengthFeet: recovered.value,
    resolutionTraces: [
      ...area.resolutionTraces,
      createTrace(
        "joistMemberLengthFeet",
        "explicit-project-value",
        `Resolved joist member length from explicit MAX SPAN callout evidence (mis-assigned to spanDirection).`,
        recovered.evidenceIds as EvidenceId[],
      ),
    ],
    evidenceIds: uniqueSortedIds([
      ...area.evidenceIds,
      ...(recovered.evidenceIds as EvidenceId[]),
    ]),
  };
}

function applySpacingAxisLayoutAuthority(
  area: FloorFramingArea,
  areaRecords: readonly Evidence[],
  relatedSystemRecords: readonly Evidence[],
): FloorFramingArea {
  if (
    !isSpacingAxisLayoutAuthorityEstablished(
      area,
      areaRecords,
      relatedSystemRecords,
    )
  ) {
    return area;
  }

  const layoutEvidenceIds = areaRecords
    .filter((record) => record.propertyPath === "joistLayoutLengthFeet")
    .map((record) => record.id);

  const assemblyEvidenceIds = relatedSystemRecords
    .filter((record) =>
      [
        "assembly.joistType",
        "assembly.joistSize",
        "assembly.joistSpacingInches",
      ].includes(record.propertyPath),
    )
    .map((record) => record.id);

  const existingLayoutTrace = area.resolutionTraces.find(
    (trace) => trace.propertyPath === "joistLayoutLengthFeet",
  );

  const spacingAxisTrace = createTrace(
    "joistLayoutLengthFeet",
    existingLayoutTrace?.method === "explicit-project-value"
      ? "explicit-project-value"
      : "supported-inference",
    `${SPACING_AXIS_AUTHORITY_EXPLANATION_MARKER}: explicit bay dimension corroborated as spacing-axis layout length for baseline joist count.`,
    uniqueSortedIds([...layoutEvidenceIds, ...assemblyEvidenceIds]),
  );

  const otherTraces = area.resolutionTraces.filter(
    (trace) => trace.propertyPath !== "joistLayoutLengthFeet",
  );

  return {
    ...area,
    resolutionTraces: [...otherTraces, spacingAxisTrace],
  };
}

function applyInferredParentSystemLink(
  area: FloorFramingArea,
  areaSubjectKey: string,
  areaRecords: readonly Evidence[],
  systemCandidates: ReadonlyArray<{
    subjectKey: string;
    records: readonly Evidence[];
  }>,
): FloorFramingArea {
  if (!area.parentSystemId.endsWith("UNRESOLVED")) {
    return area;
  }

  const link = resolveFloorAreaParentSystemLink({
    areaSubjectKey,
    areaRecords,
    explicitParentSystemTag: null,
    systemCandidates,
  });

  if (!link) {
    return area;
  }

  const parentTrace = parentSystemLinkTrace(link);
  const filteredTraces = area.resolutionTraces.filter(
    (trace) => trace.propertyPath !== "parentSystemTag",
  );

  return {
    ...area,
    parentSystemId: link.systemId,
    resolutionTraces: [...filteredTraces, parentTrace],
    evidenceIds: uniqueSortedIds([...area.evidenceIds, ...link.evidenceIds]),
    completion: createCompletion(
      (area.completion.completedItems ?? 0) + 1,
      area.completion.totalItems ?? FLOOR_AREA_PROPERTY_PATHS.length + 1,
    ),
  };
}

type ResolvedSubjectIdentity = {
  subjectKey: string;
  objectId: ObjectId;
  kind: "floor-framing-system" | "floor-framing-area";
};

function linkSystemAreaIds(
  systems: FloorFramingSystem[],
  areas: FloorFramingArea[],
): FloorFramingSystem[] {
  const areasBySystemId = new Map<ObjectId, ObjectId[]>();

  for (const area of areas) {
    if (!area.parentSystemId) {
      continue;
    }

    const existing = areasBySystemId.get(area.parentSystemId);
    if (existing) {
      existing.push(area.id);
    } else {
      areasBySystemId.set(area.parentSystemId, [area.id]);
    }
  }

  return systems.map((system) => ({
    ...system,
    areaIds: [...(areasBySystemId.get(system.id) ?? [])].sort(compareIds),
  }));
}

/**
 * Deterministic Floor Framing resolver.
 *
 * Groups Evidence by subjectKind + subjectKey, converges raw subjectKeys that
 * mint the same ObjectId into one domain object, resolves systems and areas
 * independently, links parent/child relationships, and preserves partial
 * objects when inputs are missing or conflicted. Optional User Decisions may
 * resolve missing or conflicted scalar properties before Evidence selection.
 */
export function resolveFloorFraming(
  evidence: readonly Evidence[],
  options?: ResolveFloorFramingOptions,
): FloorFramingPayload {
  const systemGroups = groupBySubjectKind(evidence, "floor-framing-system");
  const areaGroups = groupBySubjectKind(evidence, "floor-framing-area");

  const systemClusters = convergeEvidenceByCanonicalObjectId({
    groups: systemGroups,
    createObjectId: createFloorFramingSystemObjectId,
  });
  const areaClusters = convergeEvidenceByCanonicalObjectId({
    groups: areaGroups,
    createObjectId: createFloorFramingAreaObjectId,
  });

  const systemIdentities: ResolvedSubjectIdentity[] = systemClusters.map(
    (cluster) => ({
      subjectKey: cluster.canonicalSubjectKey,
      objectId: cluster.objectId,
      kind: "floor-framing-system",
    }),
  );
  const areaIdentities: ResolvedSubjectIdentity[] = areaClusters.map(
    (cluster) => ({
      subjectKey: cluster.canonicalSubjectKey,
      objectId: cluster.objectId,
      kind: "floor-framing-area",
    }),
  );

  const userDecisionIndex = buildFloorUserDecisionContext(
    evidence,
    systemIdentities,
    areaIdentities,
    options,
  );

  const systems = systemClusters.map((cluster) =>
    applyJoistSizeInference(resolveOneSystem(cluster, userDecisionIndex)),
  );

  const systemCandidates = systemClusters.map((cluster) => ({
    subjectKey: cluster.canonicalSubjectKey,
    records: cluster.records,
  }));

  const areas = areaClusters.map((cluster) => {
    const areaRecords = cluster.records;
    let area = resolveOneArea(cluster, userDecisionIndex);
    area = applyMemberLengthFromMisassignedSpan(area, areaRecords);
    area = applyInferredParentSystemLink(
      area,
      cluster.canonicalSubjectKey,
      areaRecords,
      systemCandidates,
    );

    const linkedSystemRecords =
      systemCandidates.find(
        (candidate) =>
          createFloorFramingSystemObjectId(candidate.subjectKey) ===
          area.parentSystemId,
      )?.records ?? [];

    area = applySpacingAxisLayoutAuthority(
      area,
      areaRecords,
      linkedSystemRecords,
    );

    return area;
  });

  return floorFramingPayloadSchema.parse({
    systems: linkSystemAreaIds(systems, areas),
    areas,
  });
}

function buildEvidenceById(
  evidence: readonly Evidence[],
): ReadonlyMap<EvidenceId, Evidence> {
  return new Map(evidence.map((record) => [record.id, record]));
}

function buildFloorSubjectBindingByObjectId(
  systemIdentities: readonly ResolvedSubjectIdentity[],
  areaIdentities: readonly ResolvedSubjectIdentity[],
): Map<ObjectId, SubjectBinding> {
  const bindings = new Map<ObjectId, SubjectBinding>();

  for (const identity of systemIdentities) {
    bindings.set(identity.objectId, {
      subjectKey: identity.subjectKey,
      subjectKind: "floor-framing-system",
    });
  }

  for (const identity of areaIdentities) {
    bindings.set(identity.objectId, {
      subjectKey: identity.subjectKey,
      subjectKind: "floor-framing-area",
    });
  }

  return bindings;
}

function buildFloorUserDecisionContext(
  evidence: readonly Evidence[],
  systemIdentities: readonly ResolvedSubjectIdentity[],
  areaIdentities: readonly ResolvedSubjectIdentity[],
  options?: ResolveFloorFramingOptions,
): UserDecisionIndex {
  const userDecisions = options?.userDecisions ?? [];
  if (userDecisions.length === 0) {
    return new Map();
  }

  if (!options?.reviewItemsById) {
    throw new Error(
      "resolveFloorFraming requires reviewItemsById when userDecisions are supplied.",
    );
  }

  return buildUserDecisionIndex(
    filterUserDecisionsForPropertyPaths(
      {
        userDecisions,
        reviewItemsById: options.reviewItemsById,
        evidenceById: buildEvidenceById(evidence),
      },
      isFloorFramingUserDecisionPropertyPath,
      new Set(
        buildFloorSubjectBindingByObjectId(systemIdentities, areaIdentities).keys(),
      ),
    ),
    buildFloorSubjectBindingByObjectId(systemIdentities, areaIdentities),
  );
}
