import { assumptionSchema, type Assumption } from "../../core/schemas/assumption.schema.js";
import type {
  AssumptionId,
  ObjectId,
} from "../../core/schemas/identity.schema.js";
import { OPENING_QUANTITY_KEYS } from "../validators/rule-ids.js";

export function createOpeningRoughSillSizeAssumptionId(
  openingId: ObjectId,
): AssumptionId {
  return `A-opening-roughSillSize-default-object-${openingId}` as AssumptionId;
}

/**
 * Industry-default rough sill size assumption for one window opening.
 *
 * Created at calculation time when explicit sill size evidence is absent.
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
      reference: "knowledge/framing/13-opening-wall-framing-calculations.md",
      explanation:
        "Industry default rough sill size inherits wall stud size when explicit sill size is absent.",
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
