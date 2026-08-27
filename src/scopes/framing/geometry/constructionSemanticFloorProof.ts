import type { Evidence } from "../../../core/schemas/evidence.schema.js";
import type { EvidenceId } from "../../../core/schemas/identity.schema.js";
import {
  type ConstructionSemanticAuditEntry,
  type ConstructionSemanticProofResult,
  type ConstructionSemanticRejectionReason,
  type RegionIdentity,
} from "./constructionSemanticTypes.js";
import {
  assemblyFingerprintKey,
  fingerprintFromSystemRecords,
} from "./assemblyFingerprint.js";
import {
  type ClusterCandidate,
  areaClustersMatchingRegion,
  scoreAreaClusterBinding,
  scoreSystemClusterBinding,
  selectUniqueByScore,
  type ScopeBindingScore,
} from "./canonicalSubjectSelection.js";
import {
  extractRegionTokens,
  type PlanRelationshipSignalIndex,
  regionIdentitiesForPage,
  sheetRoleForPage,
  signalsForPageAndGroup,
} from "./planRelationshipSignalIndex.js";
import { isSlabOrNonWoodFloorArea, isWoodJoistFloorSystemCompatibleWithArea } from "../resolvers/floorAreaMaterialCompatibility.js";

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueSortedIds(ids: readonly string[]): EvidenceId[] {
  return [...new Set(ids)].sort(compareIds) as EvidenceId[];
}

function existingParentSystemTags(
  evidence: readonly Evidence[],
  areaSubjectKey: string,
): boolean {
  return evidence.some(
    (record) =>
      record.subjectKey === areaSubjectKey &&
      record.propertyPath === "parentSystemTag",
  );
}

function sheetTitleSupportsRegion(titleOrLabel: string, region: RegionIdentity): boolean {
  const titleTokens = extractRegionTokens(titleOrLabel);
  return region.tokens.some((token) => titleTokens.includes(token));
}

function evaluateScopeApplicability(input: {
  index: PlanRelationshipSignalIndex;
  region: RegionIdentity;
  systemClusters: readonly ClusterCandidate[];
}): { passes: boolean; reason?: ConstructionSemanticRejectionReason } {
  const sheetRole = sheetRoleForPage(input.index, input.region.pageNumber);
  if (!sheetRole) {
    return { passes: false, reason: "MISSING-SR" };
  }

  const rlSignals = signalsForPageAndGroup(input.index, input.region.pageNumber, "RL");
  if (rlSignals.length === 0) {
    return { passes: false, reason: "MISSING-RL" };
  }

  const apcSignals = signalsForPageAndGroup(input.index, input.region.pageNumber, "APC");
  if (apcSignals.length === 0) {
    return { passes: false, reason: "MISSING-APC" };
  }

  const hasScopeBinding = input.systemClusters.some((cluster) => {
    const score = scoreSystemClusterBinding({
      index: input.index,
      region: input.region,
      cluster,
    });
    return score.score > 0;
  });

  const titleSupports = sheetTitleSupportsRegion(
    sheetRole.titleOrLabel,
    input.region,
  );

  if (!hasScopeBinding && !titleSupports) {
    return { passes: false, reason: "MISSING-SA" };
  }

  if (!hasScopeBinding) {
    return { passes: false, reason: "MISSING-SA" };
  }

  return { passes: true };
}

