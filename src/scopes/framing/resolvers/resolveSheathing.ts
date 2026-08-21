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
  sheathingPayloadSchema,
  type SheathingPayload,
} from "../schemas/framing-artifacts.schema.js";
import type {
  SheathingArea,
  SheathingApplication,
  SheathingConstructionPhase,
  SheathingSystem,
} from "../schemas/sheathing.schema.js";
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
  createSheathingAreaObjectId,
  createSheathingSystemObjectId,
  createWallObjectId,
} from "./ids.js";
import {
  isResolvedSheathingAreaPropertyValue,
  isResolvedSheathingSystemPropertyValue,
  isSheathingUserDecisionPropertyPath,
  normalizeSheathingAreaCandidate,
  normalizeSheathingAreaRelationshipCandidate,
  normalizeSheathingSystemCandidate,
  SHEATHING_AREA_PROPERTY_PATHS,
  SHEATHING_SYSTEM_PROPERTY_PATHS,
  type SheathingAreaPropertyPath,
  type SheathingAreaRelationshipPropertyPath,
  type SheathingSystemPropertyPath,
} from "./sheathingPropertyPaths.js";

export type ResolveSheathingOptions = {
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
  propertyPath: SheathingSystemPropertyPath | SheathingAreaPropertyPath,
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
  propertyPath: SheathingAreaRelationshipPropertyPath,
): { tags: string[]; traces: PropertyResolutionTrace[]; evidenceIds: EvidenceId[] } {
  const tags: string[] = [];
  const traces: PropertyResolutionTrace[] = [];
  const evidenceIds: EvidenceId[] = [];

  for (const record of records) {
    if (record.propertyPath !== propertyPath) {
      continue;
    }

    const tag = normalizeSheathingAreaRelationshipCandidate(
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
): SheathingSystem {
  const systemId = createSheathingSystemObjectId(subjectKey);
  const propertyResults = Object.fromEntries(
    SHEATHING_SYSTEM_PROPERTY_PATHS.map((propertyPath) => {
      const result = resolvePropertyAuthority(
        propertyPath,
        records,
        systemId,
        userDecisionIndex,
        (path, candidateValue) =>
          normalizeSheathingSystemCandidate(
            path as SheathingSystemPropertyPath,
            candidateValue,
          ),
      );
      return [propertyPath, result];
    }),
  ) as Record<
    SheathingSystemPropertyPath,
    { decision: CandidateDecision; traces: PropertyResolutionTrace[] }
  >;

  const decisions = Object.fromEntries(
    SHEATHING_SYSTEM_PROPERTY_PATHS.map((propertyPath) => [
      propertyPath,
      propertyResults[propertyPath]!.decision,
    ]),
  ) as Record<SheathingSystemPropertyPath, CandidateDecision>;

  const resolutionTraces = SHEATHING_SYSTEM_PROPERTY_PATHS.flatMap(
    (propertyPath) => propertyResults[propertyPath]!.traces,
  );

  const applicationDecision = decisions.application;
  const application: SheathingApplication =
    applicationDecision.kind === "resolved"
      ? (applicationDecision.value as SheathingApplication)
      : "unknown";

  const constructionPhaseDecision = decisions.constructionPhase;
  const constructionPhase: SheathingConstructionPhase =
    constructionPhaseDecision.kind === "resolved"
      ? (constructionPhaseDecision.value as SheathingConstructionPhase)
      : "unknown";

  const values = {
    name: resolvedStringValue(decisions.name, subjectKey) ?? subjectKey,
    level: resolvedStringValue(decisions.level, "Unresolved") ?? "Unresolved",
    application,
    constructionPhase,
    panelSpecification: {
      panelType: resolvedStringValue(
        decisions["panelSpecification.panelType"],
        null,
      ),
      thickness: resolvedStringValue(
        decisions["panelSpecification.thickness"],
        null,
      ),
      grade: resolvedStringValue(decisions["panelSpecification.grade"], null),
      spanRating: resolvedStringValue(
        decisions["panelSpecification.spanRating"],
        null,
      ),
      exposureRating: resolvedStringValue(
        decisions["panelSpecification.exposureRating"],
        null,
      ),
      edgeTreatment: resolvedStringValue(
        decisions["panelSpecification.edgeTreatment"],
        null,
      ),
      specificationReference: resolvedStringValue(
        decisions["panelSpecification.specificationReference"],
        null,
      ),
    },
  };

  const resolvedCount = SHEATHING_SYSTEM_PROPERTY_PATHS.filter((propertyPath) => {
    if (propertyPath.startsWith("panelSpecification.")) {
      const key = propertyPath.split(".")[1] as keyof typeof values.panelSpecification;
      return values.panelSpecification[key] !== null;
    }

    const scalar = values[propertyPath as keyof typeof values];
    return isResolvedSheathingSystemPropertyValue(
      propertyPath,
      typeof scalar === "string" ? scalar : null,
    );
  }).length;

  return {
    id: systemId,
    objectType: "sheathing-system",
    completion: createCompletion(
      resolvedCount,
      SHEATHING_SYSTEM_PROPERTY_PATHS.length,
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

function resolveOneArea(
  subjectKey: string,
  records: readonly Evidence[],
  userDecisionIndex: UserDecisionIndex,
): SheathingArea {
  const areaId = createSheathingAreaObjectId(subjectKey);
  const propertyResults = Object.fromEntries(
    SHEATHING_AREA_PROPERTY_PATHS.map((propertyPath) => {
      const result = resolvePropertyAuthority(
        propertyPath,
        records,
        areaId,
        userDecisionIndex,
        (path, candidateValue) =>
          normalizeSheathingAreaCandidate(
            path as SheathingAreaPropertyPath,
            candidateValue,
          ),
      );
      return [propertyPath, result];
    }),
  ) as Record<
    SheathingAreaPropertyPath,
    { decision: CandidateDecision; traces: PropertyResolutionTrace[] }
  >;

  const parentSystemDecision = selectCandidate(
    records,
    "parentSystemTag",
    (path, candidateValue) =>
      normalizeSheathingAreaRelationshipCandidate(
        path as SheathingAreaRelationshipPropertyPath,
        candidateValue,
      ),
  );
  const coveredWalls = collectRelationshipTags(records, "coveredWallTag");
  const openings = collectRelationshipTags(records, "openingTag");

  const parentSystemTag =
    parentSystemDecision.kind === "resolved"
      ? (parentSystemDecision.value as string)
      : null;
  const parentSystemId = parentSystemTag
    ? createSheathingSystemObjectId(parentSystemTag)
    : createSheathingSystemObjectId("UNRESOLVED");

  const coveredObjectIds = [
    ...new Set(coveredWalls.tags.map((tag) => createWallObjectId(tag))),
  ].sort(compareIds);

  const openingIds = [
    ...new Set(openings.tags.map((tag) => createOpeningObjectId(tag))),
  ].sort(compareIds);

  const decisions = Object.fromEntries(
    SHEATHING_AREA_PROPERTY_PATHS.map((propertyPath) => [
      propertyPath,
      propertyResults[propertyPath]!.decision,
    ]),
  ) as Record<SheathingAreaPropertyPath, CandidateDecision>;

  const resolutionTraces = [
    ...SHEATHING_AREA_PROPERTY_PATHS.flatMap(
      (propertyPath) => propertyResults[propertyPath]!.traces,
    ),
    ...tracesForDecision("parentSystemTag", parentSystemDecision, records),
    ...coveredWalls.traces,
    ...openings.traces,
  ];

  const values = {
    areaSquareFeet: resolvedNumberValue(decisions.areaSquareFeet, null),
    layout: resolvedStringValue(decisions.layout, null),
  };

  const resolvedCount =
    SHEATHING_AREA_PROPERTY_PATHS.filter((propertyPath) =>
      isResolvedSheathingAreaPropertyValue(propertyPath, values[propertyPath]),
    ).length + (parentSystemTag ? 1 : 0);

  const totalItems = SHEATHING_AREA_PROPERTY_PATHS.length + 1;

  return {
    id: areaId,
    objectType: "sheathing-area",
    completion: createCompletion(resolvedCount, totalItems),
    reviewStatus: "no-review-required",
    blockingStatus: "not-blocked",
    evidenceIds: uniqueSortedIds([
      ...records.map((record) => record.id),
      ...(parentSystemDecision.kind === "resolved"
        ? parentSystemDecision.evidenceIds
        : parentSystemDecision.kind === "conflict"
          ? parentSystemDecision.evidenceIds
          : []),
      ...coveredWalls.evidenceIds,
      ...openings.evidenceIds,
    ]),
    assumptionIds: [],
    validationIssueIds: [],
    reviewItemIds: [],
    resolutionTraces,
    parentSystemId,
    ...values,
    coveredObjectIds,
    openingIds,
  };
}

type ResolvedSubjectIdentity = {
  subjectKey: string;
  objectId: ObjectId;
  kind: "sheathing-system" | "sheathing-area";
};

function assertNoObjectIdCollisions(identities: readonly ResolvedSubjectIdentity[]): void {
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
      `subjectKeys ${sortedSubjectKeys.map((key) => `"${key}"`).join(" and ")} both resolve to Sheathing ${owner.kind} ObjectId ${objectId}.`,
    );
  }
}

function linkSystemAreaIds(
  systems: SheathingSystem[],
  areas: SheathingArea[],
): SheathingSystem[] {
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
 * Deterministic Sheathing resolver.
 *
 * Groups Evidence by subjectKind + subjectKey, resolves systems and areas
 * independently, links parent/child relationships, and preserves partial
 * objects when inputs are missing or conflicted. Optional User Decisions may
 * resolve missing or conflicted scalar properties before Evidence selection.
 */
export function resolveSheathing(
  evidence: readonly Evidence[],
  options?: ResolveSheathingOptions,
): SheathingPayload {
  const systemGroups = groupBySubjectKind(evidence, "sheathing-system");
  const areaGroups = groupBySubjectKind(evidence, "sheathing-area");

  const systemIdentities = [...systemGroups.keys()]
    .sort(compareIds)
    .map((subjectKey) => ({
      subjectKey,
      objectId: createSheathingSystemObjectId(subjectKey),
      kind: "sheathing-system" as const,
    }));

  const areaIdentities = [...areaGroups.keys()]
    .sort(compareIds)
    .map((subjectKey) => ({
      subjectKey,
      objectId: createSheathingAreaObjectId(subjectKey),
      kind: "sheathing-area" as const,
    }));

  assertNoObjectIdCollisions([...systemIdentities, ...areaIdentities]);

  const userDecisionIndex = buildSheathingUserDecisionContext(
    evidence,
    systemIdentities,
    areaIdentities,
    options,
  );

  const systems = systemIdentities.map(({ subjectKey }) =>
    resolveOneSystem(
      subjectKey,
      systemGroups.get(subjectKey)!,
      userDecisionIndex,
    ),
  );
  const areas = areaIdentities.map(({ subjectKey }) =>
    resolveOneArea(subjectKey, areaGroups.get(subjectKey)!, userDecisionIndex),
  );

  return sheathingPayloadSchema.parse({
    systems: linkSystemAreaIds(systems, areas),
    areas,
  });
}

function buildEvidenceById(
  evidence: readonly Evidence[],
): ReadonlyMap<EvidenceId, Evidence> {
  return new Map(evidence.map((record) => [record.id, record]));
}

function buildSheathingSubjectBindingByObjectId(
  systemIdentities: readonly ResolvedSubjectIdentity[],
  areaIdentities: readonly ResolvedSubjectIdentity[],
): Map<ObjectId, SubjectBinding> {
  const bindings = new Map<ObjectId, SubjectBinding>();

  for (const identity of systemIdentities) {
    bindings.set(identity.objectId, {
      subjectKey: identity.subjectKey,
      subjectKind: "sheathing-system",
    });
  }

  for (const identity of areaIdentities) {
    bindings.set(identity.objectId, {
      subjectKey: identity.subjectKey,
      subjectKind: "sheathing-area",
    });
  }

  return bindings;
}

function buildSheathingUserDecisionContext(
  evidence: readonly Evidence[],
  systemIdentities: readonly ResolvedSubjectIdentity[],
  areaIdentities: readonly ResolvedSubjectIdentity[],
  options?: ResolveSheathingOptions,
): UserDecisionIndex {
  const userDecisions = options?.userDecisions ?? [];
  if (userDecisions.length === 0) {
    return new Map();
  }

  if (!options?.reviewItemsById) {
    throw new Error(
      "resolveSheathing requires reviewItemsById when userDecisions are supplied.",
    );
  }

  return buildUserDecisionIndex(
    filterUserDecisionsForPropertyPaths(
      {
        userDecisions,
        reviewItemsById: options.reviewItemsById,
        evidenceById: buildEvidenceById(evidence),
      },
      isSheathingUserDecisionPropertyPath,
      new Set(
        buildSheathingSubjectBindingByObjectId(
          systemIdentities,
          areaIdentities,
        ).keys(),
      ),
    ),
    buildSheathingSubjectBindingByObjectId(systemIdentities, areaIdentities),
  );
}
