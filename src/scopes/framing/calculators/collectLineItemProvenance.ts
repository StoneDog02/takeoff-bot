import type {
  AssumptionId,
  ObjectId,
} from "../../../core/schemas/identity.schema.js";
import type { PropertyResolutionTrace } from "../../../core/schemas/resolved-object.schema.js";

export type ProvenanceSource = {
  id: ObjectId;
  resolutionTraces: PropertyResolutionTrace[];
};

function uniqueSortedIds<T extends string>(ids: readonly T[]): T[] {
  return [...new Set(ids)].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
}

/**
 * Copies source object IDs and assumption IDs from the property traces
 * used to calculate a quantity.
 */
export function collectLineItemProvenance(
  sourceObjects: readonly ProvenanceSource[],
  usedPropertyPaths: readonly string[],
): {
  sourceObjectIds: ObjectId[];
  assumptionIds: AssumptionId[];
} {
  const usedPathSet = new Set(usedPropertyPaths);
  const usedTraces = sourceObjects.flatMap((object) =>
    object.resolutionTraces.filter((trace) =>
      usedPathSet.has(trace.propertyPath),
    ),
  );

  return {
    sourceObjectIds: sourceObjects.map((object) => object.id),
    assumptionIds: uniqueSortedIds(
      usedTraces.flatMap((trace) => trace.assumptionIds),
    ),
  };
}
