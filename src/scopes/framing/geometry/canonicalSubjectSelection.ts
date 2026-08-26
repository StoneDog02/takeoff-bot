import type { Evidence } from "../../../core/schemas/evidence.schema.js";
import type { EvidenceId } from "../../../core/schemas/identity.schema.js";
import type {
  AssemblyFingerprint,
  ConstructionSemanticRejectionReason,
  RegionIdentity,
} from "./constructionSemanticTypes.js";
import {
  fingerprintFromSystemRecords,
  isApcPropertyPath,
} from "./assemblyFingerprint.js";
import {
  extractRegionTokens,
  type PlanRelationshipSignalIndex,
  signalsForPageAndGroup,
} from "./planRelationshipSignalIndex.js";

export type ClusterCandidate = {
  subjectKey: string;
  records: readonly Evidence[];
};

export type ScopeBindingScore = {
  subjectKey: string;
  score: number;
  authorizingEvidenceIds: EvidenceId[];
};

export type UniqueSelectionResult<T extends string> =
  | { status: "unique"; value: T; score: number; authorizingEvidenceIds: EvidenceId[] }
  | {
      status: "conflict";
      reason: ConstructionSemanticRejectionReason;
      candidates: readonly T[];
      scores: ReadonlyMap<T, number>;
      authorizingEvidenceIds: EvidenceId[];
    };

const SCORE_APC_RECORD = 10;
const SCORE_RL_CO_TILE_BINDING = 12;
const SCORE_REGION_TOKEN_ALIGNMENT = 3;
const SCORE_RL_ELEMENT_LABEL = 15;
const SCORE_RL_REGION_BBOX = 10;
const SCORE_SL_CORROBORATION = 5;
const SCORE_EXPLICIT_FLOOR_AREA_NAMING = 8;
const SCORE_REGION_NAMED_FLOOR_SYSTEM = 8;

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueSortedIds(ids: readonly string[]): EvidenceId[] {
  return [...new Set(ids)].sort(compareIds) as EvidenceId[];
}

function subjectContainsRegionTokens(subjectKey: string, tokens: readonly string[]): number {
  const upper = subjectKey.toUpperCase();
  let count = 0;
  for (const token of tokens) {
    if (upper.includes(token)) {
      count += 1;
    }
  }
  return count;
}

function rlTileIdsForRegion(
  index: PlanRelationshipSignalIndex,
  region: RegionIdentity,
): Set<string> {
  const tiles = new Set<string>();
  for (const signal of signalsForPageAndGroup(index, region.pageNumber, "RL")) {
    if (
      signal.subjectKey != null &&
      extractRegionTokens(signal.subjectKey).some((token) =>
        region.tokens.includes(token),
      )
    ) {
      if (signal.tileId) {
        tiles.add(signal.tileId);
      }
    }
    if (signal.tileId && signal.evidenceIds.some((id) => region.evidenceIds.includes(id))) {
      tiles.add(signal.tileId);
    }
  }
  return tiles;
}

function apcRecordsForSystem(records: readonly Evidence[]): Evidence[] {
  const coreApc = records.filter(
    (record) =>
      record.propertyPath === "assembly.joistSize" ||
      record.propertyPath === "assembly.joistSpacingInches",
  );
  if (coreApc.length > 0) {
    return coreApc;
  }
  return records.filter((record) => isApcPropertyPath(record.propertyPath));
}

export function scoreSystemClusterBinding(input: {
  index: PlanRelationshipSignalIndex;
  region: RegionIdentity;
  cluster: ClusterCandidate;
}): ScopeBindingScore {
  const authorizingIds: string[] = [...input.region.evidenceIds];
  let score = 0;

  const apcRecords = apcRecordsForSystem(input.cluster.records);
  score += apcRecords.length * SCORE_APC_RECORD;
  authorizingIds.push(...apcRecords.map((record) => record.id));

  const tokenAlignment = subjectContainsRegionTokens(
    input.cluster.subjectKey,
    input.region.tokens,
  );
  score += tokenAlignment * SCORE_REGION_TOKEN_ALIGNMENT;

  const regionNamedSystem = input.region.tokens.some((token) =>
    new RegExp(`FLOOR\\s+SYSTEM\\s+${token}\\b`, "i").test(input.cluster.subjectKey),
  );
  if (regionNamedSystem) {
    score += SCORE_REGION_NAMED_FLOOR_SYSTEM;
  }

  const rlTiles = rlTileIdsForRegion(input.index, input.region);
  if (rlTiles.size > 0) {
    for (const record of apcRecords) {
      const tileId = record.source?.tileId;
      if (tileId && rlTiles.has(tileId)) {
        score += SCORE_RL_CO_TILE_BINDING;
        authorizingIds.push(record.id);
        break;
      }
    }
  }

  return {
    subjectKey: input.cluster.subjectKey,
    score,
    authorizingEvidenceIds: uniqueSortedIds(authorizingIds),
  };
}

