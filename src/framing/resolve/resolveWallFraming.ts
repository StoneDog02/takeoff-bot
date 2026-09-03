import type { Evidence } from "../../core/schemas/evidence.schema.js";
import type { EvidenceId } from "../../core/schemas/identity.schema.js";
import type {
  PropertyResolutionTrace,
  ResolutionMethod,
} from "../../core/schemas/resolved-object.schema.js";
import {
  wallFramingPayloadSchema,
  type WallFramingPayload,
} from "../schemas/framing-artifacts.schema.js";
import {
  type BuildingWall,
  type WallSegment,
} from "../schemas/wall.schema.js";
import { createWallObjectId, createWallSegmentObjectId } from "./ids.js";
import {
  convergeEvidenceByCanonicalObjectId,
  formatSubjectKeyConvergenceNote,
  type CanonicalEvidenceCluster,
} from "./convergeEvidenceByCanonicalObjectId.js";
import {
  normalizeWallFramingCandidate,
  SEGMENT_PROPERTY_PATHS,
  WALL_PROPERTY_PATHS,
  type SegmentPropertyPath,
  type WallPropertyPath,
} from "./wallFramingPropertyPaths.js";
import {
  SEMANTIC_TYPE_KEY_PROPERTY_PATH,
  BINDING_AUTHORITY_GRADE_PROPERTY_PATH,
} from "../geometry/semanticBindingConstants.js";

const BINDING_PROPERTY_PATHS = [
  SEMANTIC_TYPE_KEY_PROPERTY_PATH,
  BINDING_AUTHORITY_GRADE_PROPERTY_PATH,
] as const;

type BindingPropertyPath = (typeof BINDING_PROPERTY_PATHS)[number];
type SupportedPropertyPath =
  | WallPropertyPath
  | SegmentPropertyPath
  | BindingPropertyPath;

function isPhysicalRunSubjectKey(subjectKey: string): boolean {
  return subjectKey.trim().startsWith("physical-run:");
}

type CandidateDecision =
  | { kind: "missing" }
  | { kind: "resolved"; value: string | number | boolean; evidenceIds: EvidenceId[] }
  | { kind: "conflict"; evidenceIds: EvidenceId[] };

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueSortedIds(ids: readonly string[]): EvidenceId[] {
  return [...new Set(ids)].sort(compareIds) as EvidenceId[];
}

function normalizeBindingCandidate(
  propertyPath: BindingPropertyPath,
  candidateValue: Evidence["candidateValue"],
): string | undefined {
  if (candidateValue === null || typeof candidateValue !== "string") {
    return undefined;
  }
  if (propertyPath === SEMANTIC_TYPE_KEY_PROPERTY_PATH) {
    return candidateValue.trim().length > 0 ? candidateValue.trim() : undefined;
  }
  if (propertyPath === BINDING_AUTHORITY_GRADE_PROPERTY_PATH) {
    return candidateValue === "A" || candidateValue === "B"
      ? candidateValue
      : undefined;
  }
  return undefined;
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

    const value =
      (WALL_PROPERTY_PATHS as readonly string[]).includes(propertyPath) ||
      (SEGMENT_PROPERTY_PATHS as readonly string[]).includes(propertyPath)
        ? normalizeWallFramingCandidate(
            propertyPath as WallPropertyPath | SegmentPropertyPath,
            record.candidateValue,
          )
        : normalizeBindingCandidate(
            propertyPath as BindingPropertyPath,
            record.candidateValue,
          );
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
  propertyPath: SupportedPropertyPath,
  records: readonly Evidence[],
): { decision: CandidateDecision; traces: PropertyResolutionTrace[] } {
  const decision = selectCandidate(records, propertyPath);
  return {
    decision,
    traces: tracesForDecision(propertyPath, decision, records),
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

function resolveOneWall(
  cluster: CanonicalEvidenceCluster,
  allGroups: Map<string, Evidence[]>,
): { wall: BuildingWall; segment: WallSegment } {
  const subjectKey = cluster.canonicalSubjectKey;
  const records = cluster.records;
  const wallId = cluster.objectId;
  const segmentId = createWallSegmentObjectId(wallId);

  const semanticTypeDecision = isPhysicalRunSubjectKey(subjectKey)
    ? selectCandidate(records, SEMANTIC_TYPE_KEY_PROPERTY_PATH)
    : { kind: "missing" as const };
  const semanticTypeKey =
    semanticTypeDecision.kind === "resolved"
      ? (semanticTypeDecision.value as string)
      : null;

  const gradeDecision = isPhysicalRunSubjectKey(subjectKey)
    ? selectCandidate(records, BINDING_AUTHORITY_GRADE_PROPERTY_PATH)
    : { kind: "missing" as const };
  const bindingAuthorityGrade =
    gradeDecision.kind === "resolved" &&
    (gradeDecision.value === "A" || gradeDecision.value === "B")
      ? gradeDecision.value
      : null;

  const typeClusterRecords =
    semanticTypeKey != null ? (allGroups.get(semanticTypeKey) ?? []) : [];
  const wallResolutionRecords =
    semanticTypeKey != null && typeClusterRecords.length > 0
      ? [...records, ...typeClusterRecords]
      : records;
  const segmentResolutionRecords = records;

  const wallPropertyResults = Object.fromEntries(
    WALL_PROPERTY_PATHS.map((propertyPath) => [
      propertyPath,
      resolvePropertyAuthority(
        propertyPath,
        wallResolutionRecords,
      ),
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

  const wallTraces = [
    ...convergenceTraces(cluster),
    ...WALL_PROPERTY_PATHS.flatMap(
      (propertyPath) => wallPropertyResults[propertyPath]!.traces,
    ),
  ];

  const lengthResolved = resolvePropertyAuthority(
    "lengthFeet",
    segmentResolutionRecords,
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

  const lengthFeet = resolvedValue<number>(lengthResolved.decision, null);

  const wall: BuildingWall = {
    id: wallId,
    objectType: "building-wall",
    resolutionTraces: wallTraces,
    name: subjectKey,
    level: null,
    semanticTypeKey,
    bindingAuthorityGrade,
    ...wallValues,
    segmentIds: [segmentId],
  };

  const segment: WallSegment = {
    id: segmentId,
    objectType: "wall-segment",
    resolutionTraces: segmentTraces,
    parentWallId: wallId,
    lengthFeet,
    openingIds: [],
  };

  return { wall, segment };
}

/**
 * Deterministic Wall Framing resolver.
 *
 * Groups Evidence by exact subjectKey (after schema trim), converges raw
 * subjectKeys that mint the same ObjectId into one domain object, resolves
 * each subject independently into one Building Wall and one Wall Segment.
 * It never applies assumptions, sheet precedence, validation, or quantity
 * calculation.
 */
export function resolveWallFraming(
  evidence: readonly Evidence[],
): WallFramingPayload {
  const groups = groupBySubjectKey(evidence);

  if (groups.size === 0) {
    return wallFramingPayloadSchema.parse({ walls: [], segments: [] });
  }

  const clusters = convergeEvidenceByCanonicalObjectId({
    groups,
    createObjectId: createWallObjectId,
  });

  const walls: BuildingWall[] = [];
  const segments: WallSegment[] = [];

  for (const cluster of clusters) {
    const { wall, segment } = resolveOneWall(
      cluster,
      groups,
    );
    walls.push(wall);
    segments.push(segment);
  }

  return wallFramingPayloadSchema.parse({ walls, segments });
}
