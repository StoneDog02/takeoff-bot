import type { FloorFramingPayload } from "../schemas/framing-artifacts.schema.js";
import {
  framingMaterialLineItemSchema,
  type FramingMaterialLineItem,
} from "../schemas/material.schema.js";
import type {
  FloorFramingArea,
  FloorFramingSystem,
} from "../schemas/floor-framing.schema.js";
import { isIJoistType } from "../resolvers/floorFramingPropertyPaths.js";
import { isNonWoodFloorTakeoffAreaFromTraces } from "../resolvers/floorAreaMaterialCompatibility.js";
import { hasJoistCountLayoutAxisAuthority } from "../resolvers/floorLayoutAuthority.js";
import { FLOOR_QUANTITY_KEYS } from "../validators/rule-ids.js";
import { collectLineItemProvenance } from "./collectLineItemProvenance.js";
import { createMaterialLineItemId } from "./ids.js";
import { isQuantityInputResolved } from "./isQuantityInputResolved.js";

const LAYOUT_LENGTH_PROPERTY_PATH = "joistLayoutLengthFeet";
const MEMBER_LENGTH_PROPERTY_PATH = "joistMemberLengthFeet";
const JOIST_SPACING_PROPERTY_PATH = "assembly.joistSpacingInches";
const JOIST_SIZE_PROPERTY_PATH = "assembly.joistSize";
const JOIST_TYPE_PROPERTY_PATH = "assembly.joistType";

const COUNT_PROPERTY_PATHS = [
  LAYOUT_LENGTH_PROPERTY_PATH,
  JOIST_SPACING_PROPERTY_PATH,
  JOIST_SIZE_PROPERTY_PATH,
  JOIST_TYPE_PROPERTY_PATH,
] as const;

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replaceAll(/\s+/g, "-");
}

/**
 * E1 simple-area LF material-type allowlist.
 * Floor trusses and other unsupported classifications must not use this formula.
 */
export function isSimpleAreaJoistLinearFeetTypeSupported(
  joistType: string,
): boolean {
  if (isIJoistType(joistType)) {
    return true;
  }

  const token = normalizeToken(joistType);
  if (token.includes("truss") || token.includes("metal") || token.includes("steel")) {
    return false;
  }

  return (
    token === "dimensional-lumber" ||
    token.startsWith("dimensional-") ||
    token === "dimensional"
  );
}

/**
 * Baseline regularly spaced floor joist count for one Floor Framing Area.
 *
 * Formula: `knowledge/framing/14-floor-framing-calculations.md`.
 */
export function countRegularlySpacedJoists(
  joistLayoutLengthFeet: number,
  joistSpacingInches: number,
): number {
  return Math.ceil((joistLayoutLengthFeet * 12) / joistSpacingInches) + 1;
}

function emitLineItem(
  item: FramingMaterialLineItem,
): FramingMaterialLineItem | null {
  if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
    return null;
  }

  return framingMaterialLineItemSchema.parse(item);
}

function resolveBaselineJoistCount(
  system: FloorFramingSystem,
  area: FloorFramingArea,
): number | null {
  if (
    !isQuantityInputResolved(
      area.joistLayoutLengthFeet,
      area.resolutionTraces,
      LAYOUT_LENGTH_PROPERTY_PATH,
    ) ||
    !hasJoistCountLayoutAxisAuthority(area) ||
    !isQuantityInputResolved(
      system.assembly.joistSpacingInches,
      system.resolutionTraces,
      JOIST_SPACING_PROPERTY_PATH,
    ) ||
    !isQuantityInputResolved(
      system.assembly.joistSize,
      system.resolutionTraces,
      JOIST_SIZE_PROPERTY_PATH,
    ) ||
    !isQuantityInputResolved(
      system.assembly.joistType,
      system.resolutionTraces,
      JOIST_TYPE_PROPERTY_PATH,
    )
  ) {
    return null;
  }

  return countRegularlySpacedJoists(
    area.joistLayoutLengthFeet,
    system.assembly.joistSpacingInches,
  );
}

