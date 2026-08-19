import { readFile } from "node:fs/promises";

import type { PipelineRunResult } from "../../src/core/pipeline/types.js";
import type { Evidence } from "../../src/core/schemas/evidence.schema.js";
import type { ObjectId } from "../../src/core/schemas/identity.schema.js";
import type {
  ConfidencePayload,
  ExtractedFramingEvidencePayload,
  FramingCalculationsPayload,
  StructuralMembersPayload,
  ValidationPayload,
  WallFramingPayload,
} from "../../src/scopes/framing/schemas/framing-artifacts.schema.js";
import type { FramingTakeoff } from "../../src/scopes/framing/schemas/framing-takeoff.schema.js";
import type { BuildingWall, WallSegment } from "../../src/scopes/framing/schemas/wall.schema.js";
import {
  STRUCTURAL_MEMBER_QUANTITY_KEYS,
  WALL_QUANTITY_KEYS,
} from "../../src/scopes/framing/validators/rule-ids.js";

export function materialLineItemId(
  quantityKey: string,
  objectId: string,
): string {
  return `MAT-${quantityKey.replaceAll(".", "-")}-object-${objectId}`;
}

export function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export function isGroundedInPageText(
  originalText: string | null,
  pageText: string,
): boolean {
  if (!originalText) {
    return false;
  }

  const haystack = normalize(pageText);
  const needle = normalize(originalText);
  if (haystack.includes(needle)) {
    return true;
  }

  const tokens = needle
    .split(" ")
    .map((token) => token.replace(/[^a-z0-9.x-]/g, ""))
    .filter((token) => token.length >= 2)
    .filter((token) => !["the", "and", "at", "of", "for", "in"].includes(token));

  return tokens.length > 0 && tokens.every((token) => haystack.includes(token));
}

export function hasCandidate(
  evidence: readonly Evidence[],
  propertyPath: string,
  candidateValue: string | number,
): boolean {
  return evidence.some(
    (record) =>
      record.propertyPath === propertyPath &&
      record.candidateValue === candidateValue,
  );
}

export function hasCandidateForSubject(
  evidence: readonly Evidence[],
  subjectKey: string,
  propertyPath: string,
  candidateValue: string | number,
): boolean {
  return evidence.some(
    (record) =>
      record.subjectKey === subjectKey &&
      record.propertyPath === propertyPath &&
      record.candidateValue === candidateValue,
  );
}

export function candidatesForSubjectProperty(
  evidence: readonly Evidence[],
  subjectKey: string,
  propertyPath: string,
): Array<string | number | boolean | null> {
  return evidence
    .filter(
      (record) =>
        record.subjectKey === subjectKey &&
        record.propertyPath === propertyPath,
    )
    .map((record) => record.candidateValue);
}

export function assertConflictingLengthCandidatesPreserved(
  evidence: readonly Evidence[],
  subjectKey: string,
  expectedValues: readonly number[],
): void {
  const actual = candidatesForSubjectProperty(evidence, subjectKey, "lengthFeet")
    .filter((value): value is number => typeof value === "number")
    .sort((left, right) => left - right);
  const expected = [...expectedValues].sort((left, right) => left - right);

  if (actual.length !== expected.length || !actual.every((value, index) => value === expected[index])) {
    throw new Error(
      `Expected ${subjectKey} lengthFeet candidates ${expected.join(", ")}, received ${actual.join(", ") || "(none)"}.`,
    );
  }
}

export function evidenceForSubject(
  evidence: readonly Evidence[],
  subjectKey: string,
): Evidence[] {
  return evidence.filter((record) => record.subjectKey === subjectKey);
}

export function wallById(
  wallFraming: WallFramingPayload,
  wallId: ObjectId,
): BuildingWall | undefined {
  return wallFraming.walls.find((wall) => wall.id === wallId);
}

export function segmentById(
  wallFraming: WallFramingPayload,
  segmentId: ObjectId,
): WallSegment | undefined {
  return wallFraming.segments.find((segment) => segment.id === segmentId);
}

export interface LiveFramingPipelineSnapshot {
  pageText: string;
  evidence: ExtractedFramingEvidencePayload["evidence"];
  wallFraming: WallFramingPayload;
  structuralMembers: StructuralMembersPayload;
  validation: ValidationPayload;
  calculations: FramingCalculationsPayload;
  confidence: ConfidencePayload;
  takeoff: FramingTakeoff;
  stageResults: PipelineRunResult["stageResults"];
}

/** @deprecated Prefer LiveFramingPipelineSnapshot; wall/segment set when exactly one wall. */
export interface LiveFramingProofSnapshot extends LiveFramingPipelineSnapshot {
  wall: BuildingWall;
  segment: WallSegment;
}

async function readStagePayload<T>(
  stageResults: PipelineRunResult["stageResults"],
  stageName: string,
): Promise<T> {
  const stage = stageResults.find((entry) => entry.name === stageName);
  if (!stage) {
    throw new Error(`Missing stage ${stageName}`);
  }

  const artifact = JSON.parse(await readFile(stage.artifactPath, "utf8")) as {
    payload: T;
  };
  return artifact.payload;
}

