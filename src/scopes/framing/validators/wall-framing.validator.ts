import type { BuildingWall, WallSegment } from "../schemas/wall.schema.js";
import type { WallFramingPayload } from "../schemas/framing-artifacts.schema.js";
import {
  buildFailedBatch,
  buildPassedBatch,
  collectEvidenceIds,
  toReviewQuantityImpacts,
} from "./buildValidationBatch.js";
import { createObjectTarget } from "./ids.js";
import { isPropertyResolved } from "./isPropertyResolved.js";
import { mergeValidationBatches } from "./mergeValidationBatch.js";
import {
  WALL_FRAMING_RULE_IDS,
  WALL_QUANTITY_KEYS,
} from "./rule-ids.js";
import type { ValidationBatch } from "./types.js";

function validateSegmentParentResolved(
  segment: WallSegment,
  wallsById: ReadonlyMap<string, BuildingWall>,
): ValidationBatch {
  const target = createObjectTarget(segment.id, segment.objectType);
  const ruleId = WALL_FRAMING_RULE_IDS.segmentParentResolved;

  if (wallsById.has(segment.parentWallId)) {
    return buildPassedBatch(
      ruleId,
      "relationship",
      target,
      `Segment ${segment.id} references an existing parent wall.`,
      collectEvidenceIds(segment),
    );
  }

  const quantityImpacts = [
    {
      quantityKey: WALL_QUANTITY_KEYS.studs,
      description: "Stud quantities require a valid wall segment length.",
      canCalculate: false,
    },
    {
      quantityKey: WALL_QUANTITY_KEYS.plates,
      description: "Plate quantities require a valid wall segment length.",
      canCalculate: false,
    },
  ];

  return buildFailedBatch(
    {
      ruleId,
      level: "relationship",
      severity: "critical",
      ruleViolated: "Wall segment parent must reference an existing wall.",
      explanation: `Segment ${segment.id} references missing parent wall ${segment.parentWallId}.`,
      target,
      recommendedUserAction:
        "Confirm the parent wall for this segment or remove the orphaned segment.",
      evidenceIds: collectEvidenceIds(segment),
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Resolve parent wall for segment ${segment.id}`,
      description: `Segment ${segment.id} references missing parent wall ${segment.parentWallId}.`,
      action: {
        type: "provide-value",
        instruction:
          "Identify the parent wall that owns this segment before takeoff continues.",
        targetProperty: "parentWallId",
      },
      reviewStatus: "review-required",
      blockingStatus: "blocked",
      affectedObjects: [{ objectId: segment.id, objectType: segment.objectType }],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds: collectEvidenceIds(segment),
    },
  );
}

function validateWallSegmentsConsistent(
  wall: BuildingWall,
  segmentsById: ReadonlyMap<string, WallSegment>,
): ValidationBatch {
  const target = createObjectTarget(wall.id, wall.objectType);
  const ruleId = WALL_FRAMING_RULE_IDS.segmentsConsistent;
  const problems: string[] = [];

  for (const segmentId of wall.segmentIds) {
    const segment = segmentsById.get(segmentId);
    if (!segment) {
      problems.push(
        `Wall ${wall.id} references missing segment ${segmentId}.`,
      );
      continue;
    }

    if (segment.parentWallId !== wall.id) {
      problems.push(
        `Segment ${segment.id} is listed on wall ${wall.id} but references parent ${segment.parentWallId}.`,
      );
    }
  }

  for (const segment of segmentsById.values()) {
    if (
      segment.parentWallId === wall.id &&
      !wall.segmentIds.includes(segment.id)
    ) {
      problems.push(
        `Segment ${segment.id} references wall ${wall.id} but is not listed on the wall.`,
      );
    }
  }

  if (problems.length === 0) {
    return buildPassedBatch(
      ruleId,
      "relationship",
      target,
      `Wall ${wall.id} segment relationships are consistent.`,
      collectEvidenceIds(wall),
    );
  }

  const quantityImpacts = [
    {
      quantityKey: WALL_QUANTITY_KEYS.studs,
      description: "Inconsistent segments prevent reliable stud takeoff.",
      canCalculate: false,
    },
    {
      quantityKey: WALL_QUANTITY_KEYS.plates,
      description: "Inconsistent segments prevent reliable plate takeoff.",
      canCalculate: false,
    },
  ];

  const explanation = problems.join(" ");

  return buildFailedBatch(
    {
      ruleId,
      level: "relationship",
      severity: "critical",
      ruleViolated: "Wall and segment relationships must be consistent.",
      explanation,
      target,
      recommendedUserAction:
        "Reconcile wall segment IDs and parent wall references.",
      evidenceIds: collectEvidenceIds(wall),
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Reconcile segments for wall ${wall.id}`,
      description: explanation,
      action: {
        type: "provide-value",
        instruction:
          "Confirm which segments belong to this wall before quantities are calculated.",
        targetProperty: "segmentIds",
      },
      reviewStatus: "review-required",
      blockingStatus: "blocked",
      affectedObjects: [{ objectId: wall.id, objectType: wall.objectType }],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds: collectEvidenceIds(wall),
    },
  );
}

