import type { FloorFramingPayload, ValidationPayload } from "../schemas/framing-artifacts.schema.js";
import type { FloorFramingArea, FloorFramingSystem } from "../schemas/floor-framing.schema.js";
import { hasJoistCountLayoutAxisAuthority } from "../resolvers/floorLayoutAuthority.js";
import { isQuantityBlocked } from "../calculators/isQuantityBlocked.js";
import { isQuantityInputResolved } from "../calculators/isQuantityInputResolved.js";
import { FLOOR_QUANTITY_KEYS } from "../validators/rule-ids.js";
import type { FramingMaterialLineItem } from "../schemas/material.schema.js";

const LAYOUT_LENGTH_PROPERTY_PATH = "joistLayoutLengthFeet";
const JOIST_SPACING_PROPERTY_PATH = "assembly.joistSpacingInches";
const JOIST_SIZE_PROPERTY_PATH = "assembly.joistSize";
const JOIST_TYPE_PROPERTY_PATH = "assembly.joistType";

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function isFloorAreaParentLinked(
  area: FloorFramingArea,
  systemsById: ReadonlyMap<string, FloorFramingSystem>,
): boolean {
  if (area.parentSystemId.endsWith("UNRESOLVED")) {
    return false;
  }

  const system = systemsById.get(area.parentSystemId);
  return system ? system.areaIds.includes(area.id) : false;
}

export function isFloorAreaCalculatorReadyForJoistCount(
  system: FloorFramingSystem,
  area: FloorFramingArea,
  validation: ValidationPayload | undefined,
): boolean {
  const quantityKey = FLOOR_QUANTITY_KEYS.joists;
  const contributingIds = [system.id, area.id];

  if (isQuantityBlocked(validation, contributingIds, quantityKey)) {
    return false;
  }

  return (
    isQuantityInputResolved(
      area.joistLayoutLengthFeet,
      area.resolutionTraces,
      LAYOUT_LENGTH_PROPERTY_PATH,
    ) &&
    hasJoistCountLayoutAxisAuthority(area) &&
    isQuantityInputResolved(
      system.assembly.joistSpacingInches,
      system.resolutionTraces,
      JOIST_SPACING_PROPERTY_PATH,
    ) &&
    isQuantityInputResolved(
      system.assembly.joistSize,
      system.resolutionTraces,
      JOIST_SIZE_PROPERTY_PATH,
    ) &&
    isQuantityInputResolved(
      system.assembly.joistType,
      system.resolutionTraces,
      JOIST_TYPE_PROPERTY_PATH,
    )
  );
}

export function countFloorAreasWithMaterialLines(
  materials: readonly FramingMaterialLineItem[],
  floorFraming: FloorFramingPayload,
): number {
  const areaIds = new Set(floorFraming.areas.map((area) => area.id));
  const calculated = new Set<string>();

  for (const line of materials) {
    for (const sourceId of line.sourceObjectIds) {
      if (areaIds.has(sourceId)) {
        calculated.add(sourceId);
      }
    }
  }

  return calculated.size;
}

export function buildFloorProductFunnel(input: {
  floorFraming: FloorFramingPayload;
  validation?: ValidationPayload;
  materials?: readonly FramingMaterialLineItem[];
  stage16FloorLines?: number;
}): {
  areas: number;
  parentLinked: number;
  calculatorReady: number;
  calculatedAreas: number;
  stage14MaterialLines: number;
  stage16MaterialLines: number;
} {
  const systemsById = new Map(
    input.floorFraming.systems.map((system) => [system.id, system]),
  );
  const areas = input.floorFraming.areas;

  let parentLinked = 0;
  let calculatorReady = 0;

  for (const area of areas) {
    if (!isFloorAreaParentLinked(area, systemsById)) {
      continue;
    }
    parentLinked += 1;

    const system = systemsById.get(area.parentSystemId);
    if (
      system &&
      isFloorAreaCalculatorReadyForJoistCount(system, area, input.validation)
    ) {
      calculatorReady += 1;
    }
  }

  const floorMaterials =
    input.materials?.filter((line) =>
      line.sourceObjectIds.some((sourceId) =>
        areas.some((area) => area.id === sourceId),
      ),
    ) ?? [];

  return {
    areas: areas.length,
    parentLinked,
    calculatorReady,
    calculatedAreas: countFloorAreasWithMaterialLines(
      input.materials ?? [],
      input.floorFraming,
    ),
    stage14MaterialLines: floorMaterials.length,
    stage16MaterialLines: input.stage16FloorLines ?? floorMaterials.length,
  };
}

export function sortFloorMaterialLines(
  materials: readonly FramingMaterialLineItem[],
  floorFraming: FloorFramingPayload,
): FramingMaterialLineItem[] {
  const areaIds = new Set(floorFraming.areas.map((area) => area.id));
  return [...materials]
    .filter((line) =>
      line.sourceObjectIds.some((sourceId) => areaIds.has(sourceId)),
    )
    .sort((left, right) => compareIds(left.id, right.id));
}