export function evaluateConstructionSemanticFloorProof(input: {
  index: PlanRelationshipSignalIndex;
  evidence: readonly Evidence[];
  areaClusters: readonly ClusterCandidate[];
  systemClusters: readonly ClusterCandidate[];
  region: RegionIdentity;
}): ConstructionSemanticProofResult {
  const scopeCheck = evaluateScopeApplicability({
    index: input.index,
    region: input.region,
    systemClusters: input.systemClusters,
  });
  if (!scopeCheck.passes) {
    return {
      status: "rejected",
      reason: scopeCheck.reason ?? "MISSING-SA",
      authorizingEvidenceIds: [...input.region.evidenceIds],
    };
  }

  const matchingAreas = areaClustersMatchingRegion(input.areaClusters, input.region);
  if (matchingAreas.length === 0) {
    return {
      status: "rejected",
      reason: "CS-CONFLICT-AREA",
      authorizingEvidenceIds: [...input.region.evidenceIds],
    };
  }

  const areaScores = matchingAreas.map((cluster) =>
    scoreAreaClusterBinding({ region: input.region, cluster }),
  );
  const areaSelection = selectUniqueByScore<string>(
    areaScores,
    "CS-CONFLICT-AREA",
  );

  if (areaSelection.status === "conflict") {
    return {
      status: "rejected",
      reason: areaSelection.reason,
      conflictCandidates: areaSelection.candidates,
      authorizingEvidenceIds: areaSelection.authorizingEvidenceIds,
    };
  }

  const areaCluster = matchingAreas.find(
    (cluster) => cluster.subjectKey === areaSelection.value,
  )!;
  if (isSlabOrNonWoodFloorArea(areaCluster.records)) {
    return {
      status: "rejected",
      reason: "CS-INCOMPATIBLE-AREA-MATERIAL",
      authorizingEvidenceIds: areaSelection.authorizingEvidenceIds,
    };
  }
  if (existingParentSystemTags(input.evidence, areaCluster.subjectKey)) {
    return { status: "rejected", reason: "ALREADY-LINKED" };
  }

  const boundSystemScores = input.systemClusters
    .map((cluster) =>
      scoreSystemClusterBinding({
        index: input.index,
        region: input.region,
        cluster,
      }),
    )
    .filter((entry) => entry.score > 0);

  if (boundSystemScores.length === 0) {
    return {
      status: "rejected",
      reason: "MISSING-SA",
      authorizingEvidenceIds: areaSelection.authorizingEvidenceIds,
    };
  }

  const fingerprintGroups = new Map<
    string,
    { fingerprintKey: string; clusters: ClusterCandidate[]; totalScore: number; scores: ScopeBindingScore[] }
  >();

  for (const entry of boundSystemScores) {
    const cluster = input.systemClusters.find(
      (candidate) => candidate.subjectKey === entry.subjectKey,
    );
    if (!cluster) {
      continue;
    }
    const fingerprint = fingerprintFromSystemRecords(cluster.records);
    if (!fingerprint) {
      continue;
    }
    const fingerprintKey = assemblyFingerprintKey(fingerprint);
    const existing = fingerprintGroups.get(fingerprintKey);
    if (existing) {
      existing.clusters.push(cluster);
      existing.totalScore += entry.score;
      existing.scores.push(entry);
    } else {
      fingerprintGroups.set(fingerprintKey, {
        fingerprintKey,
        clusters: [cluster],
        totalScore: entry.score,
        scores: [entry],
      });
    }
  }

  if (fingerprintGroups.size === 0) {
    return {
      status: "rejected",
      reason: "MISSING-APC",
      authorizingEvidenceIds: areaSelection.authorizingEvidenceIds,
    };
  }

  const assemblyScores = [...fingerprintGroups.values()].map((group) => ({
    subjectKey: group.fingerprintKey,
    score: group.totalScore,
    authorizingEvidenceIds: uniqueSortedIds(
      group.scores.flatMap((entry) => entry.authorizingEvidenceIds),
    ),
  }));

  const assemblySelection = selectUniqueByScore<string>(
    assemblyScores,
    "CS-CONFLICT-ASSEMBLY",
  );

  if (assemblySelection.status === "conflict") {
    return {
      status: "rejected",
      reason: assemblySelection.reason,
      conflictCandidates: assemblySelection.candidates,
      authorizingEvidenceIds: uniqueSortedIds([
        ...areaSelection.authorizingEvidenceIds,
        ...assemblySelection.authorizingEvidenceIds,
      ]),
    };
  }

  const winningAssembly = fingerprintGroups.get(assemblySelection.value)!;
  const systemSelection = selectUniqueByScore<string>(
    winningAssembly.scores,
    "CS-CONFLICT-SYSTEM",
  );

  if (systemSelection.status === "conflict") {
    return {
      status: "rejected",
      reason: systemSelection.reason,
      conflictCandidates: systemSelection.candidates,
      authorizingEvidenceIds: uniqueSortedIds([
        ...areaSelection.authorizingEvidenceIds,
        ...systemSelection.authorizingEvidenceIds,
      ]),
    };
  }

  const systemCluster = input.systemClusters.find(
    (cluster) => cluster.subjectKey === systemSelection.value,
  );
  if (
    systemCluster &&
    !isWoodJoistFloorSystemCompatibleWithArea({
      systemRecords: systemCluster.records,
      areaRecords: areaCluster.records,
    })
  ) {
    return {
      status: "rejected",
      reason: "CS-INCOMPATIBLE-AREA-MATERIAL",
      authorizingEvidenceIds: uniqueSortedIds([
        ...areaSelection.authorizingEvidenceIds,
        ...systemSelection.authorizingEvidenceIds,
      ]),
    };
  }

  const authorizingEvidenceIds = uniqueSortedIds([
    ...areaSelection.authorizingEvidenceIds,
    ...systemSelection.authorizingEvidenceIds,
  ]);

  return {
    status: "accepted",
    areaSubjectKey: areaSelection.value,
    systemSubjectKey: systemSelection.value,
    authorizingEvidenceIds,
    supportScore: areaSelection.score + systemSelection.score,
  };
}

