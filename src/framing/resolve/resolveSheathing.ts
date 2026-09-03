import type { Evidence } from "../../core/schemas/evidence.schema.js";
import type {
  EvidenceId,
  ObjectId,
} from "../../core/schemas/identity.schema.js";
import type {
  PropertyResolutionTrace,
  ResolutionMethod,
} from "../../core/schemas/resolved-object.schema.js";
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
  convergeEvidenceByCanonicalObjectId,
  formatSubjectKeyConvergenceNote,
  type CanonicalEvidenceCluster,
} from "./convergeEvidenceByCanonicalObjectId.js";
import {
  createOpeningObjectId,
  createSheathingAreaObjectId,
  createSheathingSystemObjectId,
  createWallObjectId,
} from "./ids.js";
import {
  parentSystemLinkTrace,
  resolveSheathingAreaParentSystemLink,
} from "./resolveSheathingAreaParentSystem.js";
import {
  normalizeSheathingAreaCandidate,
  normalizeSheathingAreaRelationshipCandidate,
  normalizeSheathingSystemCandidate,
  SHEATHING_AREA_PROPERTY_PATHS,
  SHEATHING_SYSTEM_PROPERTY_PATHS,
  type SheathingAreaPropertyPath,
  type SheathingAreaRelationshipPropertyPath,
  type SheathingSystemPropertyPath,
} from "./sheathingPropertyPaths.js";

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
): PropertyResolutionTrace {
  return {
    propertyPath,
    method,
    explanation,
    assumptionIds: [],
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

function resolvePropertyAuthority(
  propertyPath: SheathingSystemPropertyPath | SheathingAreaPropertyPath,
  records: readonly Evidence[],
  normalize: (
    path: string,
    candidateValue: Evidence["candidateValue"],
  ) => string | number | undefined,
): { decision: CandidateDecision; traces: PropertyResolutionTrace[] } {
  const decision = selectCandidate(records, propertyPath, normalize);
  return {
    decision,
    traces: tracesForDecision(propertyPath, decision, records),
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
): { tags: string[]; traces: PropertyResolutionTrace[] } {
  const tags: string[] = [];
  const traces: PropertyResolutionTrace[] = [];

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
    traces.push(
      createTrace(
        propertyPath,
        "explicit-project-value",
        `Resolved ${propertyPath} from explicit project evidence ${record.id}.`,
      ),
    );
  }

  return {
    tags: [...new Set(tags)].sort(compareIds),
    traces,
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
    createTrace("subjectKey", "supported-inference", note),
  ];
}

function resolveOneSystem(
  cluster: CanonicalEvidenceCluster,
): SheathingSystem {
  const subjectKey = cluster.canonicalSubjectKey;
  const records = cluster.records;
  const systemId = cluster.objectId;
  const propertyResults = Object.fromEntries(
    SHEATHING_SYSTEM_PROPERTY_PATHS.map((propertyPath) => {
      const result = resolvePropertyAuthority(
        propertyPath,
        records,
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

  const resolutionTraces = [
    ...convergenceTraces(cluster),
    ...SHEATHING_SYSTEM_PROPERTY_PATHS.flatMap(
      (propertyPath) => propertyResults[propertyPath]!.traces,
    ),
  ];

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

  return {
    id: systemId,
    objectType: "sheathing-system",
    resolutionTraces,
    ...values,
    areaIds: [],
  };
}

function resolveOneArea(
  cluster: CanonicalEvidenceCluster,
): SheathingArea {
  const records = cluster.records;
  const areaId = cluster.objectId;
  const propertyResults = Object.fromEntries(
    SHEATHING_AREA_PROPERTY_PATHS.map((propertyPath) => {
      const result = resolvePropertyAuthority(
        propertyPath,
        records,
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
    ...convergenceTraces(cluster),
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

  return {
    id: areaId,
    objectType: "sheathing-area",
    resolutionTraces,
    parentSystemId,
    ...values,
    coveredObjectIds,
    openingIds,
  };
}

function applyInferredParentSystemLink(
  area: SheathingArea,
  areaSubjectKey: string,
  areaRecords: readonly Evidence[],
  explicitParentSystemTag: string | null,
  systemCandidates: ReadonlyArray<{
    subjectKey: string;
    records: readonly Evidence[];
  }>,
): SheathingArea {
  if (!area.parentSystemId.endsWith("UNRESOLVED")) {
    return area;
  }

  const link = resolveSheathingAreaParentSystemLink({
    areaSubjectKey,
    areaRecords,
    explicitParentSystemTag,
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
  };
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
 * Groups Evidence by subjectKind + subjectKey, converges raw subjectKeys that
 * mint the same ObjectId into one domain object, resolves systems and areas
 * independently, links parent/child relationships, and preserves partial
 * objects when inputs are missing or conflicted.
 */
export function resolveSheathing(
  evidence: readonly Evidence[],
): SheathingPayload {
  const systemGroups = groupBySubjectKind(evidence, "sheathing-system");
  const areaGroups = groupBySubjectKind(evidence, "sheathing-area");

  const systemClusters = convergeEvidenceByCanonicalObjectId({
    groups: systemGroups,
    createObjectId: createSheathingSystemObjectId,
  });
  const areaClusters = convergeEvidenceByCanonicalObjectId({
    groups: areaGroups,
    createObjectId: createSheathingAreaObjectId,
  });

  const systems = systemClusters.map((cluster) =>
    resolveOneSystem(cluster),
  );

  const systemCandidates = systemClusters.map((cluster) => ({
    subjectKey: cluster.canonicalSubjectKey,
    records: cluster.records,
  }));

  const areas = areaClusters.map((cluster) => {
    const areaRecords = cluster.records;
    let area = resolveOneArea(cluster);
    const parentSystemDecision = selectCandidate(
      areaRecords,
      "parentSystemTag",
      (path, candidateValue) =>
        normalizeSheathingAreaRelationshipCandidate(
          path as SheathingAreaRelationshipPropertyPath,
          candidateValue,
        ),
    );
    const explicitParentSystemTag =
      parentSystemDecision.kind === "resolved"
        ? (parentSystemDecision.value as string)
        : null;

    area = applyInferredParentSystemLink(
      area,
      cluster.canonicalSubjectKey,
      areaRecords,
      explicitParentSystemTag,
      systemCandidates,
    );

    return area;
  });

  return sheathingPayloadSchema.parse({
    systems: linkSystemAreaIds(systems, areas),
    areas,
  });
}