export async function snapshotLiveFramingPipeline(
  pageText: string,
  result: PipelineRunResult,
): Promise<LiveFramingPipelineSnapshot> {
  const evidence = await readStagePayload<ExtractedFramingEvidencePayload>(
    result.stageResults,
    "extractedEvidence",
  );
  const wallFraming = await readStagePayload<WallFramingPayload>(
    result.stageResults,
    "wallFraming",
  );
  const structuralMembers = await readStagePayload<StructuralMembersPayload>(
    result.stageResults,
    "structuralMembers",
  );
  const validation = await readStagePayload<ValidationPayload>(
    result.stageResults,
    "validation",
  );
  const calculations = await readStagePayload<FramingCalculationsPayload>(
    result.stageResults,
    "calculations",
  );
  const confidence = await readStagePayload<ConfidencePayload>(
    result.stageResults,
    "confidence",
  );
  const takeoff = await readStagePayload<FramingTakeoff>(
    result.stageResults,
    "report",
  );

  return {
    pageText,
    evidence: evidence.evidence,
    wallFraming,
    structuralMembers,
    validation,
    calculations,
    confidence,
    takeoff,
    stageResults: result.stageResults,
  };
}

export async function snapshotLiveFramingProof(
  pageText: string,
  result: PipelineRunResult,
): Promise<LiveFramingProofSnapshot> {
  const snapshot = await snapshotLiveFramingPipeline(pageText, result);
  const wall = snapshot.wallFraming.walls[0];
  const segment = snapshot.wallFraming.segments[0];
  if (!wall || !segment) {
    throw new Error("Expected one resolved wall and segment.");
  }

  return {
    ...snapshot,
    wall,
    segment,
  };
}

export function studMaterialForSegment(
  calculations: FramingCalculationsPayload,
  segmentId: ObjectId,
): FramingCalculationsPayload["materials"][number] | undefined {
  return calculations.materials.find(
    (item) =>
      item.id === materialLineItemId(WALL_QUANTITY_KEYS.studs, segmentId),
  );
}

export function plateMaterialForSegment(
  calculations: FramingCalculationsPayload,
  segmentId: ObjectId,
): FramingCalculationsPayload["materials"][number] | undefined {
  return calculations.materials.find(
    (item) =>
      item.id === materialLineItemId(WALL_QUANTITY_KEYS.plates, segmentId),
  );
}

export function studMaterial(
  calculations: FramingCalculationsPayload,
  segmentId: ObjectId = "WS-001",
): FramingCalculationsPayload["materials"][number] | undefined {
  return studMaterialForSegment(calculations, segmentId);
}

export function memberMaterialForObject(
  calculations: FramingCalculationsPayload,
  memberId: ObjectId,
): FramingCalculationsPayload["materials"][number] | undefined {
  return calculations.materials.find(
    (item) =>
      item.id ===
      materialLineItemId(STRUCTURAL_MEMBER_QUANTITY_KEYS.material, memberId),
  );
}

export function evidenceIdsForSubject(
  evidence: readonly Evidence[],
  subjectKey: string,
): string[] {
  return evidence
    .filter((record) => record.subjectKey === subjectKey)
    .map((record) => record.id)
    .sort();
}

export function assertNoCrossDomainTraceContamination(
  wallFraming: WallFramingPayload,
  structuralMembers: StructuralMembersPayload,
  wallEvidenceIds: readonly string[],
  memberEvidenceIds: readonly string[],
): void {
  const wallTraces = [
    ...wallFraming.walls.flatMap((wall) => wall.resolutionTraces),
    ...wallFraming.segments.flatMap((segment) => segment.resolutionTraces),
  ];
  const memberTraces = structuralMembers.structuralMembers.flatMap(
    (member) => member.resolutionTraces,
  );

  for (const evidenceId of memberEvidenceIds) {
    if (
      wallTraces.some((trace) => trace.evidenceIds.includes(evidenceId as never))
    ) {
      throw new Error(
        `Wall resolution traces incorrectly reference member Evidence ${evidenceId}.`,
      );
    }
  }

  for (const evidenceId of wallEvidenceIds) {
    if (
      memberTraces.some((trace) => trace.evidenceIds.includes(evidenceId as never))
    ) {
      throw new Error(
        `Structural member resolution traces incorrectly reference wall Evidence ${evidenceId}.`,
      );
    }
  }
}

export function plateMaterial(
  calculations: FramingCalculationsPayload,
  segmentId: ObjectId = "WS-001",
): FramingCalculationsPayload["materials"][number] | undefined {
  return plateMaterialForSegment(calculations, segmentId);
}

export function validationRuleOutcomes(
  validation: ValidationPayload,
): Array<{ ruleId: string; outcome: string }> {
  return validation.validationResults.map((entry) => ({
    ruleId: entry.ruleId,
    outcome: entry.outcome,
  }));
}

