import type { Evidence } from "../../core/schemas/evidence.schema.js";
import {
  AREA_SYSTEM_RELATIONSHIP_BRIDGE_PASS_ID,
} from "../geometry/buildAreaSystemRelationshipEvidence.js";
import type { ConstructionSemanticRunAudit } from "../geometry/buildConstructionSemanticRelationshipEvidence.js";
import {
  CONSTRUCTION_SEMANTIC_RELATIONSHIP_PASS_ID,
} from "../geometry/constructionSemanticTypes.js";
import type { RelationshipEmissionAuditPayload } from "./relationshipEmissionAudit.schema.js";

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function parseAuthorizingEvidenceIds(description: string | null | undefined): string[] {
  const match = description?.match(/evidenceIds=([^;]+)/);
  if (!match?.[1]) {
    return [];
  }
  return match[1]
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .sort(compareIds);
}

function domainForAreaSubjectKind(
  subjectKind: Evidence["subjectKind"],
): "floor" | "sheathing" | "roof" | null {
  switch (subjectKind) {
    case "floor-framing-area":
      return "floor";
    case "sheathing-area":
      return "sheathing";
    case "roof-plane":
      return "roof";
    default:
      return null;
  }
}

export function buildRelationshipEmissionAudit(
  evidence: readonly Evidence[],
  constructionSemanticAudit?: ConstructionSemanticRunAudit,
): RelationshipEmissionAuditPayload {
  const parentRecords = evidence.filter(
    (record) => record.propertyPath === "parentSystemTag",
  );

  const parentSystemTagBySubjectKind: Record<string, number> = {};
  for (const record of parentRecords) {
    const kind = record.subjectKind ?? "unknown";
    parentSystemTagBySubjectKind[kind] = (parentSystemTagBySubjectKind[kind] ?? 0) + 1;
  }

  const bridgeRecords = parentRecords.filter(
    (record) => record.extractionPassId === AREA_SYSTEM_RELATIONSHIP_BRIDGE_PASS_ID,
  );
  const csRecords = parentRecords.filter(
    (record) =>
      record.extractionPassId === CONSTRUCTION_SEMANTIC_RELATIONSHIP_PASS_ID,
  );

  const bridgeByProofClass: Record<string, number> = {};
  const relationshipsByAuthorityClass: Record<string, number> = {};
  const entries: RelationshipEmissionAuditPayload["entries"] = [];
  const seenAreaKeys = new Set<string>();

  for (const record of parentRecords) {
    const domain = domainForAreaSubjectKind(record.subjectKind);
    if (!domain) {
      continue;
    }

    const areaSubjectKey = record.subjectKey;
    const dedupeKey = `${domain}:${areaSubjectKey}`;
    if (seenAreaKeys.has(dedupeKey)) {
      continue;
    }
    seenAreaKeys.add(dedupeKey);

    const isBridge = record.extractionPassId === AREA_SYSTEM_RELATIONSHIP_BRIDGE_PASS_ID;
    const isConstructionSemantic =
      record.extractionPassId === CONSTRUCTION_SEMANTIC_RELATIONSHIP_PASS_ID;
    const proofMatch = record.description?.match(/Bridge\[(P[1-4])\]/);
    const proofClass = isBridge
      ? (proofMatch?.[1] as "P1" | "P2" | "P3" | "P4" | undefined) ?? "none"
      : isConstructionSemantic
        ? "CONSTRUCTION_SEMANTIC"
        : "extraction";

    relationshipsByAuthorityClass[proofClass] =
      (relationshipsByAuthorityClass[proofClass] ?? 0) + 1;

    entries.push({
      areaSubjectKey,
      domain,
      proofClass: proofClass === "none" ? undefined : proofClass,
      systemTag:
        typeof record.candidateValue === "string"
          ? record.candidateValue
          : null,
      bridgeEvidenceId: isBridge ? record.id : null,
      authorizingEvidenceIds: parseAuthorizingEvidenceIds(record.description),
    });

    if (isBridge && proofMatch?.[1]) {
      bridgeByProofClass[proofMatch[1]] = (bridgeByProofClass[proofMatch[1]] ?? 0) + 1;
    }
  }

  entries.sort(
    (left, right) =>
      left.domain.localeCompare(right.domain) ||
      compareIds(left.areaSubjectKey, right.areaSubjectKey),
  );

  return {
    parentSystemTagCount: parentRecords.length,
    parentSystemTagBySubjectKind,
    bridgeEmissionCount: bridgeRecords.length,
    bridgeByProofClass,
    semanticAuthorityCandidates:
      constructionSemanticAudit?.semanticAuthorityCandidates,
    semanticAuthorityAccepted: constructionSemanticAudit?.semanticAuthorityAccepted,
    semanticAuthorityRejected: constructionSemanticAudit?.semanticAuthorityRejected,
    constructionSemanticEmissionCount: csRecords.length,
    relationshipsByAuthorityClass,
    ambiguousAuthorityCount: constructionSemanticAudit?.ambiguousAuthorityCount,
    conflictCandidatesPreserved: constructionSemanticAudit?.conflictCandidatesPreserved,
    constructionSemanticEntries: constructionSemanticAudit?.entries.map((entry) => ({
      ...entry,
      conflictCandidates: [...entry.conflictCandidates],
      authorizingEvidenceIds: [...entry.authorizingEvidenceIds],
    })),
    entries,
  };
}
