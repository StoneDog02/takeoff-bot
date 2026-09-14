import { assumptionSchema, type Assumption } from "../../core/schemas/assumption.schema.js";
import type {
  AssumptionId,
  ObjectId,
} from "../../core/schemas/identity.schema.js";
import { OPENING_QUANTITY_KEYS } from "../validators/rule-ids.js";

/**
 * V1 Spec assumption rule ID for window sill material.
 * @see docs/product/V1_FRAMING_INTELLIGENCE_SPEC.md §15.5, §19
 */
const WALL_ASSUME_006 = "WALL-ASSUME-006";

export function createOpeningRoughSillSizeAssumptionId(
  openingId: ObjectId,
): AssumptionId {
  return `A-${WALL_ASSUME_006}-roughSillSize-object-${openingId}` as AssumptionId;
}

/**
 * WALL-ASSUME-006 — Window Sill Material.
 *
 * Ordinary conventional window framing: sill dimensional size follows
 * resolved wall stud size.
 *
 * Created at calculation time when explicit sill size evidence is absent
 * and eligibility evaluation returns "eligible".
 *
 * @see docs/product/V1_FRAMING_INTELLIGENCE_SPEC.md §15.5, §19
 */
export function createOpeningRoughSillSizeAssumption(
  openingId: ObjectId,
  wallStudSize: string,
): Assumption {
  return assumptionSchema.parse({
    id: createOpeningRoughSillSizeAssumptionId(openingId),
    category: "industry-default",
    target: {
      objectId: openingId,
      objectType: "opening",
      propertyPath: "roughSillSize",
    },
    assumedValue: wallStudSize,
    source: {
      type: "construction-brain",
      reference: `${WALL_ASSUME_006}: knowledge/framing/13-opening-wall-framing-calculations.md`,
      explanation:
        `${WALL_ASSUME_006} — Window Sill Material. Sill dimensional size follows resolved wall stud size for ordinary conventional window framing.`,
    },
    reasonUsed:
      "No explicit rough sill size was resolved for this window opening from project evidence.",
    materialImpact: {
      level: "medium",
      explanation:
        "Rough sill size affects opening wall framing lumber takeoff linear footage classification.",
      affectedQuantityKeys: [OPENING_QUANTITY_KEYS.roughSill],
    },
    riskLevel: "medium",
    reviewRequired: true,
  });
}
