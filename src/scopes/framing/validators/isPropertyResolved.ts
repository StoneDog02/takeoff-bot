import type { PropertyResolutionTrace } from "../../../core/schemas/resolved-object.schema.js";

export function isPropertyResolved(
  traces: PropertyResolutionTrace[],
  propertyPath: string,
): boolean {
  const trace = traces.find((entry) => entry.propertyPath === propertyPath);
  if (!trace) {
    return false;
  }

  return trace.method !== "unresolved";
}
