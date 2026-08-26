import type { Evidence } from "../../../core/schemas/evidence.schema.js";
import { evidenceSchema } from "../../../core/schemas/evidence.schema.js";
import type { GovernedProjectDictionary } from "../../../project-interpreter/schemas/projectDictionary.schema.js";

export const AREA_SYSTEM_RELATIONSHIP_BRIDGE_PASS_ID =
  "area-system-relationship-bridge";
export const AREA_SYSTEM_RELATIONSHIP_BRIDGE_BUNDLE_ID =
  "area-system-relationship-bridge";

const WALL_SUBTYPE_BINDING_PATTERN = /^SW\d/i;

const OWNERSHIP_MECHANISM_PATTERN =
  /ownership|governed-by|parent-system|area-system|parent_system|governed_by/i;

const OWNERSHIP_PHRASE_PATTERNS = [
  /\bunder\b/i,
  /\bgoverned by\b/i,
  /\bsystem\s*[:=]/i,
  /\(\s*[A-Z0-9][A-Z0-9._-]*\s*\)/,
  /\bfor\s+(?:area|plane|bay)\b/i,
];

type AreaSystemDomain = "floor" | "sheathing" | "roof";

type DomainConfig = {
  areaSubjectKind: Evidence["subjectKind"];
  systemSubjectKind: Evidence["subjectKind"];
  domain: AreaSystemDomain;
};

const DOMAIN_CONFIGS: readonly DomainConfig[] = [
  {
    areaSubjectKind: "floor-framing-area",
    systemSubjectKind: "floor-framing-system",
    domain: "floor",
  },
  {
    areaSubjectKind: "sheathing-area",
    systemSubjectKind: "sheathing-system",
    domain: "sheathing",
  },
  {
    areaSubjectKind: "roof-plane",
    systemSubjectKind: "roof-framing-system",
    domain: "roof",
  },
];

export type AreaSystemRelationshipProofClass = "P1" | "P2" | "P3" | "P4";

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueSortedIds(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort(compareIds);
}

function bridgeEvidenceId(areaSubjectKey: string, proofClass: string): string {
  return `E-bridge-${proofClass}-${areaSubjectKey}`
    .replace(/[^A-Za-z0-9._:-]/g, "-")
    .slice(0, 128);
}

function subjectKeysForKind(
  evidence: readonly Evidence[],
  subjectKind: Evidence["subjectKind"],
): Set<string> {
  return new Set(
    evidence
      .filter((record) => record.subjectKind === subjectKind)
      .map((record) => record.subjectKey.trim())
      .filter(Boolean),
  );
}

function recordsForSubject(
  evidence: readonly Evidence[],
  subjectKey: string,
): Evidence[] {
  return evidence.filter((record) => record.subjectKey === subjectKey);
}

function sourcePageFromEvidence(records: readonly Evidence[]): number {
  for (const record of records) {
    const pageNumber = record.source?.page?.pageNumber;
    if (pageNumber != null) {
      return pageNumber;
    }
  }
  return 1;
}

function hasExplicitOwnershipPhrase(text: string): boolean {
  return OWNERSHIP_PHRASE_PATTERNS.some((pattern) => pattern.test(text));
}

function containsBothTags(text: string, areaTag: string, systemTag: string): boolean {
  const upper = text.toUpperCase();
  return upper.includes(areaTag.toUpperCase()) && upper.includes(systemTag.toUpperCase());
}

function tryProofP4(
  areaSubjectKey: string,
  areaRecords: readonly Evidence[],
  systemTags: Set<string>,
): { systemTag: string; evidenceIds: string[] } | null {
  const viable: Array<{ systemTag: string; evidenceIds: string[] }> = [];

  for (const systemTag of systemTags) {
    const matchingRecords = areaRecords.filter((record) => {
      const text = record.originalText?.trim() ?? "";
      if (text.length < 8) {
        return false;
      }
      if (!containsBothTags(text, areaSubjectKey, systemTag)) {
        return false;
      }
      return hasExplicitOwnershipPhrase(text);
    });

    if (matchingRecords.length > 0) {
      viable.push({
        systemTag,
        evidenceIds: uniqueSortedIds(matchingRecords.map((record) => record.id)),
      });
    }
  }

  const distinctSystems = new Set(viable.map((entry) => entry.systemTag));
  if (distinctSystems.size === 1) {
    return viable[0]!;
  }
  return null;
}

