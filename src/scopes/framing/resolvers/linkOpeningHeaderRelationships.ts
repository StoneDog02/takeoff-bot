import type { Evidence } from "../../../core/schemas/evidence.schema.js";
import type { EvidenceId, ObjectId } from "../../../core/schemas/identity.schema.js";
import type { PropertyResolutionTrace } from "../../../core/schemas/resolved-object.schema.js";
import {
  openingsPayloadSchema,
  structuralMembersPayloadSchema,
  type OpeningsPayload,
  type StructuralMembersPayload,
} from "../schemas/framing-artifacts.schema.js";
import type { Opening } from "../schemas/opening.schema.js";
import type { StructuralMember } from "../schemas/structural-member.schema.js";
import { createOpeningObjectId, createStructuralMemberObjectId } from "./ids.js";
import {
  normalizeOpeningRelationshipCandidate,
  type OpeningRelationshipPropertyPath,
} from "./openingPropertyPaths.js";
import {
  normalizeStructuralMemberRelationshipCandidate,
  type StructuralMemberRelationshipPropertyPath,
} from "./structuralMemberPropertyPaths.js";

type CandidateDecision =
  | { kind: "missing" }
  | { kind: "resolved"; value: string; evidenceIds: EvidenceId[] }
  | { kind: "conflict"; evidenceIds: EvidenceId[] };

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueSortedIds(ids: readonly string[]): EvidenceId[] {
  return [...new Set(ids)].sort(compareIds) as EvidenceId[];
}

function selectOpeningTagCandidate(
  records: readonly Evidence[],
  propertyPath: OpeningRelationshipPropertyPath,
): CandidateDecision {
  return selectTagCandidate(records, propertyPath, (path, candidateValue) =>
    normalizeOpeningRelationshipCandidate(
      path as OpeningRelationshipPropertyPath,
      candidateValue,
    ),
  );
}

function selectMemberTagCandidate(
  records: readonly Evidence[],
  propertyPath: StructuralMemberRelationshipPropertyPath,
): CandidateDecision {
  return selectTagCandidate(records, propertyPath, (path, candidateValue) =>
    normalizeStructuralMemberRelationshipCandidate(
      path as StructuralMemberRelationshipPropertyPath,
      candidateValue,
    ),
  );
}

