import type { Evidence } from "../../../core/schemas/evidence.schema.js";
import type { EvidenceId, ObjectId } from "../../../core/schemas/identity.schema.js";
import type {
  FloorFramingArea,
  FloorFramingSystem,
} from "../schemas/floor-framing.schema.js";
import type { CanonicalEvidenceCluster } from "./convergeEvidenceByCanonicalObjectId.js";
import { isSlabOrNonWoodFloorArea } from "./floorAreaMaterialCompatibility.js";

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replaceAll(/\s+/g, "-");
}

const DIRECTIONAL_AREA_SUFFIXES = [
  /---SOUTH$/i,
  /---NORTH$/i,
  /---S$/i,
  /---N$/i,
  / - SOUTH$/i,
  / - NORTH$/i,
] as const;

/**
 * Deterministic bay root for floor-framing-area subjects.
 * Strips known directional suffixes only — no fuzzy similarity.
 */
export function floorAreaBayRootKey(subjectKey: string): string {
  let key = subjectKey.trim();
  for (const pattern of DIRECTIONAL_AREA_SUFFIXES) {
    key = key.replace(pattern, "").trim();
  }
  return normalizeToken(key);
}

const SYSTEM_VARIANT_SUFFIXES = [
  /-SYSTEM$/i,
  /-FRAMING$/i,
  /\sSYSTEM$/i,
  /\sFRAMING$/i,
] as const;

export function floorSystemFamilyRootKey(subjectKey: string): string {
  let key = subjectKey.trim();
  for (const pattern of SYSTEM_VARIANT_SUFFIXES) {
    key = key.replace(pattern, "").trim();
  }
  return normalizeToken(key);
}

function uniqueSortedIds(ids: readonly string[]): EvidenceId[] {
  return [...new Set(ids)].sort(compareIds) as EvidenceId[];
}