function validateWallTypeResolved(wall: BuildingWall): ValidationBatch {
  const target = createObjectTarget(wall.id, wall.objectType);
  const ruleId = WALL_FRAMING_RULE_IDS.typeResolved;

  if (wall.wallType !== null) {
    return buildPassedBatch(
      ruleId,
      "object",
      target,
      `Wall ${wall.id} has a resolved wall type.`,
      collectEvidenceIds(wall),
    );
  }

  const quantityImpacts = [
    {
      quantityKey: WALL_QUANTITY_KEYS.studs,
      description: "Stud size and spacing depend on the wall type.",
      canCalculate: false,
    },
    {
      quantityKey: WALL_QUANTITY_KEYS.plates,
      description: "Plate sizing depends on the wall type.",
      canCalculate: false,
    },
  ];

  return buildFailedBatch(
    {
      ruleId,
      level: "object",
      severity: "critical",
      ruleViolated: "Wall type must be resolved before material takeoff.",
      explanation: `Wall ${wall.id} (${wall.name}) has no resolved wall type.`,
      target,
      recommendedUserAction:
        "Confirm the wall assembly type from plans or schedules.",
      evidenceIds: collectEvidenceIds(wall),
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Resolve wall type for ${wall.name}`,
      description: `Wall ${wall.id} (${wall.name}) has no resolved wall type.`,
      action: {
        type: "provide-value",
        instruction: "Provide the resolved wall type for this wall.",
        targetProperty: "wallType",
      },
      reviewStatus: "review-required",
      blockingStatus: "blocked",
      affectedObjects: [{ objectId: wall.id, objectType: wall.objectType }],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds: collectEvidenceIds(wall),
    },
  );
}

function validateWallHeightResolved(wall: BuildingWall): ValidationBatch {
  const target = createObjectTarget(wall.id, wall.objectType);
  const ruleId = WALL_FRAMING_RULE_IDS.heightResolved;

  if (
    wall.assembly.heightFeet !== null ||
    isPropertyResolved(wall.resolutionTraces, "assembly.heightFeet")
  ) {
    return buildPassedBatch(
      ruleId,
      "object",
      target,
      `Wall ${wall.id} has a resolved wall height.`,
      collectEvidenceIds(wall),
    );
  }

  const quantityImpacts = [
    {
      quantityKey: WALL_QUANTITY_KEYS.studs,
      description:
        "Stud counts along the wall run may still be calculated without height.",
      canCalculate: true,
    },
    {
      quantityKey: WALL_QUANTITY_KEYS.plates,
      description:
        "Plate linear feet along the wall run may still be calculated without height.",
      canCalculate: true,
    },
    {
      quantityKey: WALL_QUANTITY_KEYS.sheathing,
      description: "Wall sheathing area requires resolved wall height.",
      canCalculate: false,
    },
  ];

  return buildFailedBatch(
    {
      ruleId,
      level: "object",
      severity: "warning",
      ruleViolated: "Wall height must be resolved or assumed.",
      explanation: `Wall ${wall.id} (${wall.name}) has no resolved wall height.`,
      target,
      recommendedUserAction:
        "Confirm the wall height from plans, sections, or an approved assumption.",
      evidenceIds: collectEvidenceIds(wall),
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Resolve wall height for ${wall.name}`,
      description: `Wall ${wall.id} (${wall.name}) has no resolved wall height.`,
      action: {
        type: "provide-value",
        instruction: "Provide the resolved wall height for this wall.",
        targetProperty: "assembly.heightFeet",
      },
      reviewStatus: "review-required",
      blockingStatus: "partially-blocked",
      affectedObjects: [{ objectId: wall.id, objectType: wall.objectType }],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds: collectEvidenceIds(wall),
    },
  );
}

