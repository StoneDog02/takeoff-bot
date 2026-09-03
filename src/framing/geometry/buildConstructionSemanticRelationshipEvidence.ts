import type { Evidence } from "../../core/schemas/evidence.schema.js";
import type { EvidenceId } from "../../core/schemas/identity.schema.js";
import { evidenceSchema } from "../../core/schemas/evidence.schema.js";
import type { ClassifiedPlanPage } from "../../pdf/pageClassification.js";
import {
  CONSTRUCTION_SEMANTIC_RELATIONSHIP_BUNDLE_ID,
  CONSTRUCTION_SEMANTIC_RELATIONSHIP_PASS_ID,
  type ConstructionSemanticAuditEntry,
} from "./constructionSemanticTypes.js";
import {
  type ClusterCandidate,
  scoreSystemClusterBinding,
} from "./canonicalSubjectSelection.js";
import { evaluateAllConstructionSemanticFloorProofs } from "./constructionSemanticFloorProof.js";
import { convergeEvidenceByCanonicalObjectId } from "../resolve/convergeEvidenceByCanonicalObjectId.js";
import {
  createFloorFramingAreaObjectId,
  createFloorFramingSystemObjectId,
} from "../resolve/ids.js";
import { buildPlanRelationshipSignalIndex } from "./planRelationshipSignalIndex.js";

export type ConstructionSemanticRunAudit = {
  semanticAuthorityCandidates: number;
  semanticAuthorityAccepted: number;
  semanticAuthorityRejected: Record<string, number>;
  ambiguousAuthorityCount: number;
  conflictCandidatesPreserved: string[];
  entries: ConstructionSemanticAuditEntry[];
};

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueSortedIds(ids: readonly string[]): EvidenceId[] {
  return [...new Set(ids)].sort(compareIds) as EvidenceId[];
}

function csEvidenceId(areaCanonicalKey: string): string {
  return `E-cs-floor-${areaCanonicalKey}`
    .replace(/[^A-Za-z0-9._:-]/g, "-")
    .slice(0, 128);
}

function groupClustersBySubjectKey(
  evidence: readonly Evidence[],
  subjectKind: Evidence["subjectKind"],
): ClusterCandidate[] {
  const groups = new Map<string, Evidence[]>();
  for (const record of evidence) {
    if (record.subjectKind !== subjectKind) {
      continue;
    }
    const key = record.subjectKey.trim();
    if (!key) {
      continue;
    }
    const existing = groups.get(key) ?? [];
    existing.push(record);
    groups.set(key, existing);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => compareIds(left, right))
    .map(([subjectKey, records]) => ({ subjectKey, records }));
}

function canonicalKeyForCluster(
  cluster: ClusterCandidate,
  subjectKind: Evidence["subjectKind"],
): string {
  const createObjectId =
    subjectKind === "floor-framing-area"
      ? createFloorFramingAreaObjectId
      : createFloorFramingSystemObjectId;
  const groups = new Map<string, readonly Evidence[]>([[cluster.subjectKey, cluster.records]]);
  const converged = convergeEvidenceByCanonicalObjectId({
    groups,
    createObjectId,
  });
  return converged[0]?.canonicalSubjectKey ?? cluster.subjectKey;
}

function hasExistingParentSystemTag(
  evidence: readonly Evidence[],
  areaSubjectKey: string,
): boolean {
  return evidence.some(
    (record) =>
      record.subjectKey === areaSubjectKey &&
      record.propertyPath === "parentSystemTag" &&
      typeof record.candidateValue === "string" &&
      record.candidateValue.trim().length > 0,
  );
}

function primaryOriginalText(
  authorizingIds: readonly EvidenceId[],
  evidence: readonly Evidence[],
): string {
  for (const id of authorizingIds) {
    const record = evidence.find((entry) => entry.id === id);
    if (record?.originalText?.trim()) {
      return record.originalText.trim();
    }
  }
  return "";
}

function pageNumberForCluster(cluster: ClusterCandidate): number {
  for (const record of cluster.records) {
    const pageNumber = record.source?.page?.pageNumber;
    if (pageNumber != null) {
      return pageNumber;
    }
  }
  return 1;
}

function emitConstructionSemanticEvidence(input: {
  areaCanonicalKey: string;
  systemCanonicalKey: string;
  authorizingEvidenceIds: readonly EvidenceId[];
  evidence: readonly Evidence[];
  pageNumber: number;
}): Evidence {
  return evidenceSchema.parse({
    id: csEvidenceId(input.areaCanonicalKey),
    type: "tag",
    relationship: "supports",
    description: `Authority[CONSTRUCTION_SEMANTIC:CS-FLOOR]; evidenceIds=${input.authorizingEvidenceIds.join(",")}`,
    source: {
      page: {
        documentId: null,
        pageNumber: input.pageNumber,
        sheetId: null,
        sheetTitle: null,
        pageLabel: null,
        revision: null,
      },
      region: null,
      tileId: null,
      elementLabel: input.areaCanonicalKey,
      detailNumber: null,
      sectionNumber: null,
      scheduleName: null,
      noteReference: null,
    },
    originalText: primaryOriginalText(input.authorizingEvidenceIds, input.evidence),
    references: [],
    subjectKind: "floor-framing-area",
    subjectKey: input.areaCanonicalKey,
    propertyPath: "parentSystemTag",
    candidateValue: input.systemCanonicalKey,
    extractionPassId: CONSTRUCTION_SEMANTIC_RELATIONSHIP_PASS_ID,
    bundleId: CONSTRUCTION_SEMANTIC_RELATIONSHIP_BUNDLE_ID,
  });
}

