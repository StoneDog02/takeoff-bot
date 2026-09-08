import type { CompiledDrawingPage } from "../../compiler/schemas/compiledDrawingPage.schema.js";
import type { Evidence } from "../../core/schemas/evidence.schema.js";
import { evidenceSchema } from "../../core/schemas/evidence.schema.js";
import { discoverGovernedOpeningCandidates } from "./buildOpeningEvidenceFromCompiledPages.js";
import type { GovernedOpeningCandidate } from "./openingGovernanceTypes.js";
import { openingMarkKeysCompatible } from "./openingMarkText.js";

export const IDENTIFIED_OPENING_PARENT_PASS_ID =
  "opening-geometry-identified-parent";

export type IdentifiedOpeningParentAttachment = {
  identifiedSubjectKey: string;
  geometrySubjectKey: string;
  parentPhysicalRunKey: string;
  roughWidthFeet: number | null;
};

export type IdentifiedOpeningGeometryMergeAudit = {
  gapCandidateCount: number;
  establishedParentAndMarkCount: number;
  ambiguousOrUnresolvedSkipped: number;
  uniqueAttachments: number;
};

function evidenceId(subjectKey: string, propertyPath: string): string {
  return `E-${IDENTIFIED_OPENING_PARENT_PASS_ID}-${subjectKey}-${propertyPath}`
    .replace(/[^A-Za-z0-9._:-]/g, "-")
    .slice(0, 128);
}

function groupIdentifiedOpenings(
  evidence: readonly Evidence[],
): Map<string, Evidence[]> {
  const groups = new Map<string, Evidence[]>();
  for (const record of evidence) {
    if (record.subjectKind !== "opening") continue;
    if (record.subjectKey.startsWith("opening:p")) continue;
    const list = groups.get(record.subjectKey) ?? [];
    list.push(record);
    groups.set(record.subjectKey, list);
  }
  return groups;
}

function recordMatchesMark(record: Evidence, markText: string): boolean {
  const fields = [
    record.originalText ?? "",
    record.subjectKey,
    record.source.elementLabel ?? "",
  ];
  return fields.some((field) => openingMarkKeysCompatible(markText, field));
}

function identifiedSubjectAlreadyHasHost(records: readonly Evidence[]): boolean {
  return records.some(
    (record) =>
      (record.propertyPath === "parentPhysicalRunKey" ||
        record.propertyPath === "parentWallTag") &&
      typeof record.candidateValue === "string" &&
      record.candidateValue.length > 0,
  );
}

function isUniqueIdentifiedParentCandidate(
  candidate: GovernedOpeningCandidate,
): boolean {
  return (
    candidate.physicalRunOwnership.status === "ESTABLISHED" &&
    candidate.physicalRunOwnership.parentPhysicalRunKey != null &&
    candidate.markOwnership.status === "ESTABLISHED" &&
    candidate.markOwnership.markText != null
  );
}

function makeIdentifiedParentEvidence(input: {
  identified: Evidence;
  propertyPath: string;
  candidateValue: string | number;
  description: string;
  originalText: string;
}): Evidence {
  return evidenceSchema.parse({
    id: evidenceId(input.identified.subjectKey, input.propertyPath),
    type: "geometry",
    relationship: "supports",
    description: input.description,
    source: input.identified.source,
    originalText: input.originalText,
    references: [],
    subjectKind: "opening",
    subjectKey: input.identified.subjectKey,
    propertyPath: input.propertyPath,
    candidateValue: input.candidateValue,
    extractionPassId: IDENTIFIED_OPENING_PARENT_PASS_ID,
    bundleId: "opening-geometry",
  });
}

/**
 * Attach parentPhysicalRunKey (and ESTABLISHED geometry width, when present)
 * onto Claude-identified opening subjects.
 *
 * Parents come only from governed gap ownership that is ESTABLISHED on both
 * the physical run and a unique mark, uniquely matching one identified
 * subject. Ambiguous gaps, unmatched marks, and many-to-one matches fail
 * closed. Does not invent quantity and does not copy nominal→rough.
 */
