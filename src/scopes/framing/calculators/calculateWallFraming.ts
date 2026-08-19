import type {
  ValidationPayload,
  WallFramingPayload,
} from "../schemas/framing-artifacts.schema.js";
import {
  framingMaterialLineItemSchema,
  type FramingMaterialLineItem,
} from "../schemas/material.schema.js";
import type { BuildingWall, WallSegment } from "../schemas/wall.schema.js";
import { WALL_QUANTITY_KEYS } from "../validators/rule-ids.js";
import { collectLineItemProvenance } from "./collectLineItemProvenance.js";
import { createMaterialLineItemId } from "./ids.js";
import { isQuantityBlocked } from "./isQuantityBlocked.js";
import { isQuantityInputResolved } from "./isQuantityInputResolved.js";

const LENGTH_PROPERTY_PATH = "lengthFeet";
const STUD_SPACING_PROPERTY_PATH = "assembly.studSpacingInches";
const STUD_SIZE_PROPERTY_PATH = "assembly.studSize";
const PLATE_COUNT_PROPERTY_PATH = "assembly.plateCount";

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Baseline regularly spaced stud count for one wall segment.
 *
 * Layout and count: `knowledge/framing/04-building-assemblies.md`.
 * Whole-piece rounding policy: `knowledge/framing/10-assumptions.md`.
 */
function countRegularlySpacedStuds(
  lengthFeet: number,
  spacingInches: number,
): number {
  return Math.ceil((lengthFeet * 12) / spacingInches) + 1;
}

/**
 * Net plate linear footage for one wall segment.
 *
 * Quantity semantics: `knowledge/framing/04-building-assemblies.md`.
 */
function plateLinearFootage(
  lengthFeet: number,
  plateCount: number,
): number {
  return lengthFeet * plateCount;
}

function emitLineItem(
  item: FramingMaterialLineItem,
): FramingMaterialLineItem | null {
  if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
    return null;
  }

  return framingMaterialLineItemSchema.parse(item);
}

function calculateSegmentStuds(
  wall: BuildingWall,
  segment: WallSegment,
  validation: ValidationPayload | undefined,
): FramingMaterialLineItem | null {
  const quantityKey = WALL_QUANTITY_KEYS.studs;
  const contributingObjects = [wall, segment];

  if (
    isQuantityBlocked(
      validation,
      contributingObjects.map((object) => object.id),
      quantityKey,
    )
  ) {
    return null;
  }

  if (
    !isQuantityInputResolved(
      segment.lengthFeet,
      segment.resolutionTraces,
      LENGTH_PROPERTY_PATH,
    ) ||
    !isQuantityInputResolved(
      wall.assembly.studSpacingInches,
      wall.resolutionTraces,
      STUD_SPACING_PROPERTY_PATH,
    ) ||
    !isQuantityInputResolved(
      wall.assembly.studSize,
      wall.resolutionTraces,
      STUD_SIZE_PROPERTY_PATH,
    )
  ) {
    return null;
  }

  const quantity = countRegularlySpacedStuds(
    segment.lengthFeet,
    wall.assembly.studSpacingInches,
  );
  const provenance = collectLineItemProvenance(contributingObjects, [
    LENGTH_PROPERTY_PATH,
    STUD_SPACING_PROPERTY_PATH,
    STUD_SIZE_PROPERTY_PATH,
  ]);

  return emitLineItem({
    id: createMaterialLineItemId(quantityKey, segment.id),
    category: "lumber",
    description: `${wall.assembly.studSize} regularly spaced studs at ${wall.assembly.studSpacingInches} in O.C.`,
    canonicalClassification: `stud-${wall.assembly.studSize}-regular-spacing`,
    quantity,
    unit: "each",
    sourceObjectIds: provenance.sourceObjectIds,
    assumptionIds: provenance.assumptionIds,
    reviewItemIds: provenance.reviewItemIds,
  });
}

function calculateSegmentPlates(
  wall: BuildingWall,
  segment: WallSegment,
  validation: ValidationPayload | undefined,
): FramingMaterialLineItem | null {
  const quantityKey = WALL_QUANTITY_KEYS.plates;
  const contributingObjects = [wall, segment];

  if (
    isQuantityBlocked(
      validation,
      contributingObjects.map((object) => object.id),
      quantityKey,
    )
  ) {
    return null;
  }

  if (
    !isQuantityInputResolved(
      segment.lengthFeet,
      segment.resolutionTraces,
      LENGTH_PROPERTY_PATH,
    ) ||
    !isQuantityInputResolved(
      wall.assembly.plateCount,
      wall.resolutionTraces,
      PLATE_COUNT_PROPERTY_PATH,
    )
  ) {
    return null;
  }

  const usedPropertyPaths = [LENGTH_PROPERTY_PATH, PLATE_COUNT_PROPERTY_PATH];
  const studSizeResolved = isQuantityInputResolved(
    wall.assembly.studSize,
    wall.resolutionTraces,
    STUD_SIZE_PROPERTY_PATH,
  );
  if (studSizeResolved) {
    usedPropertyPaths.push(STUD_SIZE_PROPERTY_PATH);
  }

  const quantity = plateLinearFootage(
    segment.lengthFeet,
    wall.assembly.plateCount,
  );
  const provenance = collectLineItemProvenance(
    contributingObjects,
    usedPropertyPaths,
  );
  const sizeLabel = studSizeResolved ? `${wall.assembly.studSize} ` : "";

  return emitLineItem({
    id: createMaterialLineItemId(quantityKey, segment.id),
    category: "lumber",
    description: `${sizeLabel}wall plates`.trim(),
    canonicalClassification: studSizeResolved
      ? `plate-${wall.assembly.studSize}`
      : "plate",
    quantity,
    unit: "linear-foot",
    sourceObjectIds: provenance.sourceObjectIds,
    assumptionIds: provenance.assumptionIds,
    reviewItemIds: provenance.reviewItemIds,
  });
}

/**
 * Calculates net wall framing quantities from a resolved Wall Framing payload.
 *
 * Stud layout/count and plate LF follow `knowledge/framing/04-building-assemblies.md`.
 * Emits baseline regularly spaced stud counts and unrounded plate linear
 * footage. Does not apply waste, stock-length optimization, opening
 * deductions, or extra framing members.
 */
export function calculateWallFraming(
  wallFraming: WallFramingPayload,
  validation?: ValidationPayload,
): FramingMaterialLineItem[] {
  const wallsById = new Map(wallFraming.walls.map((wall) => [wall.id, wall]));
  const segments = [...wallFraming.segments].sort((left, right) =>
    compareIds(left.id, right.id),
  );
  const materials: FramingMaterialLineItem[] = [];

  for (const segment of segments) {
    const wall = wallsById.get(segment.parentWallId);
    if (!wall) {
      continue;
    }

    const studs = calculateSegmentStuds(wall, segment, validation);
    if (studs) {
      materials.push(studs);
    }

    const plates = calculateSegmentPlates(wall, segment, validation);
    if (plates) {
      materials.push(plates);
    }
  }

  return materials;
}
