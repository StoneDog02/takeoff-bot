import type { ObjectId } from "../../core/schemas/identity.schema.js";

function normalizeSegment(value: string): string {
  return value.replaceAll(".", "-");
}

/**
 * Stable material line-item identity derived from quantity key and source object.
 */
export function createMaterialLineItemId(
  quantityKey: string,
  objectId: ObjectId,
): string {
  return `MAT-${normalizeSegment(quantityKey)}-object-${objectId}`;
}