function splitCombinedJoistTypeValue(
  joistType: string,
): { joistType: string; joistSize: string | null } {
  const trimmed = joistType.trim();
  const sizeFirst = trimmed.match(
    /^(\d+\s+\d+\/\d"|\d+-?\d+\/\d"|\d+\/\d"|\d+\s+\d+\/\d)\s+(.+)$/i,
  );
  if (sizeFirst) {
    return {
      joistSize: sizeFirst[1]!.trim(),
      joistType: sizeFirst[2]!.trim(),
    };
  }

  return { joistType: trimmed, joistSize: null };
}

type PropertyResolutionTrace = FloorFramingSystem["resolutionTraces"][number];

function createTrace(
  propertyPath: string,
  method: PropertyResolutionTrace["method"],
  explanation: string,
  evidenceIds: readonly EvidenceId[],
): PropertyResolutionTrace {
  return {
    propertyPath,
    method,
    explanation,
    evidenceIds: uniqueSortedIds(evidenceIds),
    assumptionIds: [],
    userDecisionIds: [],
    validationIssueIds: [],
    reviewItemIds: [],
  };
}

/**
 * When a system cluster carries a combined joist type string, split type and size.
 */
export function applyCombinedJoistTypeSplit(
  system: FloorFramingSystem,
): FloorFramingSystem {
  const currentType = system.assembly.joistType;
  if (!currentType || system.assembly.joistSize !== null) {
    return system;
  }

  const split = splitCombinedJoistTypeValue(currentType);
  if (!split.joistSize) {
    return system;
  }

  const typeTrace = system.resolutionTraces.find(
    (trace) => trace.propertyPath === "assembly.joistType",
  );

  return {
    ...system,
    assembly: {
      ...system.assembly,
      joistType: split.joistType,
      joistSize: split.joistSize,
    },
    resolutionTraces: [
      ...system.resolutionTraces.filter(
        (trace) =>
          trace.propertyPath !== "assembly.joistType" &&
          trace.propertyPath !== "assembly.joistSize",
      ),
      createTrace(
        "assembly.joistType",
        typeTrace?.method ?? "supported-inference",
        `Split combined joist type string into material type "${split.joistType}".`,
        typeTrace?.evidenceIds ?? [],
      ),
      createTrace(
        "assembly.joistSize",
        "supported-inference",
        `Split combined joist type string into joist size "${split.joistSize}".`,
        typeTrace?.evidenceIds ?? [],
      ),
    ],
  };
}

function systemsShareAssemblyFamily(
  left: FloorFramingSystem,
  right: FloorFramingSystem,
): boolean {
  if (floorSystemFamilyRootKey(left.name) !== floorSystemFamilyRootKey(right.name)) {
    return false;
  }

  const leftType = left.assembly.joistType;
  const rightType = right.assembly.joistType;
  if (!leftType || !rightType) {
    return false;
  }

  return normalizeToken(leftType) === normalizeToken(rightType);
}

/**
 * Propagate missing assembly fields across sibling systems in the same family
 * when joist type identity matches deterministically.
 */
export function applySiblingFloorSystemAssemblyMerge(
  systems: FloorFramingSystem[],
): FloorFramingSystem[] {
  const merged = systems.map((system) => applyCombinedJoistTypeSplit(system));

  return merged.map((system) => {
    let updated = system;

    if (updated.assembly.joistSize === null) {
      const sizeDonor = merged.find(
        (candidate) =>
          candidate.id !== updated.id &&
          systemsShareAssemblyFamily(updated, candidate) &&
          candidate.assembly.joistSize !== null,
      );
      if (sizeDonor) {
        const donorTrace = sizeDonor.resolutionTraces.find(
          (trace) => trace.propertyPath === "assembly.joistSize",
        );
        updated = {
          ...updated,
          assembly: {
            ...updated.assembly,
            joistSize: sizeDonor.assembly.joistSize,
          },
          resolutionTraces: [
            ...updated.resolutionTraces,
            createTrace(
              "assembly.joistSize",
              "supported-inference",
              `Resolved joist size from sibling floor system ${sizeDonor.id} with matching joist type family.`,
              donorTrace?.evidenceIds ?? sizeDonor.evidenceIds,
            ),
          ],
          evidenceIds: uniqueSortedIds([
            ...updated.evidenceIds,
            ...sizeDonor.evidenceIds,
          ]),
        };
      }
    }

    if (updated.assembly.joistSpacingInches === null) {
      const spacingDonor = merged.find(
        (candidate) =>
          candidate.id !== updated.id &&
          systemsShareAssemblyFamily(updated, candidate) &&
          candidate.assembly.joistSpacingInches !== null,
      );
      if (spacingDonor) {
        const donorTrace = spacingDonor.resolutionTraces.find(
          (trace) => trace.propertyPath === "assembly.joistSpacingInches",
        );
        updated = {
          ...updated,
          assembly: {
            ...updated.assembly,
            joistSpacingInches: spacingDonor.assembly.joistSpacingInches,
          },
          resolutionTraces: [
            ...updated.resolutionTraces,
            createTrace(
              "assembly.joistSpacingInches",
              "supported-inference",
              `Resolved joist spacing from sibling floor system ${spacingDonor.id} with matching joist type family.`,
              donorTrace?.evidenceIds ?? spacingDonor.evidenceIds,
            ),
          ],
          evidenceIds: uniqueSortedIds([
            ...updated.evidenceIds,
            ...spacingDonor.evidenceIds,
          ]),
        };
      }
    }

    return updated;
  });
}

function isParentLinkedArea(
  area: FloorFramingArea,
  systemsById: ReadonlyMap<ObjectId, FloorFramingSystem>,
): boolean {
  if (area.parentSystemId.endsWith("UNRESOLVED")) {
    return false;
  }

  const system = systemsById.get(area.parentSystemId);
  return system ? system.areaIds.includes(area.id) : false;
}

/**
 * Merges single-value bay fragment evidence onto the parent-linked area in the
 * same deterministic bay-root family. Preserves distinct bays and multi-value conflicts.
 */
export function mergeBayFragmentEvidenceOntoLinkedAreas(input: {
  areaClusters: readonly CanonicalEvidenceCluster[];
  areas: FloorFramingArea[];
  systems: FloorFramingSystem[];
}): Map<ObjectId, Evidence[]> {
  const systemsById = new Map(input.systems.map((system) => [system.id, system]));
  const clusterById = new Map(input.areaClusters.map((cluster) => [cluster.objectId, cluster]));
  const linkedAreas = input.areas.filter((area) =>
    isParentLinkedArea(area, systemsById),
  );

  const mergedRecords = new Map<ObjectId, Evidence[]>();

  for (const linkedArea of linkedAreas) {
    const linkedCluster = clusterById.get(linkedArea.id);
    if (!linkedCluster) {
      continue;
    }

    const bayRoot = floorAreaBayRootKey(linkedCluster.canonicalSubjectKey);
    const donorClusters = input.areaClusters.filter((cluster) => {
      if (cluster.objectId === linkedArea.id) {
        return false;
      }
      if (floorAreaBayRootKey(cluster.canonicalSubjectKey) !== bayRoot) {
        return false;
      }
      return !isSlabOrNonWoodFloorArea(cluster.records);
    });

    if (donorClusters.length === 0) {
      mergedRecords.set(linkedArea.id, [...linkedCluster.records]);
      continue;
    }

    const combined = [...linkedCluster.records];
    for (const donor of donorClusters) {
      for (const record of donor.records) {
        if (
          record.propertyPath === "parentSystemTag" ||
          record.propertyPath === "parentSystemId"
        ) {
          continue;
        }
        combined.push(record);
      }
    }

    mergedRecords.set(
      linkedArea.id,
      [...combined].sort((left, right) => compareIds(left.id, right.id)),
    );
  }

  return mergedRecords;
}
