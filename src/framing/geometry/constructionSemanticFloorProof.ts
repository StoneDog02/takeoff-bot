import type { Evidence } from "../../core/schemas/evidence.schema.js";
import type { EvidenceId } from "../../core/schemas/identity.schema.js";
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
import { isSlabOrNonWoodFloorArea, isWoodJoistFloorSystemCompatibleWithArea } from "../resolve/floorAreaMaterialCompatibility.js";

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
      record.propertyPath === "parentSystemTag" &&
      typeof record.candidateValue === "string" &&
      record.candidateValue.trim().length > 0,
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

function resolveUniqueSystemForRegion(input: {
  index: PlanRelationshipSignalIndex;
  region: RegionIdentity;
  systemClusters: readonly ClusterCandidate[];
  areaAuthorizingEvidenceIds: readonly EvidenceId[];
}):
  | {
      status: "unique";
      systemSubjectKey: string;
      systemCluster: ClusterCandidate;
      score: number;
      authorizingEvidenceIds: EvidenceId[];
    }
  | {
      status: "rejected";
      result: ConstructionSemanticProofResult;
    } {
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
      result: {
        status: "rejected",
        reason: "MISSING-SA",
        authorizingEvidenceIds: [...input.areaAuthorizingEvidenceIds],
      },
    };
  }

  const fingerprintGroups = new Map<
    string,
    {
      fingerprintKey: string;
      clusters: ClusterCandidate[];
      totalScore: number;
      scores: ScopeBindingScore[];
    }
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
      result: {
        status: "rejected",
        reason: "MISSING-APC",
        authorizingEvidenceIds: [...input.areaAuthorizingEvidenceIds],
      },
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
      result: {
        status: "rejected",
        reason: assemblySelection.reason,
        conflictCandidates: assemblySelection.candidates,
        authorizingEvidenceIds: uniqueSortedIds([
          ...input.areaAuthorizingEvidenceIds,
          ...assemblySelection.authorizingEvidenceIds,
        ]),
      },
    };
  }

  const winningAssembly = fingerprintGroups.get(assemblySelection.value)!;
  const systemSelection = selectUniqueByScore<string>(
    winningAssembly.scores,
    "CS-CONFLICT-SYSTEM",
  );

  let systemSubjectKey: string;
  let systemScore: number;
  let systemAuthorizingEvidenceIds: EvidenceId[];

  if (systemSelection.status === "unique") {
    systemSubjectKey = systemSelection.value;
    systemScore = systemSelection.score;
    systemAuthorizingEvidenceIds = systemSelection.authorizingEvidenceIds;
  } else {
    // Same assembly fingerprint with tied scope scores = fragment duplicates,
    // not competing assemblies. Prefer denser APC, then system-named subjects.
    const tied = systemSelection.candidates;
    if (tied.length === 0) {
      return {
        status: "rejected",
        result: {
          status: "rejected",
          reason: systemSelection.reason,
          conflictCandidates: systemSelection.candidates,
          authorizingEvidenceIds: uniqueSortedIds([
            ...input.areaAuthorizingEvidenceIds,
            ...systemSelection.authorizingEvidenceIds,
          ]),
        },
      };
    }

    const ranked = [...tied].sort((left, right) => {
      const leftCluster = input.systemClusters.find((c) => c.subjectKey === left);
      const rightCluster = input.systemClusters.find((c) => c.subjectKey === right);
      const leftApc = countApcProperties(leftCluster?.records ?? []);
      const rightApc = countApcProperties(rightCluster?.records ?? []);
      if (leftApc !== rightApc) {
        return rightApc - leftApc;
      }
      const leftRank = systemSubjectPreferenceRank(left);
      const rightRank = systemSubjectPreferenceRank(right);
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }
      return compareIds(left, right);
    });
    systemSubjectKey = ranked[0]!;
    const winningScore = winningAssembly.scores.find(
      (entry) => entry.subjectKey === systemSubjectKey,
    );
    systemScore = winningScore?.score ?? 0;
    systemAuthorizingEvidenceIds = uniqueSortedIds(
      winningAssembly.scores
        .filter((entry) => tied.includes(entry.subjectKey))
        .flatMap((entry) => entry.authorizingEvidenceIds),
    );
  }

  const systemCluster = input.systemClusters.find(
    (cluster) => cluster.subjectKey === systemSubjectKey,
  );
  if (!systemCluster) {
    return {
      status: "rejected",
      result: {
        status: "rejected",
        reason: "MISSING-SA",
        authorizingEvidenceIds: uniqueSortedIds([
          ...input.areaAuthorizingEvidenceIds,
          ...systemAuthorizingEvidenceIds,
        ]),
      },
    };
  }

  return {
    status: "unique",
    systemSubjectKey,
    systemCluster,
    score: systemScore,
    authorizingEvidenceIds: systemAuthorizingEvidenceIds,
  };
}