export function validationResultsForObject(
  validation: ValidationPayload,
  objectId: ObjectId,
): Array<{ ruleId: string; outcome: string }> {
  return validation.validationResults
    .filter(
      (entry) =>
        entry.target.kind === "object" && entry.target.objectId === objectId,
    )
    .map((entry) => ({
      ruleId: entry.ruleId,
      outcome: entry.outcome,
    }));
}

export function validationIssuesForObject(
  validation: ValidationPayload,
  objectId: ObjectId,
) {
  return validation.validationIssues.filter(
    (issue) =>
      issue.target.kind === "object" && issue.target.objectId === objectId,
  );
}

const W001_ONLY_VALUES: Array<{ propertyPath: string; value: string | number }> =
  [
    { propertyPath: "lengthFeet", value: 20 },
    { propertyPath: "assembly.studSize", value: "2x4" },
    { propertyPath: "assembly.studSpacingInches", value: 16 },
    { propertyPath: "assembly.heightFeet", value: 8 },
    { propertyPath: "assembly.plateCount", value: 3 },
  ];

const W002_ONLY_VALUES: Array<{ propertyPath: string; value: string | number }> =
  [
    { propertyPath: "lengthFeet", value: 12 },
    { propertyPath: "assembly.studSize", value: "2x6" },
    { propertyPath: "assembly.studSpacingInches", value: 24 },
    { propertyPath: "assembly.heightFeet", value: 9 },
    { propertyPath: "assembly.plateCount", value: 2 },
  ];

export function assertNoCrossWallContamination(
  evidence: readonly Evidence[],
  subjectKeyA: string,
  subjectKeyB: string,
  valuesOwnedByA: Array<{ propertyPath: string; value: string | number }>,
  valuesOwnedByB: Array<{ propertyPath: string; value: string | number }>,
): void {
  for (const owned of valuesOwnedByA) {
    const foreign = evidence.some(
      (record) =>
        record.subjectKey === subjectKeyB &&
        record.propertyPath === owned.propertyPath &&
        record.candidateValue === owned.value,
    );
    if (foreign) {
      throw new Error(
        `${subjectKeyB} Evidence incorrectly contains ${owned.propertyPath}=${owned.value} belonging to ${subjectKeyA}.`,
      );
    }
  }

  for (const owned of valuesOwnedByB) {
    const foreign = evidence.some(
      (record) =>
        record.subjectKey === subjectKeyA &&
        record.propertyPath === owned.propertyPath &&
        record.candidateValue === owned.value,
    );
    if (foreign) {
      throw new Error(
        `${subjectKeyA} Evidence incorrectly contains ${owned.propertyPath}=${owned.value} belonging to ${subjectKeyB}.`,
      );
    }
  }
}

export const TWO_WALL_W001_VALUES = W001_ONLY_VALUES;
export const TWO_WALL_W002_VALUES = W002_ONLY_VALUES;

export type SemanticEvidenceKey = `${string}:${string}:${string}`;

export function semanticEvidenceKey(record: Evidence): SemanticEvidenceKey {
  return `${record.subjectKind}:${record.subjectKey}:${record.propertyPath}`;
}

export function semanticCandidateSets(
  evidence: readonly Evidence[],
): Map<
  SemanticEvidenceKey,
  Set<string | number | boolean | null>
> {
  const sets = new Map<
    SemanticEvidenceKey,
    Set<string | number | boolean | null>
  >();

  for (const record of evidence) {
    const key = semanticEvidenceKey(record);
    const existing = sets.get(key) ?? new Set();
    existing.add(record.candidateValue);
    sets.set(key, existing);
  }

  return sets;
}

function setsEqual(
  left: Set<string | number | boolean | null>,
  right: Set<string | number | boolean | null>,
): boolean {
  if (left.size !== right.size) {
    return false;
  }

  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }

  return true;
}

export function semanticEvidenceDifferences(
  control: readonly Evidence[],
  mutation: readonly Evidence[],
  allowedDifferentKeys: readonly SemanticEvidenceKey[] = [],
): SemanticEvidenceKey[] {
  const allowed = new Set(allowedDifferentKeys);
  const controlSets = semanticCandidateSets(control);
  const mutationSets = semanticCandidateSets(mutation);
  const keys = new Set([...controlSets.keys(), ...mutationSets.keys()]);
  const differences: SemanticEvidenceKey[] = [];

  for (const key of keys) {
    if (allowed.has(key)) {
      continue;
    }

    const left = controlSets.get(key) ?? new Set();
    const right = mutationSets.get(key) ?? new Set();
    if (!setsEqual(left, right)) {
      differences.push(key);
    }
  }

  return differences.sort();
}

export function lengthFeetCandidatesForSubject(
  evidence: readonly Evidence[],
  subjectKind: Evidence["subjectKind"],
  subjectKey: string,
): number[] {
  return evidence
    .filter(
      (record) =>
        record.subjectKind === subjectKind &&
        record.subjectKey === subjectKey &&
        record.propertyPath === "lengthFeet" &&
        typeof record.candidateValue === "number",
    )
    .map((record) => record.candidateValue as number)
    .sort((left, right) => left - right);
}
