import type { Evidence } from "../../../core/schemas/evidence.schema.js";
import type { EvidenceId, ObjectId } from "../../../core/schemas/identity.schema.js";
import type { PropertyResolutionTrace } from "../../../core/schemas/resolved-object.schema.js";
import { createFloorFramingSystemObjectId } from "./ids.js";

export type FloorParentSystemLinkMethod =
  | "explicit-parent-system-tag"
  | "shared-assembly-callout"
  | "spatial-source-region"
  | "inferred-semantic-identity";

export type FloorParentSystemLink = {
  systemSubjectKey: string;
  systemId: ObjectId;
  method: FloorParentSystemLinkMethod;
  evidenceIds: EvidenceId[];
  explanation: string;
  requiresReview: boolean;
};

const GENERIC_TOKENS = new Set([
  "FFA",
  "FFS",
  "FLOOR",
  "AREA",
  "SYS",
  "SYSTEM",
  "FRAMING",
  "MAIN",
  "PLAN",
]);

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueSortedIds(ids: readonly string[]): EvidenceId[] {
  return [...new Set(ids)].sort(compareIds) as EvidenceId[];
}

function evidencePageNumber(record: Evidence): number | null {
  return record.source?.page?.pageNumber ?? null;
}

function normalizeSubjectStem(subjectKey: string): string {
  return subjectKey
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "-")
    .replace(/^FFA-/, "")
    .replace(/^FFS-/, "")
    .replace(/^FLOOR-/, "")
    .replace(/^(AREA|SYS|SYSTEM)-/, "");
}

function semanticBaySlug(subjectKey: string): string {
  const stem = normalizeSubjectStem(subjectKey);
  const tokens = stem.split("-").filter((token) => token.length > 0);
  const specific = tokens.filter((token) => !GENERIC_TOKENS.has(token));
  return specific.join("-");
}

function tokenOverlapScore(areaKey: string, systemKey: string): number {
  const areaSlug = semanticBaySlug(areaKey);
  const systemSlug = semanticBaySlug(systemKey);

  if (areaSlug.length === 0 || systemSlug.length === 0) {
    return 0;
  }

  if (areaSlug === systemSlug) {
    return 100;
  }

  if (areaSlug.endsWith(systemSlug) || systemSlug.endsWith(areaSlug)) {
    return 80;
  }

  const areaTokens = new Set(areaSlug.split("-"));
  const systemTokens = new Set(systemSlug.split("-"));
  let shared = 0;
  for (const token of areaTokens) {
    if (systemTokens.has(token)) {
      shared += 1;
    }
  }

  return shared * 10;
}

function recordsOnPages(
  records: readonly Evidence[],
  pages: ReadonlySet<number>,
): Evidence[] {
  return records.filter((record) => {
    const page = evidencePageNumber(record);
    return page !== null && pages.has(page);
  });
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

function inferSemanticIdentityLink(
  areaSubjectKey: string,
  areaRecords: readonly Evidence[],
  candidates: ReadonlyArray<{
    subjectKey: string;
    records: readonly Evidence[];
  }>,
): FloorParentSystemLink | null {
  const areaPages = new Set(
    areaRecords
      .map(evidencePageNumber)
      .filter((page): page is number => page !== null),
  );

  const scored = candidates
    .map((candidate) => {
      const sharedPages = recordsOnPages(candidate.records, areaPages);
      if (areaPages.size > 0 && sharedPages.length === 0) {
        return null;
      }

      const score = tokenOverlapScore(areaSubjectKey, candidate.subjectKey);
      if (score < 80) {
        return null;
      }

      return {
        subjectKey: candidate.subjectKey,
        score,
        evidenceIds: uniqueSortedIds([
          ...areaRecords.map((record) => record.id),
          ...sharedPages.map((record) => record.id),
        ]),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort(
      (left, right) =>
        right.score - left.score || compareIds(left.subjectKey, right.subjectKey),
    );

  if (scored.length === 0) {
    return null;
  }

  const topScore = scored[0]!.score;
  const topTier = scored.filter((entry) => entry.score === topScore);
  if (topTier.length !== 1) {
    return null;
  }

  const winner = topTier[0]!;
  return {
    systemSubjectKey: winner.subjectKey,
    systemId: createFloorFramingSystemObjectId(winner.subjectKey),
    method: "inferred-semantic-identity",
    evidenceIds: winner.evidenceIds,
    explanation: `Inferred parent system ${winner.subjectKey} from unique semantic bay identity correspondence with area ${areaSubjectKey} on shared plan page(s).`,
    requiresReview: true,
  };
}

/**
 * Recover floor area → system ownership with corroboration tiers.
 * Returns null when authority is ambiguous — fail closed.
 */
export function resolveFloorAreaParentSystemLink(input: {
  areaSubjectKey: string;
  areaRecords: readonly Evidence[];
  explicitParentSystemTag: string | null;
  systemCandidates: ReadonlyArray<{
    subjectKey: string;
    records: readonly Evidence[];
  }>;
}): FloorParentSystemLink | null {
  if (input.explicitParentSystemTag) {
    return {
      systemSubjectKey: input.explicitParentSystemTag,
      systemId: createFloorFramingSystemObjectId(input.explicitParentSystemTag),
      method: "explicit-parent-system-tag",
      evidenceIds: uniqueSortedIds(
        input.areaRecords
          .filter((record) => record.propertyPath === "parentSystemTag")
          .map((record) => record.id),
      ),
      explanation: `Explicit parentSystemTag links area ${input.areaSubjectKey} to system ${input.explicitParentSystemTag}.`,
      requiresReview: false,
    };
  }

  const viableLinks: FloorParentSystemLink[] = [];

  for (const candidate of input.systemCandidates) {
    const calloutIds = sharedOriginalTextCallout(
      input.areaRecords,
      candidate.records,
    );
    if (calloutIds.length > 0) {
      viableLinks.push({
        systemSubjectKey: candidate.subjectKey,
        systemId: createFloorFramingSystemObjectId(candidate.subjectKey),
        method: "shared-assembly-callout",
        evidenceIds: calloutIds,
        explanation: `Shared explicit joist/floor assembly callout links area ${input.areaSubjectKey} to system ${candidate.subjectKey}.`,
        requiresReview: true,
      });
      continue;
    }

    const spatialIds = sharedSpatialRegion(input.areaRecords, candidate.records);
    if (spatialIds.length > 0) {
      viableLinks.push({
        systemSubjectKey: candidate.subjectKey,
        systemId: createFloorFramingSystemObjectId(candidate.subjectKey),
        method: "spatial-source-region",
        evidenceIds: spatialIds,
        explanation: `Shared spatial source region links area ${input.areaSubjectKey} to system ${candidate.subjectKey}.`,
        requiresReview: true,
      });
    }
  }

  const distinctSystems = new Set(viableLinks.map((link) => link.systemSubjectKey));
  if (distinctSystems.size === 1) {
    return viableLinks[0]!;
  }

  return inferSemanticIdentityLink(
    input.areaSubjectKey,
    input.areaRecords,
    input.systemCandidates,
  );
}

export function parentSystemLinkTrace(
  link: FloorParentSystemLink,
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
