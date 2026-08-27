import type {
  ConnectorsHardwarePayload,
  ValidationPayload,
} from "../schemas/framing-artifacts.schema.js";
import type { Fastener } from "../schemas/connectors-hardware.schema.js";
import {
  framingMaterialLineItemSchema,
  type FramingMaterialLineItem,
} from "../schemas/material.schema.js";
import { CONNECTORS_HARDWARE_QUANTITY_KEYS } from "../validators/rule-ids.js";
import { collectLineItemProvenance } from "./collectLineItemProvenance.js";
import { createMaterialLineItemId } from "./ids.js";
import { isQuantityBlocked } from "./isQuantityBlocked.js";
import { isQuantityInputResolved } from "./isQuantityInputResolved.js";

const TYPE_PROPERTY_PATH = "fastenerType";
const QUANTITY_PROPERTY_PATH = "quantity";
const DIAMETER_PROPERTY_PATH = "diameter";
const LENGTH_PROPERTY_PATH = "length";
const COATING_PROPERTY_PATH = "coating";

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replaceAll(/\s+/g, "-");
}

function emitLineItem(
  item: FramingMaterialLineItem,
): FramingMaterialLineItem | null {
  if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
    return null;
  }

  return framingMaterialLineItemSchema.parse(item);
}

function optionalDescriptor(
  fastener: Fastener,
  propertyPath: string,
  value: string | null,
): string | null {
  if (!isQuantityInputResolved(value, fastener.resolutionTraces, propertyPath)) {
    return null;
  }

  return value;
}

function calculateFastenerQuantity(
  fastener: Fastener,
  validation: ValidationPayload | undefined,
): FramingMaterialLineItem | null {
  if (
    isQuantityBlocked(
      validation,
      [fastener.id],
      CONNECTORS_HARDWARE_QUANTITY_KEYS.fastenerMaterial,
    )
  ) {
    return null;
  }

  if (
    !isQuantityInputResolved(
      fastener.fastenerType,
      fastener.resolutionTraces,
      TYPE_PROPERTY_PATH,
    ) ||
    normalizeToken(fastener.fastenerType) === "unknown" ||
    !isQuantityInputResolved(
      fastener.quantity,
      fastener.resolutionTraces,
      QUANTITY_PROPERTY_PATH,
    )
  ) {
    return null;
  }

  const usedPropertyPaths = [TYPE_PROPERTY_PATH, QUANTITY_PROPERTY_PATH];
  const diameter = optionalDescriptor(
    fastener,
    DIAMETER_PROPERTY_PATH,
    fastener.diameter,
  );
  const length = optionalDescriptor(
    fastener,
    LENGTH_PROPERTY_PATH,
    fastener.length,
  );
  const coating = optionalDescriptor(
    fastener,
    COATING_PROPERTY_PATH,
    fastener.coating,
  );

  if (diameter) {
    usedPropertyPaths.push(DIAMETER_PROPERTY_PATH);
  }
  if (length) {
    usedPropertyPaths.push(LENGTH_PROPERTY_PATH);
  }
  if (coating) {
    usedPropertyPaths.push(COATING_PROPERTY_PATH);
  }

  const descriptionParts = [diameter, length, coating, fastener.fastenerType]
    .filter((segment) => segment !== null);
  const classificationParts = [
    fastener.fastenerType,
    diameter,
    length,
    coating,
  ].filter((segment) => segment !== null);
  const provenance = collectLineItemProvenance([fastener], usedPropertyPaths);

  return emitLineItem({
    id: createMaterialLineItemId(
      CONNECTORS_HARDWARE_QUANTITY_KEYS.fastenerMaterial,
      fastener.id,
    ),
    quantityKey: CONNECTORS_HARDWARE_QUANTITY_KEYS.fastenerMaterial,
    category: "fastener",
    description: descriptionParts.join(" "),
    canonicalClassification: classificationParts.join("-"),
    quantity: fastener.quantity,
    unit: "each",
    sourceObjectIds: provenance.sourceObjectIds,
    assumptionIds: provenance.assumptionIds,
    reviewItemIds: provenance.reviewItemIds,
  });
}

/**
 * Emits specified fastener quantities already resolved onto Fastener objects.
 *
 * Quantity semantics: `knowledge/framing/09-material-taxonomy.md`.
 * Does not infer nailing schedules, scale by associated objects, or
 * produce Connector or Hardware quantities.
 */
export function calculateFasteners(
  connectorsHardware: ConnectorsHardwarePayload,
  validation?: ValidationPayload,
): FramingMaterialLineItem[] {
  const fasteners = [...connectorsHardware.fasteners].sort((left, right) =>
    compareIds(left.id, right.id),
  );
  const materials: FramingMaterialLineItem[] = [];

  for (const fastener of fasteners) {
    const lineItem = calculateFastenerQuantity(fastener, validation);
    if (lineItem) {
      materials.push(lineItem);
    }
  }

  return materials;
}
