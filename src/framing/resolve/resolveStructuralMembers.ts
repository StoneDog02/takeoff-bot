import type { Evidence } from "../../core/schemas/evidence.schema.js";
import type { EvidenceId } from "../../core/schemas/identity.schema.js";
import type {
  PropertyResolutionTrace,
  ResolutionMethod,
} from "../../core/schemas/resolved-object.schema.js";
import {
  structuralMembersPayloadSchema,
  type StructuralMembersPayload,
} from "../schemas/framing-artifacts.schema.js";
import type { StructuralMember } from "../schemas/structural-member.schema.js";
import { createStructuralMemberObjectId } from "./ids.js";
import {
  convergeEvidenceByCanonicalObjectId,
  formatSubjectKeyConvergenceNote,
  type CanonicalEvidenceCluster,
} from "./convergeEvidenceByCanonicalObjectId.js";
import {
  normalizeStructuralMemberCandidate,
  STRUCTURAL_MEMBER_PROPERTY_PATHS,
  type StructuralMemberPropertyPath,
} from "./structuralMemberPropertyPaths.js";
import { applyStructuralMemberAuthority } from "./structuralMemberAuthority.js";

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
  propertyPath: StructuralMemberPropertyPath,
): CandidateDecision {
  const usable: Array<{ value: string | number; id: EvidenceId }> = [];

  for (const record of records) {
    if (record.propertyPath !== propertyPath) {
      continue;
    }

    const value = normalizeStructuralMemberCandidate(
      propertyPath,
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
  propertyPath: StructuralMemberPropertyPath,
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
  propertyPath: StructuralMemberPropertyPath,
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
  propertyPath: StructuralMemberPropertyPath,
  records: readonly Evidence[],
): { decision: CandidateDecision; traces: PropertyResolutionTrace[] } {
  const decision = selectCandidate(records, propertyPath);
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

function groupBySubjectKey(evidence: readonly Evidence[]): Map<string, Evidence[]> {
  const groups = new Map<string, Evidence[]>();

  for (const record of evidence) {
    if (record.subjectKind !== "structural-member") {
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

function resolveOneMember(
  cluster: CanonicalEvidenceCluster,
): StructuralMember {
  const subjectKey = cluster.canonicalSubjectKey;
  const records = cluster.records;
  const memberId = cluster.objectId;
  const propertyResults = Object.fromEntries(
    STRUCTURAL_MEMBER_PROPERTY_PATHS.map((propertyPath) => {
      const result = resolvePropertyAuthority(
        propertyPath,
        records,
      );
      return [propertyPath, result];
    }),
  ) as Record<
    StructuralMemberPropertyPath,
    { decision: CandidateDecision; traces: PropertyResolutionTrace[] }
  >;

  const decisions = Object.fromEntries(
    STRUCTURAL_MEMBER_PROPERTY_PATHS.map((propertyPath) => [
      propertyPath,
      propertyResults[propertyPath]!.decision,
    ]),
  ) as Record<StructuralMemberPropertyPath, CandidateDecision>;

  const resolutionTraces = [
    ...convergenceTraces(cluster),
    ...STRUCTURAL_MEMBER_PROPERTY_PATHS.flatMap(
      (propertyPath) => propertyResults[propertyPath]!.traces,
    ),
  ];

  const categoryDecision = decisions.category;
  const category =
    categoryDecision.kind === "resolved"
      ? (categoryDecision.value as StructuralMember["category"])
      : "unknown";

  const values = {
    category,
    materialType: resolvedStringValue(decisions.materialType, null),
    size: resolvedStringValue(decisions.size, null),
    lengthFeet: resolvedNumberValue(decisions.lengthFeet, null),
    quantity: resolvedNumberValue(decisions.quantity, null),
    location: resolvedStringValue(decisions.location, null),
    plyCount: resolvedNumberValue(decisions.plyCount, null),
  };

  return {
    id: memberId,
    objectType: "structural-member",
    resolutionTraces,
    ...values,
    associatedObjectIds: [],
    supportedObjectIds: [],
    supportingObjectIds: [],
    connectorIds: [],
  };
}

/**
 * Deterministic Structural Members resolver.
 *
 * Groups Evidence by exact subjectKind + subjectKey, converges raw subjectKeys
 * that mint the same ObjectId into one domain object, and resolves each cluster
 * independently into one Structural Member.
 * Missing or conflicted properties are represented as null with traces only
 * when evidenced conflicts exist.
 * Validation owns downstream calculation blocking; partially unresolved
 * members are always preserved.
 */
export function resolveStructuralMembers(
  evidence: readonly Evidence[],
): StructuralMembersPayload {
  const groups = groupBySubjectKey(evidence);

  if (groups.size === 0) {
    return structuralMembersPayloadSchema.parse({ structuralMembers: [] });
  }

  const clusters = convergeEvidenceByCanonicalObjectId({
    groups,
    createObjectId: createStructuralMemberObjectId,
  });

  const structuralMembers = clusters.map((cluster) => {
    const resolved = resolveOneMember(cluster);
    return applyStructuralMemberAuthority(
      cluster.canonicalSubjectKey,
      resolved,
      cluster.records,
    );
  });

  return structuralMembersPayloadSchema.parse({ structuralMembers });
}