export function mergeIdentifiedOpeningParentsFromCompiledPages(input: {
  evidence: readonly Evidence[];
  pages: readonly CompiledDrawingPage[];
}): {
  evidence: Evidence[];
  attachments: IdentifiedOpeningParentAttachment[];
  audit: IdentifiedOpeningGeometryMergeAudit;
} {
  const candidates = discoverGovernedOpeningCandidates(input.pages);
  const identified = groupIdentifiedOpenings(input.evidence);
  const uniqueCandidates = candidates.filter(isUniqueIdentifiedParentCandidate);

  const pairs: Array<{
    candidate: GovernedOpeningCandidate;
    identifiedSubjectKey: string;
  }> = [];

  for (const candidate of uniqueCandidates) {
    const markText = candidate.markOwnership.markText!;
    const matches: string[] = [];
    for (const [subjectKey, records] of identified) {
      if (identifiedSubjectAlreadyHasHost(records)) continue;
      if (records.some((record) => recordMatchesMark(record, markText))) {
        matches.push(subjectKey);
      }
    }
    if (matches.length !== 1) continue;
    pairs.push({ candidate, identifiedSubjectKey: matches[0]! });
  }

  const identifiedHitCounts = new Map<string, number>();
  for (const pair of pairs) {
    identifiedHitCounts.set(
      pair.identifiedSubjectKey,
      (identifiedHitCounts.get(pair.identifiedSubjectKey) ?? 0) + 1,
    );
  }

  const attachments: IdentifiedOpeningParentAttachment[] = [];
  const added: Evidence[] = [];

  for (const pair of pairs) {
    if ((identifiedHitCounts.get(pair.identifiedSubjectKey) ?? 0) !== 1) {
      continue;
    }

    const records = identified.get(pair.identifiedSubjectKey);
    const host = records?.[0];
    const parentPhysicalRunKey =
      pair.candidate.physicalRunOwnership.parentPhysicalRunKey;
    if (!host || parentPhysicalRunKey == null) continue;

    const notes = [
      ...pair.candidate.physicalRunOwnership.notes,
      ...pair.candidate.markOwnership.notes,
      ...pair.candidate.dimensionOwnership.notes,
    ].join(" ");

    added.push(
      makeIdentifiedParentEvidence({
        identified: host,
        propertyPath: "parentPhysicalRunKey",
        candidateValue: parentPhysicalRunKey,
        description:
          "Parent physical run from ESTABLISHED PBG gap ownership uniquely bound to identified opening mark",
        originalText: notes,
      }),
    );

    const roughWidthFeet =
      pair.candidate.dimensionOwnership.status === "ESTABLISHED"
        ? pair.candidate.dimensionOwnership.roughWidthFeet
        : null;
    if (roughWidthFeet != null) {
      added.push(
        makeIdentifiedParentEvidence({
          identified: host,
          propertyPath: "dimensions.roughWidthFeet",
          candidateValue: roughWidthFeet,
          description: `ESTABLISHED opening width from geometry: ${pair.candidate.dimensionOwnership.originalText ?? notes}`,
          originalText:
            pair.candidate.dimensionOwnership.originalText ?? notes,
        }),
      );
    }

    attachments.push({
      identifiedSubjectKey: pair.identifiedSubjectKey,
      geometrySubjectKey: pair.candidate.openingSubjectKey,
      parentPhysicalRunKey,
      roughWidthFeet,
    });
  }

  return {
    evidence: [...input.evidence, ...added],
    attachments,
    audit: {
      gapCandidateCount: candidates.length,
      establishedParentAndMarkCount: uniqueCandidates.length,
      ambiguousOrUnresolvedSkipped:
        candidates.length - uniqueCandidates.length,
      uniqueAttachments: attachments.length,
    },
  };
}