export function scoreAreaClusterBinding(input: {
  region: RegionIdentity;
  cluster: ClusterCandidate;
}): ScopeBindingScore {
  const authorizingIds: string[] = [];
  let score = 0;

  for (const record of input.cluster.records) {
    if (input.region.evidenceIds.includes(record.id)) {
      if (record.source?.elementLabel?.trim()) {
        score += SCORE_RL_ELEMENT_LABEL;
      }
      if (record.source?.region != null) {
        score += SCORE_RL_REGION_BBOX;
      }
      authorizingIds.push(record.id);
    }
  }

  const tokenAlignment = subjectContainsRegionTokens(
    input.cluster.subjectKey,
    input.region.tokens,
  );
  score += tokenAlignment * SCORE_REGION_TOKEN_ALIGNMENT;

  if (/FLOOR\s+AREA/i.test(input.cluster.subjectKey)) {
    score += SCORE_EXPLICIT_FLOOR_AREA_NAMING;
  }

  const spanRecords = input.cluster.records.filter(
    (record) =>
      record.propertyPath === "joistMemberLengthFeet" ||
      /max\.?\s*span/i.test(record.originalText ?? ""),
  );
  if (spanRecords.length > 0) {
    score += SCORE_SL_CORROBORATION;
    authorizingIds.push(...spanRecords.map((record) => record.id));
  }

  return {
    subjectKey: input.cluster.subjectKey,
    score,
    authorizingEvidenceIds: uniqueSortedIds([...input.region.evidenceIds, ...authorizingIds]),
  };
}

export function selectUniqueByScore<T extends string>(
  scored: readonly ScopeBindingScore[],
  conflictReason: ConstructionSemanticRejectionReason,
): UniqueSelectionResult<T> {
  if (scored.length === 0) {
    return {
      status: "conflict",
      reason: conflictReason,
      candidates: [],
      scores: new Map(),
      authorizingEvidenceIds: [],
    };
  }

  const scores = new Map<T, number>();
  const evidenceByKey = new Map<T, EvidenceId[]>();

  for (const entry of scored) {
    scores.set(entry.subjectKey as T, entry.score);
    evidenceByKey.set(entry.subjectKey as T, entry.authorizingEvidenceIds);
  }

  const maxScore = Math.max(...scored.map((entry) => entry.score));
  const topCandidates = scored.filter((entry) => entry.score === maxScore);

  if (topCandidates.length !== 1 || maxScore <= 0) {
    const candidates = topCandidates.map((entry) => entry.subjectKey as T);
    const authorizingEvidenceIds = uniqueSortedIds(
      topCandidates.flatMap((entry) => entry.authorizingEvidenceIds),
    );
    return {
      status: "conflict",
      reason: topCandidates.length > 1 ? conflictReason : "AMBIGUOUS_AUTHORITY",
      candidates,
      scores,
      authorizingEvidenceIds,
    };
  }

  const winner = topCandidates[0]!;
  return {
    status: "unique",
    value: winner.subjectKey as T,
    score: winner.score,
    authorizingEvidenceIds: winner.authorizingEvidenceIds,
  };
}

export function systemClustersMatchingFingerprint(
  clusters: readonly ClusterCandidate[],
  fingerprint: AssemblyFingerprint,
): ClusterCandidate[] {
  return clusters.filter((cluster) => {
    const clusterFingerprint = fingerprintFromSystemRecords(cluster.records);
    if (!clusterFingerprint) {
      return false;
    }
    return (
      clusterFingerprint.joistProductClass === fingerprint.joistProductClass &&
      clusterFingerprint.joistSize === fingerprint.joistSize &&
      clusterFingerprint.joistSpacingInches === fingerprint.joistSpacingInches
    );
  });
}

function clusterHasRegionBinding(
  region: RegionIdentity,
  cluster: ClusterCandidate,
): boolean {
  if (subjectContainsRegionTokens(cluster.subjectKey, region.tokens) > 0) {
    return true;
  }
  return cluster.records.some((record) => region.evidenceIds.includes(record.id));
}

export function areaClustersMatchingRegion(
  clusters: readonly ClusterCandidate[],
  region: RegionIdentity,
): ClusterCandidate[] {
  return clusters.filter((cluster) => {
    if (!clusterHasRegionBinding(region, cluster)) {
      return false;
    }
    const score = scoreAreaClusterBinding({ region, cluster });
    return score.score > 0;
  });
}