export function evaluateAllConstructionSemanticFloorProofs(input: {
  index: PlanRelationshipSignalIndex;
  evidence: readonly Evidence[];
  areaClusters: readonly ClusterCandidate[];
  systemClusters: readonly ClusterCandidate[];
}): {
  results: ConstructionSemanticProofResult[];
  auditEntries: ConstructionSemanticAuditEntry[];
} {
  const results: ConstructionSemanticProofResult[] = [];
  const auditEntries: ConstructionSemanticAuditEntry[] = [];

  const pages = [...new Set(input.index.sheetRoles.map((signal) => signal.pageNumber))].sort(
    (left, right) => left - right,
  );

  for (const pageNumber of pages) {
    const regions = regionIdentitiesForPage(input.index, pageNumber);
    const pageSystems = input.systemClusters.filter((cluster) =>
      cluster.records.some(
        (record) => record.source?.page?.pageNumber === pageNumber,
      ),
    );
    const pageAreas = input.areaClusters.filter((cluster) =>
      cluster.records.some(
        (record) => record.source?.page?.pageNumber === pageNumber,
      ),
    );

    if (regions.length === 0) {
      continue;
    }

    for (const region of regions) {
      const result = evaluateConstructionSemanticFloorProof({
        index: input.index,
        evidence: input.evidence,
        areaClusters: pageAreas,
        systemClusters: pageSystems,
        region,
      });
      results.push(result);

      if (result.status === "accepted") {
        auditEntries.push({
          pageNumber,
          regionLabel: region.label,
          areaSubjectKey: result.areaSubjectKey,
          systemSubjectKey: result.systemSubjectKey,
          status: "accepted",
          reason: null,
          supportScore: result.supportScore,
          conflictCandidates: [],
          authorizingEvidenceIds: result.authorizingEvidenceIds,
        });
      } else {
        auditEntries.push({
          pageNumber,
          regionLabel: region.label,
          areaSubjectKey: null,
          systemSubjectKey: null,
          status: "rejected",
          reason: result.reason,
          supportScore: null,
          conflictCandidates: result.conflictCandidates ?? [],
          authorizingEvidenceIds: result.authorizingEvidenceIds ?? [],
        });
      }
    }
  }

  return { results, auditEntries };
}