function selectTagCandidate(
  records: readonly Evidence[],
  propertyPath: string,
  normalize: (
    path: string,
    candidateValue: Evidence["candidateValue"],
  ) => string | undefined,
): CandidateDecision {
  const usable: Array<{ value: string; id: EvidenceId }> = [];

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

  const grouped = new Map<string, { value: string; ids: EvidenceId[] }>();
  for (const entry of usable) {
    const existing = grouped.get(entry.value);
    if (existing) {
      existing.ids.push(entry.id);
    } else {
      grouped.set(entry.value, { value: entry.value, ids: [entry.id] });
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
  method: PropertyResolutionTrace["method"],
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

function tracesForTagDecision(
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
      createTrace(propertyPath, "explicit-project-value", explanation, decision.evidenceIds),
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

function groupOpeningEvidence(
  evidence: readonly Evidence[],
): Map<string, Evidence[]> {
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

function groupStructuralMemberEvidence(
  evidence: readonly Evidence[],
): Map<string, Evidence[]> {
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

function resolveHeaderMemberId(
  records: readonly Evidence[],
  structuralMembers: StructuralMembersPayload,
): {
  headerMemberId: ObjectId | null;
  traces: PropertyResolutionTrace[];
} {
  const decision = selectOpeningTagCandidate(records, "headerMemberTag");
  const tagTraces = tracesForTagDecision("headerMemberTag", decision, records);

  if (decision.kind !== "resolved") {
    return { headerMemberId: null, traces: tagTraces };
  }

  const headerMemberId = createStructuralMemberObjectId(decision.value);
  const member = structuralMembers.structuralMembers.find(
    (candidate) => candidate.id === headerMemberId,
  );

  const relationshipTraces: PropertyResolutionTrace[] = [...tagTraces];

  if (member) {
    relationshipTraces.push(
      createTrace(
        "headerMemberId",
        "deterministic-calculation",
        `Mapped explicit header tag ${decision.value} to resolved structural member ${headerMemberId}.`,
        decision.evidenceIds,
      ),
    );
  } else {
    relationshipTraces.push(
      createTrace(
        "headerMemberId",
        "deterministic-calculation",
        `Mapped explicit header tag ${decision.value} to ObjectId ${headerMemberId}, but no matching resolved structural member exists.`,
        decision.evidenceIds,
      ),
    );
  }

  return { headerMemberId, traces: relationshipTraces };
}

function applyOpeningHeaderMemberTags(
  openings: readonly Opening[],
  openingEvidenceBySubjectKey: ReadonlyMap<string, Evidence[]>,
  structuralMembers: StructuralMembersPayload,
): Opening[] {
  return openings.map((opening) => {
    const subjectKey = opening.id;
    const records = openingEvidenceBySubjectKey.get(subjectKey) ?? [];
    const relationship = resolveHeaderMemberId(records, structuralMembers);

    if (relationship.traces.length === 0 && opening.headerMemberId === null) {
      return opening;
    }

    return {
      ...opening,
      headerMemberId: relationship.headerMemberId,
      resolutionTraces: [...opening.resolutionTraces, ...relationship.traces],
    };
  });
}

function mergeSupportedOpeningIds(
  member: StructuralMember,
  openingIds: readonly ObjectId[],
): StructuralMember {
  if (openingIds.length === 0) {
    return member;
  }

  const supportedObjectIds = [
    ...new Set([...member.supportedObjectIds, ...openingIds]),
  ].sort(compareIds) as ObjectId[];

  return {
    ...member,
    supportedObjectIds,
  };
}

function memberSubjectKey(member: StructuralMember): string {
  return member.id.startsWith("SM-") ? member.id.slice(3) : member.id;
}

function applyMemberSupportedOpeningTags(
  members: readonly StructuralMember[],
  memberEvidenceBySubjectKey: ReadonlyMap<string, Evidence[]>,
  openingsById: ReadonlyMap<ObjectId, Opening>,
): { members: StructuralMember[]; openings: Opening[] } {
  const openings = [...openingsById.values()];
  const openingsByIdMutable = new Map(openings.map((opening) => [opening.id, opening]));

  const updatedMembers = members.map((member) => {
    const records = memberEvidenceBySubjectKey.get(memberSubjectKey(member)) ?? [];

    const decision = selectMemberTagCandidate(records, "supportedOpeningTag");

    if (decision.kind !== "resolved") {
      return member;
    }

    const openingId = createOpeningObjectId(decision.value);
    const opening = openingsByIdMutable.get(openingId);
    if (opening && opening.headerMemberId === null) {
      openingsByIdMutable.set(openingId, {
        ...opening,
        headerMemberId: member.id,
        resolutionTraces: [
          ...opening.resolutionTraces,
          createTrace(
            "headerMemberId",
            "deterministic-calculation",
            `Mapped explicit supported opening tag ${decision.value} from structural member ${member.id}.`,
            decision.evidenceIds,
          ),
        ],
      });
    }

    return mergeSupportedOpeningIds(member, [openingId]);
  });

  return {
    members: updatedMembers,
    openings: [...openingsByIdMutable.values()].sort((left, right) =>
      compareIds(left.id, right.id),
    ),
  };
}

function applyOpeningHeaderBacklinks(members: readonly StructuralMember[], openings: readonly Opening[]): StructuralMember[] {
  const openingsByMember = new Map<ObjectId, ObjectId[]>();

  for (const opening of openings) {
    if (opening.headerMemberId === null) {
      continue;
    }

    const existing = openingsByMember.get(opening.headerMemberId) ?? [];
    existing.push(opening.id);
    openingsByMember.set(opening.headerMemberId, existing);
  }

  return members.map((member) => {
    const linkedOpeningIds = openingsByMember.get(member.id);
    if (!linkedOpeningIds || linkedOpeningIds.length === 0) {
      return member;
    }

    return mergeSupportedOpeningIds(member, linkedOpeningIds);
  });
}

/**
 * Resolves explicit Opening ↔ Structural Member header relationships from
 * Evidence and populates Opening.headerMemberId with Structural Member
 * supportedObjectIds backlinks when contracts require them.
 */
export function linkOpeningHeaderRelationships(
  evidence: readonly Evidence[],
  openings: OpeningsPayload,
  structuralMembers: StructuralMembersPayload,
): { openings: OpeningsPayload; structuralMembers: StructuralMembersPayload } {
  const openingEvidenceBySubjectKey = groupOpeningEvidence(evidence);
  const memberEvidenceBySubjectKey = groupStructuralMemberEvidence(evidence);

  const openingsWithHeaderTags = applyOpeningHeaderMemberTags(
    openings.openings,
    openingEvidenceBySubjectKey,
    structuralMembers,
  );
  const openingsById = new Map(
    openingsWithHeaderTags.map((opening) => [opening.id, opening]),
  );

  const memberTagResult = applyMemberSupportedOpeningTags(
    structuralMembers.structuralMembers,
    memberEvidenceBySubjectKey,
    openingsById,
  );

  const linkedMembers = applyOpeningHeaderBacklinks(
    memberTagResult.members,
    memberTagResult.openings,
  );

  return {
    openings: openingsPayloadSchema.parse({ openings: memberTagResult.openings }),
    structuralMembers: structuralMembersPayloadSchema.parse({
      structuralMembers: linkedMembers,
    }),
  };
}

export function openingHeaderLinksChanged(
  before: OpeningsPayload,
  after: OpeningsPayload,
): boolean {
  if (before.openings.length !== after.openings.length) {
    return true;
  }

  return before.openings.some((opening, index) => {
    const updated = after.openings[index];
    if (!updated || opening.id !== updated.id) {
      return true;
    }

    return opening.headerMemberId !== updated.headerMemberId;
  });
}

export function structuralMemberOpeningLinksChanged(
  before: StructuralMembersPayload,
  after: StructuralMembersPayload,
): boolean {
  if (before.structuralMembers.length !== after.structuralMembers.length) {
    return true;
  }

  return before.structuralMembers.some((member, index) => {
    const updated = after.structuralMembers[index];
    if (!updated || member.id !== updated.id) {
      return true;
    }

    if (member.supportedObjectIds.length !== updated.supportedObjectIds.length) {
      return true;
    }

    return member.supportedObjectIds.some(
      (openingId, openingIndex) => openingId !== updated.supportedObjectIds[openingIndex],
    );
  });
}
