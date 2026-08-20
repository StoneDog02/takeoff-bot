import { assumptionSchema, type Assumption } from "../../../core/schemas/assumption.schema.js";
import type {
  AssumptionId,
  ObjectId,
  ReviewItemId,
} from "../../../core/schemas/identity.schema.js";
import { OPENING_QUANTITY_KEYS } from "../validators/rule-ids.js";

export function createOpeningCrippleLayoutAssumptionId(
  openingId: ObjectId,
): AssumptionId {
  return `A-opening-crippleLayout-default-object-${openingId}` as AssumptionId;
}

/**
 * Industry-default cripple layout assumption for one opening.
 *
 * Created when cripple stud counts use the layout-continuation formula from
 * `13-opening-wall-framing-calculations.md`.
 */
export function createOpeningCrippleLayoutAssumption(
  openingId: ObjectId,
  reviewItemId: ReviewItemId,
  affectedQuantityKeys: readonly string[],
): Assumption {
  return assumptionSchema.parse({
    id: createOpeningCrippleLayoutAssumptionId(openingId),
    category: "industry-default",
    target: {
      objectId: openingId,
      objectType: "opening",
      propertyPath: "crippleStudLayout",
    },
    assumedValue: "layout-continuation-from-rough-width",
    source: {
      type: "construction-brain",
      reference: "knowledge/framing/13-opening-wall-framing-calculations.md",
      explanation:
        "Cripple stud count uses wall stud spacing layout continuation between king studs when explicit cripple count evidence is absent.",
    },
    reasonUsed:
      "No explicit cripple stud count was resolved; layout continuation from rough opening width and wall stud spacing applies.",
    materialImpact: {
      level: "medium",
      explanation:
        "Cripple stud each count affects opening wall framing lumber takeoff.",
      affectedQuantityKeys: [...affectedQuantityKeys],
    },
    riskLevel: "medium",
    userEditable: true,
    reviewRequired: true,
    confidenceImpact: {
      level: "minor",
      explanation:
        "Layout-continuation cripple counts are common practice but not project-specific detail evidence.",
    },
    evidenceIds: [],
    reviewItemIds: [reviewItemId],
    status: "active",
    userDecisionId: null,
  });
}