function buildRunAudit(
  auditEntries: readonly ConstructionSemanticAuditEntry[],
  index: ReturnType<typeof buildPlanRelationshipSignalIndex>,
  systemClusters: readonly ClusterCandidate[],
): ConstructionSemanticRunAudit {
  const semanticAuthorityRejected: Record<string, number> = {};
  let semanticAuthorityAccepted = 0;
  let ambiguousAuthorityCount = 0;
  const conflictCandidatesPreserved = new Set<string>();

  for (const entry of auditEntries) {
    if (entry.status === "accepted") {
      semanticAuthorityAccepted += 1;
      continue;
    }
    if (entry.reason) {
      semanticAuthorityRejected[entry.reason] =
        (semanticAuthorityRejected[entry.reason] ?? 0) + 1;
      if (entry.reason === "AMBIGUOUS_AUTHORITY") {
        ambiguousAuthorityCount += 1;
      }
    }
    for (const candidate of entry.conflictCandidates) {
      conflictCandidatesPreserved.add(candidate);
    }
  }

  const candidatePages = new Set(
    index.regionIdentities.map((region) => region.pageNumber),
  );
  let semanticAuthorityCandidates = 0;
  for (const pageNumber of candidatePages) {
    const regions = index.regionIdentities.filter(
      (region) => region.pageNumber === pageNumber,
    );
    if (regions.length === 0) {
      continue;
    }
    const pageSystems = systemClusters.filter((cluster) =>
      cluster.records.some(
        (record) => record.source?.page?.pageNumber === pageNumber,
      ),
    );
    for (const region of regions) {
      const scored = pageSystems.filter(
        (cluster) =>
          scoreSystemClusterBinding({ index, region, cluster }).score > 0,
      );
      if (scored.length > 0) {
        semanticAuthorityCandidates += 1;
      }
    }
  }

  return {
    semanticAuthorityCandidates,
    semanticAuthorityAccepted,
    semanticAuthorityRejected,
    ambiguousAuthorityCount,
    conflictCandidatesPreserved: [...conflictCandidatesPreserved].sort(compareIds),
    entries: [...auditEntries],
  };
}

export function buildConstructionSemanticRelationshipEvidence(input: {
  evidence: readonly Evidence[];
  classifiedPages: readonly ClassifiedPlanPage[];
}): {
  evidence: Evidence[];
  audit: ConstructionSemanticRunAudit;
} {
  const index = buildPlanRelationshipSignalIndex({
    evidence: input.evidence,
    classifiedPages: input.classifiedPages,
  });

  const areaClusters = groupClustersBySubjectKey(
    input.evidence,
    "floor-framing-area",
  );
  const systemClusters = groupClustersBySubjectKey(
    input.evidence,
    "floor-framing-system",
  );

  const { auditEntries } = evaluateAllConstructionSemanticFloorProofs({
    index,
    evidence: input.evidence,
    areaClusters,
    systemClusters,
  });

  const audit = buildRunAudit(auditEntries, index, systemClusters);
  const emitted: Evidence[] = [];
  const emittedAreaKeys = new Set<string>();

  for (const entry of auditEntries) {
    if (entry.status !== "accepted") {
      continue;
    }
    if (!entry.areaSubjectKey || !entry.systemSubjectKey) {
      continue;
    }

    const areaCluster = areaClusters.find(
      (cluster) => cluster.subjectKey === entry.areaSubjectKey,
    );
    const systemCluster = systemClusters.find(
      (cluster) => cluster.subjectKey === entry.systemSubjectKey,
    );
    if (!areaCluster || !systemCluster) {
      continue;
    }

    const areaCanonicalKey = canonicalKeyForCluster(
      areaCluster,
      "floor-framing-area",
    );
    const systemCanonicalKey = canonicalKeyForCluster(
      systemCluster,
      "floor-framing-system",
    );

    if (emittedAreaKeys.has(areaCanonicalKey)) {
      continue;
    }
    if (
      hasExistingParentSystemTag(
        [...input.evidence, ...emitted],
        areaCanonicalKey,
      )
    ) {
      continue;
    }

    emitted.push(
      emitConstructionSemanticEvidence({
        areaCanonicalKey,
        systemCanonicalKey,
        authorizingEvidenceIds: entry.authorizingEvidenceIds,
        evidence: input.evidence,
        pageNumber: entry.pageNumber,
      }),
    );
    emittedAreaKeys.add(areaCanonicalKey);
  }

  return { evidence: emitted, audit };
}
