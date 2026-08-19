import type { Evidence } from "../../../core/schemas/evidence.schema.js";
import type { EvidenceId, ObjectId } from "../../../core/schemas/identity.schema.js";
import type {
  PropertyResolutionTrace,
  ResolutionMethod,
} from "../../../core/schemas/resolved-object.schema.js";
import type { Completion } from "../../../core/schemas/status.schema.js";
import {
  structuralMembersPayloadSchema,
  type StructuralMembersPayload,
} from "../schemas/framing-artifacts.schema.js";
import type { StructuralMember } from "../schemas/structural-member.schema.js";
import { createStructuralMemberObjectId } from "./ids.js";
import {
  normalizeStructuralMemberCandidate,
  STRUCTURAL_MEMBER_PROPERTY_PATHS,
  type StructuralMemberPropertyPath,
} from "./structuralMemberPropertyPaths.js";

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

function isResolvedPropertyValue(
  propertyPath: StructuralMemberPropertyPath,
  value: string | number | null,
): boolean {
  if (value === null) {
    return false;
  }

  if (propertyPath === "category") {
    return value !== "unknown";
  }

  return true;
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

function resolveOneMember(
  subjectKey: string,
  records: readonly Evidence[],
): StructuralMember {
  const memberId = createStructuralMemberObjectId(subjectKey);
  const propertyResults = Object.fromEntries(
    STRUCTURAL_MEMBER_PROPERTY_PATHS.map((propertyPath) => {
      const decision = selectCandidate(records, propertyPath);
      return [
        propertyPath,
        {
          decision,
          traces: tracesForDecision(propertyPath, decision, records),
        },
      ];
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

  const resolutionTraces = STRUCTURAL_MEMBER_PROPERTY_PATHS.flatMap(
    (propertyPath) => propertyResults[propertyPath]!.traces,
  );

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
    plyCount: null,
  };

  const resolvedCount = STRUCTURAL_MEMBER_PROPERTY_PATHS.filter((propertyPath) => {
    const value = values[propertyPath];
    return isResolvedPropertyValue(propertyPath, value);
  }).length;

  return {
    id: memberId,
    objectType: "structural-member",
    completion: createCompletion(
      resolvedCount,
      STRUCTURAL_MEMBER_PROPERTY_PATHS.length,
    ),
    reviewStatus: "no-review-required",
    blockingStatus: "not-blocked",
    evidenceIds: uniqueSortedIds(records.map((record) => record.id)),
    assumptionIds: [],
    validationIssueIds: [],
    reviewItemIds: [],
    resolutionTraces,
    ...values,
    associatedObjectIds: [],
    supportedObjectIds: [],
    supportingObjectIds: [],
    connectorIds: [],
  };
}

type ResolvedSubjectIdentity = {
  subjectKey: string;
  memberId: ObjectId;
};

function assertNoObjectIdCollisions(identities: readonly ResolvedSubjectIdentity[]): void {
  const owners = new Map<string, string[]>();

  for (const identity of identities) {
    const existing = owners.get(identity.memberId);
    if (existing) {
      existing.push(identity.subjectKey);
    } else {
      owners.set(identity.memberId, [identity.subjectKey]);
    }
  }

  for (const [memberId, subjectKeys] of owners) {
    if (subjectKeys.length <= 1) {
      continue;
    }

    const sortedSubjectKeys = [...subjectKeys].sort(compareIds);
    throw new Error(
      `subjectKeys ${sortedSubjectKeys.map((key) => `"${key}"`).join(" and ")} both resolve to Structural Member ObjectId ${memberId}.`,
    );
  }
}

/**
 * Deterministic Structural Members resolver.
 *
 * Groups Evidence by exact subjectKind + subjectKey, resolves each subject
 * independently into one Structural Member, and fails deterministically when
 * distinct subjectKeys sanitize to the same ObjectId.
 *
 * Missing or conflicted properties are represented as null with traces only
 * when evidenced conflicts exist. Validation owns downstream calculation
 * blocking; partially unresolved members are always preserved.
 */
export function resolveStructuralMembers(
  evidence: readonly Evidence[],
): StructuralMembersPayload {
  const groups = groupBySubjectKey(evidence);
  const subjectKeys = [...groups.keys()].sort(compareIds);

  if (subjectKeys.length === 0) {
    return structuralMembersPayloadSchema.parse({ structuralMembers: [] });
  }

  const identities: ResolvedSubjectIdentity[] = subjectKeys.map((subjectKey) => ({
    subjectKey,
    memberId: createStructuralMemberObjectId(subjectKey),
  }));
  assertNoObjectIdCollisions(identities);

  const structuralMembers = subjectKeys.map((subjectKey) =>
    resolveOneMember(subjectKey, groups.get(subjectKey) ?? []),
  );

  return structuralMembersPayloadSchema.parse({ structuralMembers });
}
