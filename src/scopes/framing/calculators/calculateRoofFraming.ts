import type {
  RoofFramingPayload,
  ValidationPayload,
} from "../schemas/framing-artifacts.schema.js";
import {
  framingMaterialLineItemSchema,
  type FramingMaterialLineItem,
} from "../schemas/material.schema.js";
import type {
  RoofFramingSystem,
  RoofPlane,
} from "../schemas/roof-framing.schema.js";
import { isStickCommonRafterFramingType } from "../resolvers/roofFramingPropertyPaths.js";
import { ROOF_QUANTITY_KEYS } from "../validators/rule-ids.js";
import { collectLineItemProvenance } from "./collectLineItemProvenance.js";
import { createMaterialLineItemId } from "./ids.js";
import { isQuantityBlocked } from "./isQuantityBlocked.js";
import { isQuantityInputResolved } from "./isQuantityInputResolved.js";

const LAYOUT_LENGTH_PROPERTY_PATH = "rafterLayoutLengthFeet";
const SPAN_DIRECTION_PROPERTY_PATH = "spanDirection";
const MEMBER_SPACING_PROPERTY_PATH = "assembly.memberSpacingInches";
const MEMBER_SIZE_PROPERTY_PATH = "assembly.memberSize";
const FRAMING_TYPE_PROPERTY_PATH = "assembly.framingType";

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replaceAll(/\s+/g, "-");
}

/**
 * Baseline regularly spaced common-rafter count for one Roof Plane.
 *
 * Formula: `knowledge/framing/15-roof-framing-calculations.md`.
 */
export function countRegularlySpacedCommonRafters(
  rafterLayoutLengthFeet: number,
  memberSpacingInches: number,
): number {
  return Math.ceil((rafterLayoutLengthFeet * 12) / memberSpacingInches) + 1;
}

function emitLineItem(
  item: FramingMaterialLineItem,
): FramingMaterialLineItem | null {
  if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
    return null;
  }

  return framingMaterialLineItemSchema.parse(item);
}

function calculatePlaneCommonRafters(
  system: RoofFramingSystem,
  plane: RoofPlane,
  validation: ValidationPayload | undefined,
): FramingMaterialLineItem | null {
  const quantityKey = ROOF_QUANTITY_KEYS.commonRafters;
  const contributingIds = [system.id, plane.id];

  if (isQuantityBlocked(validation, contributingIds, quantityKey)) {
    return null;
  }

  if (
    !isQuantityInputResolved(
      plane.rafterLayoutLengthFeet,
      plane.resolutionTraces,
      LAYOUT_LENGTH_PROPERTY_PATH,
    ) ||
    !isQuantityInputResolved(
      plane.spanDirection,
      plane.resolutionTraces,
      SPAN_DIRECTION_PROPERTY_PATH,
    ) ||
    !isQuantityInputResolved(
      system.assembly.memberSpacingInches,
      system.resolutionTraces,
      MEMBER_SPACING_PROPERTY_PATH,
    ) ||
    !isQuantityInputResolved(
      system.assembly.memberSize,
      system.resolutionTraces,
      MEMBER_SIZE_PROPERTY_PATH,
    ) ||
    !isQuantityInputResolved(
      system.assembly.framingType,
      system.resolutionTraces,
      FRAMING_TYPE_PROPERTY_PATH,
    )
  ) {
    return null;
  }

  if (!isStickCommonRafterFramingType(system.assembly.framingType)) {
    return null;
  }

  const memberSize = system.assembly.memberSize;
  const framingType = system.assembly.framingType;
  const quantity = countRegularlySpacedCommonRafters(
    plane.rafterLayoutLengthFeet,
    system.assembly.memberSpacingInches,
  );

  const provenance = collectLineItemProvenance(
    [system, plane],
    [
      LAYOUT_LENGTH_PROPERTY_PATH,
      SPAN_DIRECTION_PROPERTY_PATH,
      MEMBER_SPACING_PROPERTY_PATH,
      MEMBER_SIZE_PROPERTY_PATH,
      FRAMING_TYPE_PROPERTY_PATH,
    ],
  );

  return emitLineItem({
    id: createMaterialLineItemId(quantityKey, plane.id),
    category: "lumber",
    description: `${memberSize} common rafters`,
    canonicalClassification: `common-rafter-${normalizeToken(framingType)}-${normalizeToken(memberSize)}`,
    quantity,
    unit: "each",
    sourceObjectIds: provenance.sourceObjectIds,
    assumptionIds: provenance.assumptionIds,
    reviewItemIds: provenance.reviewItemIds,
  });
}

/**
 * Calculates Roof Framing quantities from resolved Roof artifacts.
 *
 * Authorized quantity: baseline regularly spaced common-rafter count (`each`)
 * per `knowledge/framing/15-roof-framing-calculations.md`.
 *
 * Does not emit rafter LF, ridge, hip/valley/jack, openings, fascia, blocking,
 * trusses, or sheathing.
 */
export function calculateRoofFraming(
  roofFraming: RoofFramingPayload,
  validation?: ValidationPayload,
): FramingMaterialLineItem[] {
  const systemsById = new Map(
    roofFraming.systems.map((system) => [system.id, system]),
  );
  const planes = [...roofFraming.planes].sort((left, right) =>
    compareIds(left.id, right.id),
  );
  const materials: FramingMaterialLineItem[] = [];

  for (const plane of planes) {
    const system = systemsById.get(plane.parentSystemId);
    if (!system) {
      continue;
    }

    if (!system.planeIds.includes(plane.id)) {
      continue;
    }

    const lineItem = calculatePlaneCommonRafters(system, plane, validation);
    if (lineItem) {
      materials.push(lineItem);
    }
  }

  return materials;
}
