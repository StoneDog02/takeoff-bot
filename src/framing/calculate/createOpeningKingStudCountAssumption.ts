import { assumptionSchema, type Assumption } from "../../core/schemas/assumption.schema.js";
import type {
  AssumptionId,
  ObjectId,
} from "../../core/schemas/identity.schema.js";
import { OPENING_QUANTITY_KEYS } from "../validators/rule-ids.js";

const KING_STUD_COUNT_DEFAULT = 2;

export function createOpeningKingStudCountAssumptionId(
  openingId: ObjectId,
): AssumptionId {
  return `A-opening-kingStudCount-default-object-${openingId}` as AssumptionId;
}

/**
 * Industry-default king stud count assumption for one opening.
 *
 * Created at calculation time when explicit king stud count evidence is absent.
 */
export function createOpeningKingStudCountAssumption(
  openingId: ObjectId,
): Assumption {
  return assumptionSchema.parse({
    id: createOpeningKingStudCountAssumptionId(openingId),
    category: "industry-default",
    target: {
      objectId: openingId,
      objectType: "opening",
      propertyPath: "kingStudCount",
    },
    assumedValue: KING_STUD_COUNT_DEFAULT,
    source: {
      type: "construction-brain",
      reference: "knowledge/framing/13-opening-wall-framing-calculations.md",
      explanation:
        "Industry default king stud count per opening when explicit count is absent.",
    },
    reasonUsed:
      "No explicit king stud count was resolved for this opening from project evidence.",
    materialImpact: {
      level: "medium",
      explanation:
        "King stud each count affects opening wall framing lumber takeoff.",
      affectedQuantityKeys: [OPENING_QUANTITY_KEYS.kingStuds],
    },
    riskLevel: "medium",
    reviewRequired: true,
  });
}

export { KING_STUD_COUNT_DEFAULT };
