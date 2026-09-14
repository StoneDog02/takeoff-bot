import { assumptionSchema, type Assumption } from "../../core/schemas/assumption.schema.js";
import type {
  AssumptionId,
  ObjectId,
} from "../../core/schemas/identity.schema.js";
import { OPENING_QUANTITY_KEYS } from "../validators/rule-ids.js";

const KING_STUD_COUNT_DEFAULT = 2;

/**
 * V1 Spec assumption rule ID for king stud fallback.
 * @see docs/product/V1_FRAMING_INTELLIGENCE_SPEC.md §15.5, §19
 */
const WALL_ASSUME_005 = "WALL-ASSUME-005";

export function createOpeningKingStudCountAssumptionId(
  openingId: ObjectId,
): AssumptionId {
  return `A-${WALL_ASSUME_005}-kingStudCount-object-${openingId}` as AssumptionId;
}

/**
 * WALL-ASSUME-005 — Conventional King Stud Fallback.
 *
 * Ordinary eligible opening with no stronger project/prescriptive
 * full-height support requirement: minimum one king/full-height stud per side.
 * Must yield to any applicable header/full-height rule.
 *
 * Created at calculation time when explicit king stud count evidence is absent
 * and eligibility evaluation returns "eligible".
 *
 * @see docs/product/V1_FRAMING_INTELLIGENCE_SPEC.md §15.5, §19, §21
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
      reference: `${WALL_ASSUME_005}: knowledge/framing/13-opening-wall-framing-calculations.md`,
      explanation:
        `${WALL_ASSUME_005} — Conventional King Stud Fallback. Minimum one king/full-height stud per side for ordinary eligible opening.`,
    },
    reasonUsed:
      "No explicit king stud count was resolved for this opening from project evidence. Ordinary opening eligibility confirmed.",
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
