import type { Evidence } from "../../../core/schemas/evidence.schema.js";
import { isWallTypeMarkSubjectKey } from "./wallGeometryObservation.js";

export const LENGTH_FEET_TOLERANCE = 1e-6;

export type EvidenceMergeConflict = {
  physicalRunKey: string;
  compilerEvidenceId: string;
  claudeEvidenceId: string;
  compilerFeet: number;
  claudeFeet: number;
};

export type EvidenceMergeAudit = {
  droppedTypeMarkLengths: Array<{
    evidenceId: string;
    subjectKey: string;
    candidateValue: number;
  }>;
  conflicts: EvidenceMergeConflict[];
  corroborations: Array<{
    physicalRunKey: string;
    compilerEvidenceId: string;
    claudeEvidenceId: string;
    feet: number;
  }>;
};

function isPhysicalRunKey(subjectKey: string): boolean {
  return subjectKey.trim().startsWith("physical-run:");
}

function lengthFeetValue(record: Evidence): number | null {
  if (record.propertyPath !== "lengthFeet") return null;
  if (typeof record.candidateValue !== "number" || !Number.isFinite(record.candidateValue)) {
    return null;
  }
  return record.candidateValue;
}

function withinLengthTolerance(a: number, b: number): boolean {
  return Math.abs(a - b) <= LENGTH_FEET_TOLERANCE;
}

/**
 * Merge Claude extraction Evidence with compiler geometry Evidence.
 * Type-mark Claude lengths are dropped; same physical-run conflicts admit both
 * records for Resolution fail-closed handling.
 */
export function mergeExtractedAndGeometryEvidence(input: {
  claudeEvidence: readonly Evidence[];
  geometryEvidence: readonly Evidence[];
}): { evidence: Evidence[]; audit: EvidenceMergeAudit } {
  const audit: EvidenceMergeAudit = {
    droppedTypeMarkLengths: [],
    conflicts: [],
    corroborations: [],
  };

  const filteredClaude: Evidence[] = [];
  for (const record of input.claudeEvidence) {
    if (
      record.subjectKind === "wall" &&
      record.propertyPath === "lengthFeet" &&
      isWallTypeMarkSubjectKey(record.subjectKey)
    ) {
      const feet = lengthFeetValue(record);
      if (feet != null) {
        audit.droppedTypeMarkLengths.push({
          evidenceId: record.id,
          subjectKey: record.subjectKey,
          candidateValue: feet,
        });
      }
      continue;
    }
    filteredClaude.push(record);
  }

  const geometryByRun = new Map<string, Evidence>();
  for (const record of input.geometryEvidence) {
    if (
      record.subjectKind === "wall" &&
      record.propertyPath === "lengthFeet" &&
      isPhysicalRunKey(record.subjectKey)
    ) {
      geometryByRun.set(record.subjectKey, record);
    }
  }

  for (const claudeRecord of filteredClaude) {
    if (
      claudeRecord.subjectKind !== "wall" ||
      claudeRecord.propertyPath !== "lengthFeet" ||
      !isPhysicalRunKey(claudeRecord.subjectKey)
    ) {
      continue;
    }
    const claudeFeet = lengthFeetValue(claudeRecord);
    if (claudeFeet == null) continue;

    const geom = geometryByRun.get(claudeRecord.subjectKey);
    if (!geom) continue;

    const compilerFeet = lengthFeetValue(geom);
    if (compilerFeet == null) continue;

    if (withinLengthTolerance(compilerFeet, claudeFeet)) {
      audit.corroborations.push({
        physicalRunKey: claudeRecord.subjectKey,
        compilerEvidenceId: geom.id,
        claudeEvidenceId: claudeRecord.id,
        feet: compilerFeet,
      });
    } else {
      audit.conflicts.push({
        physicalRunKey: claudeRecord.subjectKey,
        compilerEvidenceId: geom.id,
        claudeEvidenceId: claudeRecord.id,
        compilerFeet,
        claudeFeet,
      });
    }
  }

  const evidence = [...input.geometryEvidence, ...filteredClaude];
  return { evidence, audit };
}
