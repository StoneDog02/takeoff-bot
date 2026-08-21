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
  roofFramingPayloadSchema,
  type RoofFramingPayload,
} from "../schemas/framing-artifacts.schema.js";
import type {
  RoofConstructionPhase,
  RoofFramingSystem,
  RoofPlane,
} from "../schemas/roof-framing.schema.js";
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
  createOpeningObjectId,
  createRoofFramingSystemObjectId,
  createRoofPlaneObjectId,
  createStructuralMemberObjectId,
  createWallObjectId,
} from "./ids.js";
import {
  ROOF_PLANE_PROPERTY_PATHS,
  ROOF_SYSTEM_PROPERTY_PATHS,
  isResolvedRoofPlanePropertyValue,
  isResolvedRoofSystemPropertyValue,
  isRoofFramingUserDecisionPropertyPath,
  normalizeRoofPlaneCandidate,
  normalizeRoofPlaneRelationshipCandidate,
  normalizeRoofSystemCandidate,
  type RoofPlanePropertyPath,
  type RoofPlaneRelationshipPropertyPath,
  type RoofSystemPropertyPath,
} from "./roofFramingPropertyPaths.js";

export type ResolveRoofFramingOptions = {
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
  propertyPath: RoofSystemPropertyPath | RoofPlanePropertyPath,
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
  propertyPath: RoofPlaneRelationshipPropertyPath,
): { tags: string[]; traces: PropertyResolutionTrace[]; evidenceIds: EvidenceId[] } {
  const tags: string[] = [];
  const traces: PropertyResolutionTrace[] = [];
  const evidenceIds: EvidenceId[] = [];

  for (const record of records) {
    if (record.propertyPath !== propertyPath) {
      continue;
    }

    const tag = normalizeRoofPlaneRelationshipCandidate(
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

function resolveOneSystem(
  subjectKey: string,
  records: readonly Evidence[],
  userDecisionIndex: UserDecisionIndex,
): RoofFramingSystem {
  const systemId = createRoofFramingSystemObjectId(subjectKey);
  const propertyResults = Object.fromEntries(
    ROOF_SYSTEM_PROPERTY_PATHS.map((propertyPath) => {
      const result = resolvePropertyAuthority(
        propertyPath,
        records,
        systemId,
        userDecisionIndex,
        (path, candidateValue) =>
          normalizeRoofSystemCandidate(
            path as RoofSystemPropertyPath,
            candidateValue,
          ),
      );
      return [propertyPath, result];
    }),
  ) as Record<
    RoofSystemPropertyPath,
    { decision: CandidateDecision; traces: PropertyResolutionTrace[] }
  >;

  const decisions = Object.fromEntries(
    ROOF_SYSTEM_PROPERTY_PATHS.map((propertyPath) => [
      propertyPath,
      propertyResults[propertyPath]!.decision,
    ]),
  ) as Record<RoofSystemPropertyPath, CandidateDecision>;

  const resolutionTraces = ROOF_SYSTEM_PROPERTY_PATHS.flatMap(
    (propertyPath) => propertyResults[propertyPath]!.traces,
  );

  const constructionPhaseDecision = decisions.constructionPhase;
  const constructionPhase: RoofConstructionPhase =
    constructionPhaseDecision.kind === "resolved"
      ? (constructionPhaseDecision.value as RoofConstructionPhase)
      : "unknown";

  const values = {
    name: resolvedStringValue(decisions.name, subjectKey) ?? subjectKey,
    level: resolvedStringValue(decisions.level, "Unresolved") ?? "Unresolved",
    constructionPhase,
    assembly: {
      framingType: resolvedStringValue(decisions["assembly.framingType"], null),
      memberSize: resolvedStringValue(decisions["assembly.memberSize"], null),
      memberSpacingInches: resolvedNumberValue(
        decisions["assembly.memberSpacingInches"],
        null,
      ),
    },
  };

  const resolvedCount = ROOF_SYSTEM_PROPERTY_PATHS.filter((propertyPath) => {
    if (propertyPath.startsWith("assembly.")) {
      const key = propertyPath.split(".")[1] as keyof typeof values.assembly;
      return values.assembly[key] !== null;
    }

    const scalar = values[propertyPath as keyof typeof values];
    return isResolvedRoofSystemPropertyValue(
      propertyPath,
      typeof scalar === "string" || typeof scalar === "number" ? scalar : null,
    );
  }).length;

  return {
    id: systemId,
    objectType: "roof-framing-system",
    completion: createCompletion(
      resolvedCount,
      ROOF_SYSTEM_PROPERTY_PATHS.length,
    ),
    reviewStatus: "no-review-required",
    blockingStatus: "not-blocked",
    evidenceIds: uniqueSortedIds(records.map((record) => record.id)),
    assumptionIds: [],
    validationIssueIds: [],
    reviewItemIds: [],
    resolutionTraces,
    ...values,
    planeIds: [],
  };
}

function resolveOnePlane(
  subjectKey: string,
  records: readonly Evidence[],
  userDecisionIndex: UserDecisionIndex,
): RoofPlane {
  const planeId = createRoofPlaneObjectId(subjectKey);
  const propertyResults = Object.fromEntries(
    ROOF_PLANE_PROPERTY_PATHS.map((propertyPath) => {
      const result = resolvePropertyAuthority(
        propertyPath,
        records,
        planeId,
        userDecisionIndex,
        (path, candidateValue) =>
          normalizeRoofPlaneCandidate(
            path as RoofPlanePropertyPath,
            candidateValue,
          ),
      );
      return [propertyPath, result];
    }),
  ) as Record<
    RoofPlanePropertyPath,
    { decision: CandidateDecision; traces: PropertyResolutionTrace[] }
  >;

  const parentSystemDecision = selectCandidate(
    records,
    "parentSystemTag",
    (path, candidateValue) =>
      normalizeRoofPlaneRelationshipCandidate(
        path as RoofPlaneRelationshipPropertyPath,
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
    ? createRoofFramingSystemObjectId(parentSystemTag)
    : createRoofFramingSystemObjectId("UNRESOLVED");

  const decisions = Object.fromEntries(
    ROOF_PLANE_PROPERTY_PATHS.map((propertyPath) => [
      propertyPath,
      propertyResults[propertyPath]!.decision,
    ]),
  ) as Record<RoofPlanePropertyPath, CandidateDecision>;

  const resolutionTraces = [
    ...ROOF_PLANE_PROPERTY_PATHS.flatMap(
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
    rafterLayoutLengthFeet: resolvedNumberValue(
      decisions.rafterLayoutLengthFeet,
      null,
    ),
    pitch: resolvedStringValue(decisions.pitch, null),
    areaSquareFeet: resolvedNumberValue(decisions.areaSquareFeet, null),
  };

  const resolvedCount =
    ROOF_PLANE_PROPERTY_PATHS.filter((propertyPath) =>
      isResolvedRoofPlanePropertyValue(propertyPath, values[propertyPath]),
    ).length + (parentSystemTag ? 1 : 0);

  const totalItems = ROOF_PLANE_PROPERTY_PATHS.length + 1;

  return {
    id: planeId,
    objectType: "roof-plane",
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

type ResolvedSubjectIdentity = {
  subjectKey: string;
  objectId: ObjectId;
  kind: "roof-framing-system" | "roof-plane";
};

function assertNoObjectIdCollisions(
  identities: readonly ResolvedSubjectIdentity[],
): void {
  const owners = new Map<string, { kind: string; subjectKeys: string[] }>();

  for (const identity of identities) {
    const existing = owners.get(identity.objectId);
    if (existing) {
      existing.subjectKeys.push(identity.subjectKey);
    } else {
      owners.set(identity.objectId, {
        kind: identity.kind,
        subjectKeys: [identity.subjectKey],
      });
    }
  }

  for (const [objectId, owner] of owners) {
    if (owner.subjectKeys.length <= 1) {
      continue;
    }

    const sortedSubjectKeys = [...owner.subjectKeys].sort(compareIds);
    throw new Error(
      `subjectKeys ${sortedSubjectKeys.map((key) => `"${key}"`).join(" and ")} both resolve to Roof Framing ${owner.kind} ObjectId ${objectId}.`,
    );
  }
}

function linkSystemPlaneIds(
  systems: RoofFramingSystem[],
  planes: RoofPlane[],
): RoofFramingSystem[] {
  const planesBySystemId = new Map<ObjectId, ObjectId[]>();

  for (const plane of planes) {
    if (!plane.parentSystemId) {
      continue;
    }

    const existing = planesBySystemId.get(plane.parentSystemId);
    if (existing) {
      existing.push(plane.id);
    } else {
      planesBySystemId.set(plane.parentSystemId, [plane.id]);
    }
  }

  return systems.map((system) => ({
    ...system,
    planeIds: [...(planesBySystemId.get(system.id) ?? [])].sort(compareIds),
  }));
}

/**
 * Deterministic Roof Framing resolver.
 *
 * Groups Evidence by subjectKind + subjectKey, resolves systems and planes
 * independently, links parent/child relationships, and preserves partial
 * objects when inputs are missing or conflicted. Optional User Decisions may
 * resolve missing or conflicted scalar properties before Evidence selection.
 */
export function resolveRoofFraming(
  evidence: readonly Evidence[],
  options?: ResolveRoofFramingOptions,
): RoofFramingPayload {
  const systemGroups = groupBySubjectKind(evidence, "roof-framing-system");
  const planeGroups = groupBySubjectKind(evidence, "roof-plane");

  const systemIdentities = [...systemGroups.keys()]
    .sort(compareIds)
    .map((subjectKey) => ({
      subjectKey,
      objectId: createRoofFramingSystemObjectId(subjectKey),
      kind: "roof-framing-system" as const,
    }));

  const planeIdentities = [...planeGroups.keys()]
    .sort(compareIds)
    .map((subjectKey) => ({
      subjectKey,
      objectId: createRoofPlaneObjectId(subjectKey),
      kind: "roof-plane" as const,
    }));

  assertNoObjectIdCollisions([...systemIdentities, ...planeIdentities]);

  const userDecisionIndex = buildRoofUserDecisionContext(
    evidence,
    systemIdentities,
    planeIdentities,
    options,
  );

  const systems = systemIdentities.map(({ subjectKey }) =>
    resolveOneSystem(
      subjectKey,
      systemGroups.get(subjectKey)!,
      userDecisionIndex,
    ),
  );
  const planes = planeIdentities.map(({ subjectKey }) =>
    resolveOnePlane(subjectKey, planeGroups.get(subjectKey)!, userDecisionIndex),
  );

  return roofFramingPayloadSchema.parse({
    systems: linkSystemPlaneIds(systems, planes),
    planes,
  });
}

function buildEvidenceById(
  evidence: readonly Evidence[],
): ReadonlyMap<EvidenceId, Evidence> {
  return new Map(evidence.map((record) => [record.id, record]));
}

function buildRoofSubjectBindingByObjectId(
  systemIdentities: readonly ResolvedSubjectIdentity[],
  planeIdentities: readonly ResolvedSubjectIdentity[],
): Map<ObjectId, SubjectBinding> {
  const bindings = new Map<ObjectId, SubjectBinding>();

  for (const identity of systemIdentities) {
    bindings.set(identity.objectId, {
      subjectKey: identity.subjectKey,
      subjectKind: "roof-framing-system",
    });
  }

  for (const identity of planeIdentities) {
    bindings.set(identity.objectId, {
      subjectKey: identity.subjectKey,
      subjectKind: "roof-plane",
    });
  }

  return bindings;
}

function buildRoofUserDecisionContext(
  evidence: readonly Evidence[],
  systemIdentities: readonly ResolvedSubjectIdentity[],
  planeIdentities: readonly ResolvedSubjectIdentity[],
  options?: ResolveRoofFramingOptions,
): UserDecisionIndex {
  const userDecisions = options?.userDecisions ?? [];
  if (userDecisions.length === 0) {
    return new Map();
  }

  if (!options?.reviewItemsById) {
    throw new Error(
      "resolveRoofFraming requires reviewItemsById when userDecisions are supplied.",
    );
  }

  return buildUserDecisionIndex(
    filterUserDecisionsForPropertyPaths(
      {
        userDecisions,
        reviewItemsById: options.reviewItemsById,
        evidenceById: buildEvidenceById(evidence),
      },
      isRoofFramingUserDecisionPropertyPath,
      new Set(
        buildRoofSubjectBindingByObjectId(systemIdentities, planeIdentities).keys(),
      ),
    ),
    buildRoofSubjectBindingByObjectId(systemIdentities, planeIdentities),
  );
}
