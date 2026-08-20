import type { Evidence } from "../../../core/schemas/evidence.schema.js";
import type { EvidenceId, ObjectId } from "../../../core/schemas/identity.schema.js";
import type {
  PropertyResolutionTrace,
  ResolutionMethod,
} from "../../../core/schemas/resolved-object.schema.js";
import type { Completion } from "../../../core/schemas/status.schema.js";
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
  createFloorFramingAreaObjectId,
  createFloorFramingSystemObjectId,
  createOpeningObjectId,
  createStructuralMemberObjectId,
  createWallObjectId,
} from "./ids.js";
import {
  FLOOR_AREA_PROPERTY_PATHS,
  FLOOR_SYSTEM_PROPERTY_PATHS,
  isResolvedFloorAreaPropertyValue,
  isResolvedFloorSystemPropertyValue,
  normalizeFloorAreaCandidate,
  normalizeFloorAreaRelationshipCandidate,
  normalizeFloorSystemCandidate,
  type FloorAreaPropertyPath,
  type FloorAreaRelationshipPropertyPath,
  type FloorSystemPropertyPath,
} from "./floorFramingPropertyPaths.js";

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

function resolveOneSystem(
  subjectKey: string,
  records: readonly Evidence[],
): FloorFramingSystem {
  const systemId = createFloorFramingSystemObjectId(subjectKey);
  const propertyResults = Object.fromEntries(
    FLOOR_SYSTEM_PROPERTY_PATHS.map((propertyPath) => {
      const decision = selectCandidate(
        records,
        propertyPath,
        (path, candidateValue) =>
          normalizeFloorSystemCandidate(
            path as FloorSystemPropertyPath,
            candidateValue,
          ),
      );
      return [
        propertyPath,
        {
          decision,
          traces: tracesForDecision(propertyPath, decision, records),
        },
      ];
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

  const resolutionTraces = FLOOR_SYSTEM_PROPERTY_PATHS.flatMap(
    (propertyPath) => propertyResults[propertyPath]!.traces,
  );

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

function resolveOneArea(
  subjectKey: string,
  records: readonly Evidence[],
): FloorFramingArea {
  const areaId = createFloorFramingAreaObjectId(subjectKey);
  const propertyResults = Object.fromEntries(
    FLOOR_AREA_PROPERTY_PATHS.map((propertyPath) => {
      const decision = selectCandidate(
        records,
        propertyPath,
        (path, candidateValue) =>
          normalizeFloorAreaCandidate(
            path as FloorAreaPropertyPath,
            candidateValue,
          ),
      );
      return [
        propertyPath,
        {
          decision,
          traces: tracesForDecision(propertyPath, decision, records),
        },
      ];
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

type ResolvedSubjectIdentity = {
  subjectKey: string;
  objectId: ObjectId;
  kind: "floor-framing-system" | "floor-framing-area";
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
      `subjectKeys ${sortedSubjectKeys.map((key) => `"${key}"`).join(" and ")} both resolve to Floor Framing ${owner.kind} ObjectId ${objectId}.`,
    );
  }
}

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
 * Groups Evidence by subjectKind + subjectKey, resolves systems and areas
 * independently, links parent/child relationships, and preserves partial
 * objects when inputs are missing or conflicted.
 */
export function resolveFloorFraming(
  evidence: readonly Evidence[],
): FloorFramingPayload {
  const systemGroups = groupBySubjectKind(evidence, "floor-framing-system");
  const areaGroups = groupBySubjectKind(evidence, "floor-framing-area");

  const systemIdentities = [...systemGroups.keys()]
    .sort(compareIds)
    .map((subjectKey) => ({
      subjectKey,
      objectId: createFloorFramingSystemObjectId(subjectKey),
      kind: "floor-framing-system" as const,
    }));

  const areaIdentities = [...areaGroups.keys()]
    .sort(compareIds)
    .map((subjectKey) => ({
      subjectKey,
      objectId: createFloorFramingAreaObjectId(subjectKey),
      kind: "floor-framing-area" as const,
    }));

  assertNoObjectIdCollisions([...systemIdentities, ...areaIdentities]);

  const systems = systemIdentities.map(({ subjectKey }) =>
    resolveOneSystem(subjectKey, systemGroups.get(subjectKey)!),
  );
  const areas = areaIdentities.map(({ subjectKey }) =>
    resolveOneArea(subjectKey, areaGroups.get(subjectKey)!),
  );

  return floorFramingPayloadSchema.parse({
    systems: linkSystemAreaIds(systems, areas),
    areas,
  });
}
