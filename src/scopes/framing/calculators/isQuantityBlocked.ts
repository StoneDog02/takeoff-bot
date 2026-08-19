import type { ObjectId } from "../../../core/schemas/identity.schema.js";
import type { ValidationPayload } from "../schemas/framing-artifacts.schema.js";

/**
 * Honors Validation quantity blocks when a Validation payload is supplied.
 * Unrelated issues and calculable impacts do not suppress quantities.
 */
export function isQuantityBlocked(
  validation: ValidationPayload | undefined,
  objectIds: readonly ObjectId[],
  quantityKey: string,
): boolean {
  if (!validation) {
    return false;
  }

  const objectIdSet = new Set<string>(objectIds);

  return validation.validationIssues.some((issue) => {
    if (issue.target.kind !== "object") {
      return false;
    }

    if (!objectIdSet.has(issue.target.objectId)) {
      return false;
    }

    return issue.quantityImpacts.some(
      (impact) =>
        impact.quantityKey === quantityKey && impact.canCalculate === false,
    );
  });
}