function countApcProperties(records: readonly Evidence[]): number {
  const paths = new Set(
    records
      .map((record) => record.propertyPath)
      .filter(
        (path) =>
          path === "assembly.joistType" ||
          path === "assembly.joistSize" ||
          path === "assembly.joistSpacingInches",
      ),
  );
  return paths.size;
}

function systemSubjectPreferenceRank(subjectKey: string): number {
  if (/FLOOR\s+SYSTEM/i.test(subjectKey)) {
    return 0;
  }
  if (/FLOOR\s+FRAMING/i.test(subjectKey)) {
    return 1;
  }
  return 2;
}

/**
 * When multiple floor areas match one region (e.g. crawl bays), do not reject
 * with CS-CONFLICT-AREA. Resolve a unique system/assembly for the region, then
 * emit an accepted parent link for every eligible matching area.
 */
export function evaluateConstructionSemanticFloorProof(input: {
  index: PlanRelationshipSignalIndex;
  evidence: readonly Evidence[];
  areaClusters: readonly ClusterCandidate[];
  systemClusters: readonly ClusterCandidate[];
  region: RegionIdentity;
}): ConstructionSemanticProofResult[] {
  const scopeCheck = evaluateScopeApplicability({
    index: input.index,
    region: input.region,
    systemClusters: input.systemClusters,
  });
  if (!scopeCheck.passes) {
    return [
      {
        status: "rejected",
        reason: scopeCheck.reason ?? "MISSING-SA",
        authorizingEvidenceIds: [...input.region.evidenceIds],
      },
    ];
  }

  const matchingAreas = areaClustersMatchingRegion(input.areaClusters, input.region);
  if (matchingAreas.length === 0) {
    return [
      {
        status: "rejected",
        reason: "CS-CONFLICT-AREA",
        authorizingEvidenceIds: [...input.region.evidenceIds],
      },
    ];
  }

  const areaScores = matchingAreas.map((cluster) =>
    scoreAreaClusterBinding({ region: input.region, cluster }),
  );
  const areaAuthorizingEvidenceIds = uniqueSortedIds(
    areaScores.flatMap((entry) => entry.authorizingEvidenceIds),
  );

  const systemResolution = resolveUniqueSystemForRegion({
    index: input.index,
    region: input.region,
    systemClusters: input.systemClusters,
    areaAuthorizingEvidenceIds,
  });
  if (systemResolution.status === "rejected") {
    return [systemResolution.result];
  }

  const accepted: ConstructionSemanticProofResult[] = [];
  let sawAlreadyLinked = false;
  let sawIncompatible = false;

  for (const areaCluster of matchingAreas) {
    const areaScore = areaScores.find(
      (entry) => entry.subjectKey === areaCluster.subjectKey,
    );
    if (!areaScore || areaScore.score <= 0) {
      continue;
    }

    if (isSlabOrNonWoodFloorArea(areaCluster.records)) {
      sawIncompatible = true;
      continue;
    }
    if (existingParentSystemTags(input.evidence, areaCluster.subjectKey)) {
      sawAlreadyLinked = true;
      continue;
    }
    if (
      !isWoodJoistFloorSystemCompatibleWithArea({
        systemRecords: systemResolution.systemCluster.records,
        areaRecords: areaCluster.records,
      })
    ) {
      sawIncompatible = true;
      continue;
    }

    accepted.push({
      status: "accepted",
      areaSubjectKey: areaCluster.subjectKey,
      systemSubjectKey: systemResolution.systemSubjectKey,
      authorizingEvidenceIds: uniqueSortedIds([
        ...areaScore.authorizingEvidenceIds,
        ...systemResolution.authorizingEvidenceIds,
      ]),
      supportScore: areaScore.score + systemResolution.score,
    });
  }

  if (accepted.length > 0) {
    return accepted.sort((left, right) => {
      if (left.status !== "accepted" || right.status !== "accepted") {
        return 0;
      }
      return compareIds(left.areaSubjectKey, right.areaSubjectKey);
    });
  }

  if (sawAlreadyLinked) {
    return [
      {
        status: "rejected",
        reason: "ALREADY-LINKED",
        authorizingEvidenceIds: areaAuthorizingEvidenceIds,
      },
    ];
  }

  if (sawIncompatible) {
    return [
      {
        status: "rejected",
        reason: "CS-INCOMPATIBLE-AREA-MATERIAL",
        authorizingEvidenceIds: uniqueSortedIds([
          ...areaAuthorizingEvidenceIds,
          ...systemResolution.authorizingEvidenceIds,
        ]),
      },
    ];
  }

  return [
    {
      status: "rejected",
      reason: "CS-CONFLICT-AREA",
      authorizingEvidenceIds: areaAuthorizingEvidenceIds,
    },
  ];
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
      const regionResults = evaluateConstructionSemanticFloorProof({
        index: input.index,
        evidence: input.evidence,
        areaClusters: pageAreas,
        systemClusters: pageSystems,
        region,
      });
      results.push(...regionResults);

      for (const result of regionResults) {
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
  }

  return { results, auditEntries };
}