function emitJoistCountLine(
  system: FloorFramingSystem,
  area: FloorFramingArea,
  joistCount: number,
): FramingMaterialLineItem | null {
  const joistType = system.assembly.joistType!;
  const joistSize = system.assembly.joistSize!;
  const quantityKey = FLOOR_QUANTITY_KEYS.joists;

  const provenance = collectLineItemProvenance(
    [system, area],
    [...COUNT_PROPERTY_PATHS],
  );

  return emitLineItem({
    id: createMaterialLineItemId(quantityKey, area.id),
    quantityKey,
    category: "lumber",
    description: `${joistSize} ${joistType} floor joists`,
    canonicalClassification: `floor-joist-${normalizeToken(joistType)}-${normalizeToken(joistSize)}`,
    quantity: joistCount,
    unit: "each",
    sourceObjectIds: provenance.sourceObjectIds,
    assumptionIds: provenance.assumptionIds,
  });
}

function emitJoistLinearFeetLine(
  system: FloorFramingSystem,
  area: FloorFramingArea,
  joistCount: number,
): FramingMaterialLineItem | null {
  const quantityKey = FLOOR_QUANTITY_KEYS.joistLinearFeet;

  if (
    !isQuantityInputResolved(
      area.joistMemberLengthFeet,
      area.resolutionTraces,
      MEMBER_LENGTH_PROPERTY_PATH,
    )
  ) {
    return null;
  }

  const joistType = system.assembly.joistType!;
  if (!isSimpleAreaJoistLinearFeetTypeSupported(joistType)) {
    return null;
  }

  const joistSize = system.assembly.joistSize!;
  const quantity = joistCount * area.joistMemberLengthFeet;

  const provenance = collectLineItemProvenance(
    [system, area],
    [...COUNT_PROPERTY_PATHS, MEMBER_LENGTH_PROPERTY_PATH],
  );

  return emitLineItem({
    id: createMaterialLineItemId(quantityKey, area.id),
    quantityKey,
    category: "lumber",
    description: `${joistSize} ${joistType} floor joists`,
    canonicalClassification: `floor-joist-${normalizeToken(joistType)}-${normalizeToken(joistSize)}`,
    quantity,
    unit: "linear-foot",
    sourceObjectIds: provenance.sourceObjectIds,
    assumptionIds: provenance.assumptionIds,
  });
}

/**
 * Calculates Floor Framing quantities from resolved Floor artifacts.
 *
 * Authorized quantities per `knowledge/framing/14-floor-framing-calculations.md`:
 * - baseline regularly spaced joist count (`each`)
 * - simple-area baseline joist material LF (`linear-foot`) when eligible
 *
 * Does not emit rim, opening specials, blocking, or sheathing.
 */
export function calculateFloorFraming(
  floorFraming: FloorFramingPayload,
): FramingMaterialLineItem[] {
  const systemsById = new Map(
    floorFraming.systems.map((system) => [system.id, system]),
  );
  const areas = [...floorFraming.areas].sort((left, right) =>
    compareIds(left.id, right.id),
  );
  const materials: FramingMaterialLineItem[] = [];

  for (const area of areas) {
    if (isNonWoodFloorTakeoffAreaFromTraces(area)) {
      continue;
    }

    const system = systemsById.get(area.parentSystemId);
    if (!system) {
      continue;
    }

    if (!system.areaIds.includes(area.id)) {
      continue;
    }

    const joistCount = resolveBaselineJoistCount(system, area);
    if (joistCount === null) {
      continue;
    }

    const countLine = emitJoistCountLine(system, area, joistCount);
    if (countLine) {
      materials.push(countLine);
    }

    const lfLine = emitJoistLinearFeetLine(system, area, joistCount);
    if (lfLine) {
      materials.push(lfLine);
    }
  }

  return materials;
}