function tryProofP3(
  areaSubjectKey: string,
  areaRecords: readonly Evidence[],
  systemTags: Set<string>,
): { systemTag: string; evidenceIds: string[] } | null {
  const viable: Array<{ systemTag: string; evidenceIds: string[] }> = [];

  for (const areaRecord of areaRecords) {
    if (
      areaRecord.propertyPath === "parentSystemTag" &&
      typeof areaRecord.candidateValue === "string" &&
      systemTags.has(areaRecord.candidateValue.trim())
    ) {
      viable.push({
        systemTag: areaRecord.candidateValue.trim(),
        evidenceIds: uniqueSortedIds([areaRecord.id]),
      });
      continue;
    }

    for (const reference of areaRecord.references ?? []) {
      const refText = reference.originalText?.trim() ?? "";
      if (refText.length < 8 || !hasExplicitOwnershipPhrase(refText)) {
        continue;
      }

      for (const systemTag of systemTags) {
        if (containsBothTags(refText, areaSubjectKey, systemTag)) {
          viable.push({
            systemTag,
            evidenceIds: uniqueSortedIds([areaRecord.id]),
          });
        }
      }
    }
  }

  const distinctSystems = new Set(viable.map((entry) => entry.systemTag));
  if (distinctSystems.size === 1) {
    return viable[0]!;
  }
  return null;
}

function tryProofP2(
  dictionary: GovernedProjectDictionary,
  areaSubjectKey: string,
  systemTags: Set<string>,
): { systemTag: string; definitionId: string } | null {
  const viable: Array<{ systemTag: string; definitionId: string }> = [];

  for (const definition of dictionary.definitions) {
    if (definition.semanticTypeKey !== areaSubjectKey) {
      continue;
    }
    for (const property of definition.properties) {
      if (property.propertyPath !== "parentSystemTag") {
        continue;
      }
      const systemTag = property.rawText.trim();
      if (systemTag.length > 0 && systemTags.has(systemTag)) {
        viable.push({ systemTag, definitionId: definition.semanticTypeKey });
      }
    }
  }

  const distinctSystems = new Set(viable.map((entry) => entry.systemTag));
  if (distinctSystems.size === 1) {
    return viable[0]!;
  }
  return null;
}

function isOwnershipBinding(
  binding: GovernedProjectDictionary["bindings"][number],
  areaSubjectKey: string,
  systemTag: string,
): boolean {
  if (binding.status !== "established_binding") {
    return false;
  }
  if (WALL_SUBTYPE_BINDING_PATTERN.test(binding.referenceKey ?? "")) {
    return false;
  }
  if (
    binding.physicalRunKey !== areaSubjectKey ||
    binding.referenceKey !== systemTag
  ) {
    return false;
  }
  return OWNERSHIP_MECHANISM_PATTERN.test(binding.mechanism);
}

function tryProofP1(
  dictionary: GovernedProjectDictionary,
  areaSubjectKey: string,
  systemTags: Set<string>,
): { systemTag: string; bindingKey: string } | null {
  const viable: Array<{ systemTag: string; bindingKey: string }> = [];

  for (const binding of dictionary.bindings) {
    for (const systemTag of systemTags) {
      if (isOwnershipBinding(binding, areaSubjectKey, systemTag)) {
        viable.push({
          systemTag,
          bindingKey: `${binding.physicalRunKey}:${binding.referenceKey}`,
        });
      }
    }
  }

  const distinctSystems = new Set(viable.map((entry) => entry.systemTag));
  if (distinctSystems.size === 1) {
    return viable[0]!;
  }
  return null;
}

function emitBridgeEvidence(input: {
  areaSubjectKey: string;
  areaSubjectKind: Evidence["subjectKind"];
  systemTag: string;
  proofClass: AreaSystemRelationshipProofClass;
  authorizingEvidenceIds: readonly string[];
  pageNumber: number;
}): Evidence {
  return evidenceSchema.parse({
    id: bridgeEvidenceId(input.areaSubjectKey, input.proofClass),
    type: "tag",
    relationship: "supports",
    description: `Bridge[${input.proofClass}]: parentSystemTag for ${input.areaSubjectKey} → ${input.systemTag}; evidenceIds=${input.authorizingEvidenceIds.join(",")}`,
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
      elementLabel: input.areaSubjectKey,
      detailNumber: null,
      sectionNumber: null,
      scheduleName: null,
      noteReference: null,
    },
    originalText: input.systemTag,
    references: [],
    subjectKind: input.areaSubjectKind,
    subjectKey: input.areaSubjectKey,
    propertyPath: "parentSystemTag",
    candidateValue: input.systemTag,
    extractionPassId: AREA_SYSTEM_RELATIONSHIP_BRIDGE_PASS_ID,
    bundleId: AREA_SYSTEM_RELATIONSHIP_BRIDGE_BUNDLE_ID,
  });
}

