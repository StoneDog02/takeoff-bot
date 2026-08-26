import type { Evidence } from "../../../core/schemas/evidence.schema.js";
import type { EvidenceId, ObjectId } from "../../../core/schemas/identity.schema.js";
import type { PropertyResolutionTrace } from "../../../core/schemas/resolved-object.schema.js";

export type EvidenceBackedParentSystemLinkMethod = "explicit-parent-system-tag";

export type EvidenceBackedParentSystemLink = {
  systemSubjectKey: string;
  systemId: ObjectId;
  method: EvidenceBackedParentSystemLinkMethod;
  evidenceIds: EvidenceId[];
  explanation: string;
  requiresReview: boolean;
};

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueSortedIds(ids: readonly string[]): EvidenceId[] {
  return [...new Set(ids)].sort(compareIds) as EvidenceId[];
}

function explicitParentSystemTagFromRecords(
  areaRecords: readonly Evidence[],
): { tag: string; evidenceIds: EvidenceId[] } | null {
  const parentRecords = areaRecords.filter(
    (record) => record.propertyPath === "parentSystemTag",
  );
  if (parentRecords.length === 0) {
    return null;
  }

  const tags = new Set(
    parentRecords
      .map((record) =>
        typeof record.candidateValue === "string"
          ? record.candidateValue.trim()
          : "",
      )
      .filter((tag) => tag.length > 0),
  );

  if (tags.size !== 1) {
    return null;
  }

  const tag = [...tags][0]!;
  return {
    tag,
    evidenceIds: uniqueSortedIds(parentRecords.map((record) => record.id)),
  };
}

/**
 * Tier-A only: consumes explicit parentSystemTag relationship Evidence.
 * Does not infer ownership from shared callouts, spatial co-location, or uniqueness.
 * Returns null when explicit relationship authority is missing or ambiguous.
 */
export function resolveEvidenceBackedParentSystemLink(input: {
  areaSubjectKey: string;
  areaRecords: readonly Evidence[];
  explicitParentSystemTag: string | null;
  systemCandidates: ReadonlyArray<{
    subjectKey: string;
    records: readonly Evidence[];
  }>;
  createSystemObjectId: (subjectKey: string) => ObjectId;
  domainLabel: "floor" | "sheathing" | "roof";
}): EvidenceBackedParentSystemLink | null {
  const explicitTag =
    input.explicitParentSystemTag?.trim() ||
    explicitParentSystemTagFromRecords(input.areaRecords)?.tag ||
    null;

  if (!explicitTag) {
    return null;
  }

  const parentRecords = input.areaRecords.filter(
    (record) => record.propertyPath === "parentSystemTag",
  );
  const evidenceIds =
    parentRecords.length > 0
      ? uniqueSortedIds(parentRecords.map((record) => record.id))
      : uniqueSortedIds([]);

  return {
    systemSubjectKey: explicitTag,
    systemId: input.createSystemObjectId(explicitTag),
    method: "explicit-parent-system-tag",
    evidenceIds,
    explanation: `Explicit parentSystemTag links ${input.domainLabel} area ${input.areaSubjectKey} to system ${explicitTag}.`,
    requiresReview: false,
  };
}

export function parentSystemLinkTrace(
  link: EvidenceBackedParentSystemLink,
): PropertyResolutionTrace {
  return {
    propertyPath: "parentSystemTag",
    method: "explicit-project-value",
    explanation: link.explanation,
    evidenceIds: link.evidenceIds,
    assumptionIds: [],
    userDecisionIds: [],
    validationIssueIds: [],
    reviewItemIds: [],
  };
}
