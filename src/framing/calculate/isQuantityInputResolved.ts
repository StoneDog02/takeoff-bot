import type { PropertyResolutionTrace } from "../../core/schemas/resolved-object.schema.js";

/**
 * A quantity input is calculable when it has a present value and is not
 * explicitly marked unresolved. Missing traces do not block a present value.
 */
export function isQuantityInputResolved<T>(
  value: T | null | undefined,
  traces: readonly PropertyResolutionTrace[],
  propertyPath: string,
): value is NonNullable<T> {
  if (value === null || value === undefined) {
    return false;
  }

  const trace = traces.find((entry) => entry.propertyPath === propertyPath);
  if (trace?.method === "unresolved") {
    return false;
  }

  return true;
}