function existingParentSystemTags(
  evidence: readonly Evidence[],
  areaSubjectKey: string,
): Set<string> {
  const tags = new Set<string>();
  for (const record of evidence) {
    if (
      record.subjectKey !== areaSubjectKey ||
      record.propertyPath !== "parentSystemTag"
    ) {
      continue;
    }
    if (typeof record.candidateValue === "string" && record.candidateValue.trim()) {
      tags.add(record.candidateValue.trim());
    }
  }
  return tags;
}

function resolveBridgeLinkForArea(input: {
  areaSubjectKey: string;
  config: DomainConfig;
  evidence: readonly Evidence[];
  dictionary: GovernedProjectDictionary | null;
  systemTags: Set<string>;
}): Evidence | null {
  if (existingParentSystemTags(input.evidence, input.areaSubjectKey).size > 0) {
    return null;
  }

  const areaRecords = recordsForSubject(input.evidence, input.areaSubjectKey);
  if (areaRecords.length === 0) {
    return null;
  }

  const pageNumber = sourcePageFromEvidence(areaRecords);

  if (input.dictionary) {
    const p1 = tryProofP1(input.dictionary, input.areaSubjectKey, input.systemTags);
    if (p1) {
      return emitBridgeEvidence({
        areaSubjectKey: input.areaSubjectKey,
        areaSubjectKind: input.config.areaSubjectKind,
        systemTag: p1.systemTag,
        proofClass: "P1",
        authorizingEvidenceIds: areaRecords.map((record) => record.id),
        pageNumber,
      });
    }

    const p2 = tryProofP2(input.dictionary, input.areaSubjectKey, input.systemTags);
    if (p2) {
      return emitBridgeEvidence({
        areaSubjectKey: input.areaSubjectKey,
        areaSubjectKind: input.config.areaSubjectKind,
        systemTag: p2.systemTag,
        proofClass: "P2",
        authorizingEvidenceIds: areaRecords.map((record) => record.id),
        pageNumber,
      });
    }
  }

  const p3 = tryProofP3(
    input.areaSubjectKey,
    areaRecords,
    input.systemTags,
  );
  if (p3) {
    return emitBridgeEvidence({
      areaSubjectKey: input.areaSubjectKey,
      areaSubjectKind: input.config.areaSubjectKind,
      systemTag: p3.systemTag,
      proofClass: "P3",
      authorizingEvidenceIds: p3.evidenceIds,
      pageNumber,
    });
  }

  const p4 = tryProofP4(input.areaSubjectKey, areaRecords, input.systemTags);
  if (p4) {
    return emitBridgeEvidence({
      areaSubjectKey: input.areaSubjectKey,
      areaSubjectKind: input.config.areaSubjectKind,
      systemTag: p4.systemTag,
      proofClass: "P4",
      authorizingEvidenceIds: p4.evidenceIds,
      pageNumber,
    });
  }

  return null;
}

/**
 * D1-C deterministic fallback: emit calculator-safe parentSystemTag Evidence
 * from explicit ownership proof classes P1–P4 only.
 */
export function buildAreaSystemRelationshipEvidence(
  evidence: readonly Evidence[],
  dictionary: GovernedProjectDictionary | null,
): Evidence[] {
  const bridgeRecords: Evidence[] = [];
  const emittedAreaKeys = new Set<string>();

  for (const config of DOMAIN_CONFIGS) {
    const areaTags = subjectKeysForKind(evidence, config.areaSubjectKind);
    const systemTags = subjectKeysForKind(evidence, config.systemSubjectKind);

    for (const areaSubjectKey of [...areaTags].sort(compareIds)) {
      const emissionKey = `${config.domain}:${areaSubjectKey}`;
      if (emittedAreaKeys.has(emissionKey)) {
        continue;
      }

      const bridgeRecord = resolveBridgeLinkForArea({
        areaSubjectKey,
        config,
        evidence: [...evidence, ...bridgeRecords],
        dictionary,
        systemTags,
      });

      if (bridgeRecord) {
        bridgeRecords.push(bridgeRecord);
        emittedAreaKeys.add(emissionKey);
      }
    }
  }

  return bridgeRecords;
}