function validateSegmentLengthResolved(segment: WallSegment): ValidationBatch {
  const target = createObjectTarget(segment.id, segment.objectType);
  const ruleId = WALL_FRAMING_RULE_IDS.geometryLengthResolved;

  if (
    segment.lengthFeet !== null ||
    isPropertyResolved(segment.resolutionTraces, "lengthFeet")
  ) {
    return buildPassedBatch(
      ruleId,
      "calculation",
      target,
      `Segment ${segment.id} has a resolved length.`,
      collectEvidenceIds(segment),
    );
  }

  const quantityImpacts = [
    {
      quantityKey: WALL_QUANTITY_KEYS.studs,
      description: "Stud quantities require a resolved segment length.",
      canCalculate: false,
    },
    {
      quantityKey: WALL_QUANTITY_KEYS.plates,
      description: "Plate quantities require a resolved segment length.",
      canCalculate: false,
    },
  ];

  return buildFailedBatch(
    {
      ruleId,
      level: "calculation",
      severity: "blocking",
      ruleViolated: "Wall segment length must be resolved for measured takeoff.",
      explanation: `Segment ${segment.id} has no resolved length.`,
      target,
      recommendedUserAction:
        "Confirm the segment length from plan geometry or an approved assumption.",
      evidenceIds: collectEvidenceIds(segment),
      quantityImpacts,
    },
    {
      ruleId,
      target,
      title: `Resolve length for segment ${segment.id}`,
      description: `Segment ${segment.id} has no resolved length.`,
      action: {
        type: "provide-value",
        instruction:
          "Provide the resolved segment length before takeoff continues.",
        targetProperty: "lengthFeet",
      },
      reviewStatus: "review-required",
      blockingStatus: "blocked",
      affectedObjects: [{ objectId: segment.id, objectType: segment.objectType }],
      quantityImpacts: toReviewQuantityImpacts(quantityImpacts),
      evidenceIds: collectEvidenceIds(segment),
    },
  );
}

function validateWallLocationResolved(wall: BuildingWall): ValidationBatch {
  const target = createObjectTarget(wall.id, wall.objectType);
  const ruleId = WALL_FRAMING_RULE_IDS.locationResolved;

  if (wall.location !== "unknown") {
    return buildPassedBatch(
      ruleId,
      "object",
      target,
      `Wall ${wall.id} has a resolved location classification.`,
      collectEvidenceIds(wall),
    );
  }

  const explanation = `Wall ${wall.id} (${wall.name}) has unresolved location classification.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "object",
      severity: "warning",
      ruleViolated: "Wall interior/exterior classification must be supported.",
      explanation,
      target,
      recommendedUserAction:
        "Confirm whether this wall is interior or exterior.",
      evidenceIds: collectEvidenceIds(wall),
    },
    {
      ruleId,
      target,
      title: `Resolve location for ${wall.name}`,
      description: explanation,
      action: {
        type: "confirm",
        instruction:
          "Confirm the interior or exterior classification for this wall.",
        targetProperty: "location",
      },
      reviewStatus: "review-recommended",
      blockingStatus: "not-blocked",
      affectedObjects: [{ objectId: wall.id, objectType: wall.objectType }],
      evidenceIds: collectEvidenceIds(wall),
    },
  );
}

function validateWallBearingResolved(wall: BuildingWall): ValidationBatch {
  const target = createObjectTarget(wall.id, wall.objectType);
  const ruleId = WALL_FRAMING_RULE_IDS.bearingResolved;

  if (wall.bearingStatus !== "unknown") {
    return buildPassedBatch(
      ruleId,
      "object",
      target,
      `Wall ${wall.id} has a resolved bearing classification.`,
      collectEvidenceIds(wall),
    );
  }

  const explanation = `Wall ${wall.id} (${wall.name}) has unresolved bearing classification.`;

  return buildFailedBatch(
    {
      ruleId,
      level: "object",
      severity: "warning",
      ruleViolated: "Wall bearing classification must be supported.",
      explanation,
      target,
      recommendedUserAction:
        "Confirm whether this wall is bearing or non-bearing.",
      evidenceIds: collectEvidenceIds(wall),
    },
    {
      ruleId,
      target,
      title: `Resolve bearing status for ${wall.name}`,
      description: explanation,
      action: {
        type: "confirm",
        instruction: "Confirm the bearing classification for this wall.",
        targetProperty: "bearingStatus",
      },
      reviewStatus: "review-recommended",
      blockingStatus: "not-blocked",
      affectedObjects: [{ objectId: wall.id, objectType: wall.objectType }],
      evidenceIds: collectEvidenceIds(wall),
    },
  );
}

export function validateWallFraming(
  payload: WallFramingPayload,
): ValidationBatch {
  const wallsById = new Map(payload.walls.map((wall) => [wall.id, wall]));
  const segmentsById = new Map(
    payload.segments.map((segment) => [segment.id, segment]),
  );

  const batches: ValidationBatch[] = [];

  for (const segment of payload.segments) {
    batches.push(validateSegmentParentResolved(segment, wallsById));
    batches.push(validateSegmentLengthResolved(segment));
  }

  for (const wall of payload.walls) {
    batches.push(validateWallSegmentsConsistent(wall, segmentsById));
    batches.push(validateWallTypeResolved(wall));
    batches.push(validateWallHeightResolved(wall));
    batches.push(validateWallLocationResolved(wall));
    batches.push(validateWallBearingResolved(wall));
  }

  return mergeValidationBatches(...batches);
}
