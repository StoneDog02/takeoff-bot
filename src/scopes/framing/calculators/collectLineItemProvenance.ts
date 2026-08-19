import type {
  AssumptionId,
  ObjectId,
  ReviewItemId,
} from "../../../core/schemas/identity.schema.js";
import type { PropertyResolutionTrace } from "../../../core/schemas/resolved-object.schema.js";

export type ProvenanceSource = {
  id: ObjectId;
  assumptionIds: AssumptionId[];
  reviewItemIds: ReviewItemId[];
  resolutionTraces: PropertyResolutionTrace[];
};

function uniqueSortedIds<T extends string>(ids: readonly T[]): T[] {
  return [...new Set(ids)].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
}

/**
 * Copies source object IDs and applicable assumption/review IDs already
 * present on contributing objects and the property traces used to calculate.
 */
export function collectLineItemProvenance(
  sourceObjects: readonly ProvenanceSource[],
  usedPropertyPaths: readonly string[],
): {
  sourceObjectIds: ObjectId[];
  assumptionIds: AssumptionId[];
  reviewItemIds: ReviewItemId[];
} {
  const usedPathSet = new Set(usedPropertyPaths);
  const usedTraces = sourceObjects.flatMap((object) =>
    object.resolutionTraces.filter((trace) =>
      usedPathSet.has(trace.propertyPath),
    ),
  );

  return {
    sourceObjectIds: sourceObjects.map((object) => object.id),
    assumptionIds: uniqueSortedIds([
      ...sourceObjects.flatMap((object) => object.assumptionIds),
      ...usedTraces.flatMap((trace) => trace.assumptionIds),
    ]),
    reviewItemIds: uniqueSortedIds([
      ...sourceObjects.flatMap((object) => object.reviewItemIds),
      ...usedTraces.flatMap((trace) => trace.reviewItemIds),
    ]),
  };
}
