import type { Evidence } from "../../../core/schemas/evidence.schema.js";
import type { EvidenceId, ObjectId } from "../../../core/schemas/identity.schema.js";
import type { PropertyResolutionTrace } from "../../../core/schemas/resolved-object.schema.js";

export type EvidenceBackedParentSystemLinkMethod =
  | "explicit-parent-system-tag"
  | "shared-assembly-callout"
  | "spatial-source-region";

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

function evidencePageNumber(record: Evidence): number | null {
  return record.source?.page?.pageNumber ?? null;
}

function sharedOriginalTextCallout(
  areaRecords: readonly Evidence[],
  systemRecords: readonly Evidence[],
): EvidenceId[] {
  const ids: EvidenceId[] = [];

  for (const areaRecord of areaRecords) {
    const areaText = areaRecord.originalText?.trim();
    if (!areaText || areaText.length < 12) {
      continue;
    }

    for (const systemRecord of systemRecords) {
      const systemText = systemRecord.originalText?.trim();
      if (!systemText) {
        continue;
      }

      if (areaText === systemText) {
        ids.push(areaRecord.id, systemRecord.id);
        continue;
      }

      const shorter =
        areaText.length <= systemText.length ? areaText : systemText;
      const longer =
        areaText.length <= systemText.length ? systemText : areaText;
      if (longer.includes(shorter) && shorter.length >= 20) {
        ids.push(areaRecord.id, systemRecord.id);
      }
    }
  }

  return uniqueSortedIds(ids);
}

function sharedSpatialRegion(
  areaRecords: readonly Evidence[],
  systemRecords: readonly Evidence[],
): EvidenceId[] {
  const ids: EvidenceId[] = [];

  for (const areaRecord of areaRecords) {
    for (const systemRecord of systemRecords) {
      const areaPage = evidencePageNumber(areaRecord);
      const systemPage = evidencePageNumber(systemRecord);
      if (areaPage === null || areaPage !== systemPage) {
        continue;
      }

      const areaRegion = areaRecord.source.region;
      const systemRegion = systemRecord.source.region;
      if (
        areaRegion &&
        systemRegion &&
        areaRegion.x === systemRegion.x &&
        areaRegion.y === systemRegion.y &&
        areaRegion.width === systemRegion.width &&
        areaRegion.height === systemRegion.height
      ) {
        ids.push(areaRecord.id, systemRecord.id);
      }

      const areaLabel = areaRecord.source.elementLabel?.trim().toLowerCase();
      const systemLabel = systemRecord.source.elementLabel?.trim().toLowerCase();
      if (
        areaLabel &&
        systemLabel &&
        areaLabel.length > 0 &&
        areaLabel === systemLabel
      ) {
        ids.push(areaRecord.id, systemRecord.id);
      }
    }
  }

  return uniqueSortedIds(ids);
}

/**
 * Evidence-backed area → system parent linking (authority order A–D through C).
 * String/token/slug similarity alone MUST NOT establish parentSystemId.
 * Returns null when authority is ambiguous — fail closed.
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
  domainLabel: "floor" | "sheathing";
}): EvidenceBackedParentSystemLink | null {
  if (input.explicitParentSystemTag) {
    return {
      systemSubjectKey: input.explicitParentSystemTag,
      systemId: input.createSystemObjectId(input.explicitParentSystemTag),
      method: "explicit-parent-system-tag",
      evidenceIds: uniqueSortedIds(
        input.areaRecords
          .filter((record) => record.propertyPath === "parentSystemTag")
          .map((record) => record.id),
      ),
      explanation: `Explicit parentSystemTag links ${input.domainLabel} area ${input.areaSubjectKey} to system ${input.explicitParentSystemTag}.`,
      requiresReview: false,
    };
  }

  const viableLinks: EvidenceBackedParentSystemLink[] = [];

  for (const candidate of input.systemCandidates) {
    const calloutIds = sharedOriginalTextCallout(
      input.areaRecords,
      candidate.records,
    );
    if (calloutIds.length > 0) {
      viableLinks.push({
        systemSubjectKey: candidate.subjectKey,
        systemId: input.createSystemObjectId(candidate.subjectKey),
        method: "shared-assembly-callout",
        evidenceIds: calloutIds,
        explanation: `Shared explicit assembly callout links ${input.domainLabel} area ${input.areaSubjectKey} to system ${candidate.subjectKey}.`,
        requiresReview: true,
      });
      continue;
    }

    const spatialIds = sharedSpatialRegion(input.areaRecords, candidate.records);
    if (spatialIds.length > 0) {
      viableLinks.push({
        systemSubjectKey: candidate.subjectKey,
        systemId: input.createSystemObjectId(candidate.subjectKey),
        method: "spatial-source-region",
        evidenceIds: spatialIds,
        explanation: `Shared spatial source region links ${input.domainLabel} area ${input.areaSubjectKey} to system ${candidate.subjectKey}.`,
        requiresReview: true,
      });
    }
  }

  const distinctSystems = new Set(viableLinks.map((link) => link.systemSubjectKey));
  if (distinctSystems.size === 1) {
    return viableLinks[0]!;
  }

  return null;
}

export function parentSystemLinkTrace(
  link: EvidenceBackedParentSystemLink,
): PropertyResolutionTrace {
  return {
    propertyPath: "parentSystemTag",
    method: link.requiresReview ? "supported-inference" : "explicit-project-value",
    explanation: link.explanation,
    evidenceIds: link.evidenceIds,
    assumptionIds: [],
    userDecisionIds: [],
    validationIssueIds: [],
    reviewItemIds: [],
  };
}
