import type { Assumption } from "../../core/schemas/assumption.schema.js";
import type { ObjectId } from "../../core/schemas/identity.schema.js";
import { identifierSchema } from "../../core/schemas/identity.schema.js";
import type { Opening } from "../schemas/opening.schema.js";
import {
  reviewRecordSchema,
  unresolvedRecordSchema,
  type ReviewRecord,
  type UnresolvedRecord,
} from "../schemas/honesty-records.schema.js";
import {
  framingConstructionSchema,
  type FramingConstruction,
} from "../schemas/framingConstruction.schema.js";
import {
  ASSUMPTION_RULE_IDS,
  HONESTY_RULE_IDS,
} from "../validators/rule-ids.js";
import { collectConstructionBagObjects } from "./assignCanonicalPhysicalIds.js";

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sanitizeIdPart(value: string): string {
  return value.replace(/[^A-Za-z0-9._:-]/g, "-");
}

function honestyRecordId(prefix: "UR" | "RV", ...parts: string[]): string {
  return identifierSchema.parse(
    [prefix, ...parts.map(sanitizeIdPart)].join("-"),
  );
}

function objectPhysicalId(
  construction: FramingConstruction,
  objectId: ObjectId,
): ObjectId {
  const match = collectConstructionBagObjects(construction).find(
    (object) => object.id === objectId,
  );
  return match?.physicalId ?? objectId;
}

export function createJackStudCountUnresolved(
  opening: Opening,
): UnresolvedRecord {
  const physicalId = opening.physicalId ?? opening.id;
  return unresolvedRecordSchema.parse({
    id: honestyRecordId("UR", physicalId, "jackStudCount"),
    physicalId,
    propertyPath: "jackStudCount",
    reasonCode: HONESTY_RULE_IDS.jackStudCountUnresolved,
    diagnosticFamily: "READ_GAP",
    explanation:
      "Opening is eligible for jack studs but jackStudCount is not established; no quantity is invented from opening width.",
  });
}

function createSystemLevelUnresolved(
  physicalId: ObjectId,
  objectType:
    | "floor-framing-system"
    | "roof-framing-system"
    | "sheathing-system",
  reasonCode: string,
): UnresolvedRecord {
  return unresolvedRecordSchema.parse({
    id: honestyRecordId("UR", physicalId, "level"),
    physicalId,
    propertyPath: "level",
    reasonCode,
    diagnosticFamily: "READ_GAP",
    explanation: `${objectType} level is required and was not established from project evidence.`,
  });
}

export function collectRequiredLevelUnresolved(
  construction: FramingConstruction,
): UnresolvedRecord[] {
  const records: UnresolvedRecord[] = [];

  for (const system of construction.floorFraming.systems) {
    if (system.level !== null) {
      continue;
    }
    records.push(
      createSystemLevelUnresolved(
        system.physicalId ?? system.id,
        "floor-framing-system",
        HONESTY_RULE_IDS.floorSystemLevelUnresolved,
      ),
    );
  }

  for (const system of construction.roofFraming.systems) {
    if (system.level !== null) {
      continue;
    }
    records.push(
      createSystemLevelUnresolved(
        system.physicalId ?? system.id,
        "roof-framing-system",
        HONESTY_RULE_IDS.roofSystemLevelUnresolved,
      ),
    );
  }

  for (const system of construction.sheathing.systems) {
    if (system.level !== null) {
      continue;
    }
    records.push(
      createSystemLevelUnresolved(
        system.physicalId ?? system.id,
        "sheathing-system",
        HONESTY_RULE_IDS.sheathingSystemLevelUnresolved,
      ),
    );
  }

  return records.sort((left, right) => compareIds(left.id, right.id));
}

export function attachRequiredLevelUnresolved(
  construction: FramingConstruction,
): FramingConstruction {
  return framingConstructionSchema.parse({
    ...construction,
    unresolved: mergeUnresolvedRecords(
      construction.unresolved ?? [],
      collectRequiredLevelUnresolved(construction),
    ),
    reviews: construction.reviews ?? [],
  });
}

export function reviewsFromAssumptions(
  assumptions: readonly Assumption[],
  construction: FramingConstruction,
): ReviewRecord[] {
  const reviews: ReviewRecord[] = [];

  for (const assumption of assumptions) {
    if (!assumption.reviewRequired) {
      continue;
    }

    const physicalId = objectPhysicalId(
      construction,
      assumption.target.objectId,
    );
    reviews.push(
      reviewRecordSchema.parse({
        id: honestyRecordId("RV", assumption.id),
        physicalId,
        propertyPath: assumption.target.propertyPath,
        reasonCode: ASSUMPTION_RULE_IDS.reviewRequired,
        assumptionId: assumption.id,
        assumedValue: assumption.assumedValue,
        status: "open",
        explanation: assumption.reasonUsed,
      }),
    );
  }

  return reviews.sort((left, right) => compareIds(left.id, right.id));
}

export function mergeUnresolvedRecords(
  ...groups: ReadonlyArray<readonly UnresolvedRecord[]>
): UnresolvedRecord[] {
  const byId = new Map<string, UnresolvedRecord>();
  for (const group of groups) {
    for (const record of group) {
      byId.set(record.id, record);
    }
  }
  return [...byId.values()].sort((left, right) => compareIds(left.id, right.id));
}

export function mergeReviewRecords(
  ...groups: ReadonlyArray<readonly ReviewRecord[]>
): ReviewRecord[] {
  const byId = new Map<string, ReviewRecord>();
  for (const group of groups) {
    for (const record of group) {
      byId.set(record.id, record);
    }
  }
  return [...byId.values()].sort((left, right) => compareIds(left.id, right.id));
}
