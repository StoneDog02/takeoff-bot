import type { Evidence } from "../../../core/schemas/evidence.schema.js";
import { evidenceSchema } from "../../../core/schemas/evidence.schema.js";
import { parseImperialLengthToFeet } from "./parseImperialLengthToFeet.js";
import {
  isWallTypeMarkSubjectKey,
  type WallGeometryObservation,
} from "./wallGeometryObservation.js";

export type GeometryLengthAssignment =
  | {
      status: "assigned";
      physicalRunKey: string;
      lengthFeet: number;
      authorityMethod: WallGeometryObservation["authorityMethod"];
      evidence: Evidence;
      observationId: string;
    }
  | {
      status: "rejected";
      observationId: string;
      reason: string;
    };

/**
 * Converts a geometry observation into lengthFeet Evidence for a physical run.
 * Fails closed for wall-type marks, chain segments, low confidence, and
 * ambiguous / unparsable dimensions.
 */
export function assignLengthEvidenceFromGeometryObservation(
  observation: WallGeometryObservation,
): GeometryLengthAssignment {
  if (observation.targetKind !== "physical-run") {
    return {
      status: "rejected",
      observationId: observation.id,
      reason: `targetKind=${observation.targetKind}; only physical-run may receive lengthFeet.`,
    };
  }

  const runKey = observation.targetPhysicalRunKey?.trim() ?? "";
  if (runKey.length === 0) {
    return {
      status: "rejected",
      observationId: observation.id,
      reason: "missing targetPhysicalRunKey",
    };
  }

  if (isWallTypeMarkSubjectKey(runKey)) {
    return {
      status: "rejected",
      observationId: observation.id,
      reason: `targetPhysicalRunKey '${runKey}' looks like a wall-type mark; refuse length attachment.`,
    };
  }

  if (observation.observedWallTypeMark) {
    // Type mark may annotate the run, but must not be the length owner.
    if (
      isWallTypeMarkSubjectKey(observation.observedWallTypeMark) &&
      observation.observedWallTypeMark.toUpperCase() === runKey.toUpperCase()
    ) {
      return {
        status: "rejected",
        observationId: observation.id,
        reason: "observed wall-type mark equals target run key",
      };
    }
  }

  if (observation.isChainSegment) {
    return {
      status: "rejected",
      observationId: observation.id,
      reason:
        "dimension-chain segment must not silently authorize a whole-run lengthFeet",
    };
  }

  if (observation.authorityMethod !== "explicit-dimension") {
    return {
      status: "rejected",
      observationId: observation.id,
      reason: `authorityMethod=${observation.authorityMethod} not authorized for V1 length assignment`,
    };
  }

  if (observation.confidenceLabel === "low") {
    return {
      status: "rejected",
      observationId: observation.id,
      reason: "low confidence observations do not authorize lengthFeet",
    };
  }

  const parsed = parseImperialLengthToFeet(observation.rawDimensionText);
  if (parsed.status !== "ok") {
    return {
      status: "rejected",
      observationId: observation.id,
      reason: `parse failed: ${parsed.reason}`,
    };
  }

  if (
    observation.lengthFeet !== null &&
    Math.abs(observation.lengthFeet - parsed.feet) > 1e-6
  ) {
    return {
      status: "rejected",
      observationId: observation.id,
      reason: `observation.lengthFeet ${observation.lengthFeet} disagrees with deterministic parse ${parsed.feet}`,
    };
  }

  const evidence = evidenceSchema.parse({
    id: `E-GEOM-${observation.id}`.slice(0, 64),
    type: "dimension",
    relationship: "supports",
    description: `Wall-run length from explicit plan dimension ${parsed.originalText} (${observation.authorityMethod}).`,
    source: {
      page: {
        documentId: null,
        pageNumber: observation.sourcePageNumber,
        sheetId: null,
        sheetTitle: null,
        pageLabel: null,
        revision: null,
      },
      region: null,
      tileId: observation.sourceTileId,
      elementLabel: observation.observedWallTypeMark,
      detailNumber: null,
      sectionNumber: null,
      scheduleName: null,
      noteReference: null,
    },
    originalText: parsed.originalText,
    references: [],
    subjectKind: "wall",
    subjectKey: runKey,
    propertyPath: "lengthFeet",
    candidateValue: parsed.feet,
    extractionPassId: "geometry-observation",
    bundleId: null,
  });

  return {
    status: "assigned",
    physicalRunKey: runKey,
    lengthFeet: parsed.feet,
    authorityMethod: observation.authorityMethod,
    evidence,
    observationId: observation.id,
  };
}

/**
 * Applies many observations: corroborating same run+length ok;
 * conflicting lengths for same run → none assigned (fail closed).
 */
export function assignLengthEvidenceFromGeometryObservations(
  observations: readonly WallGeometryObservation[],
): {
  assignments: GeometryLengthAssignment[];
  evidence: Evidence[];
} {
  const assignments = observations.map((observation) =>
    assignLengthEvidenceFromGeometryObservation(observation),
  );

  const byRun = new Map<string, number[]>();
  for (const assignment of assignments) {
    if (assignment.status !== "assigned") {
      continue;
    }
    const lengths = byRun.get(assignment.physicalRunKey) ?? [];
    lengths.push(assignment.lengthFeet);
    byRun.set(assignment.physicalRunKey, lengths);
  }

  const conflictedRuns = new Set<string>();
  for (const [runKey, lengths] of byRun) {
    const unique = [...new Set(lengths.map((value) => value.toFixed(6)))];
    if (unique.length > 1) {
      conflictedRuns.add(runKey);
    }
  }

  const evidence: Evidence[] = [];
  const finalized: GeometryLengthAssignment[] = assignments.map((assignment) => {
    if (assignment.status !== "assigned") {
      return assignment;
    }
    if (conflictedRuns.has(assignment.physicalRunKey)) {
      return {
        status: "rejected",
        observationId: observationIdOf(assignment),
        reason: `conflicting authoritative lengths for physical run '${assignment.physicalRunKey}'`,
      };
    }
    // Deduplicate identical corroborating evidence by keeping first
    if (
      evidence.some(
        (record) =>
          record.subjectKey === assignment.physicalRunKey &&
          record.propertyPath === "lengthFeet" &&
          record.candidateValue === assignment.lengthFeet,
      )
    ) {
      return assignment;
    }
    evidence.push(assignment.evidence);
    return assignment;
  });

  return { assignments: finalized, evidence };
}

function observationIdOf(assignment: GeometryLengthAssignment): string {
  return assignment.observationId;
}
