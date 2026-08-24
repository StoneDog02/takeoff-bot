import type {
  OpeningsPayload,
  ValidationPayload,
  WallFramingPayload,
} from "../schemas/framing-artifacts.schema.js";
import {
  framingMaterialLineItemSchema,
  type FramingMaterialLineItem,
} from "../schemas/material.schema.js";
import type { BuildingWall, WallSegment } from "../schemas/wall.schema.js";
import type { Opening } from "../schemas/opening.schema.js";
import { WALL_QUANTITY_KEYS } from "../validators/rule-ids.js";
import { collectLineItemProvenance } from "./collectLineItemProvenance.js";
import { createMaterialLineItemId } from "./ids.js";
import { isQuantityBlocked } from "./isQuantityBlocked.js";
import { isQuantityInputResolved } from "./isQuantityInputResolved.js";
import {
  computeNetStudDeduction,
  countRegularlySpacedStuds,
  roughOpeningZonesOverlap,
} from "./netStudDeduction.js";

const LENGTH_PROPERTY_PATH = "lengthFeet";
const STUD_SPACING_PROPERTY_PATH = "assembly.studSpacingInches";
const STUD_SIZE_PROPERTY_PATH = "assembly.studSize";
const PLATE_COUNT_PROPERTY_PATH = "assembly.plateCount";

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export { countRegularlySpacedStuds };

/**
 * Net plate linear footage for one wall segment.
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

function openingsOnSegment(
  segmentId: string,
  openings: readonly Opening[],
): Opening[] {
  return openings.filter((o) => o.parentObjectId === segmentId);
}

function segmentNetStudDeduction(
  wall: BuildingWall,
  segment: WallSegment,
  openings: readonly Opening[],
): { deductCount: number; blocked: boolean } {
  const segmentOpenings = openingsOnSegment(segment.id, openings);
  if (segmentOpenings.length === 0) {
    return { deductCount: 0, blocked: false };
  }

  const eligible = segmentOpenings.filter(
    (o) =>
      o.positionOffsetFeetFromSegmentStart != null &&
      o.dimensions.roughWidthFeet != null,
  );

  if (eligible.length === 0) {
    return { deductCount: 0, blocked: false };
  }

  for (let i = 0; i < eligible.length; i++) {
    for (let j = i + 1; j < eligible.length; j++) {
      const a = eligible[i]!;
      const b = eligible[j]!;
      if (
        roughOpeningZonesOverlap(
          a.positionOffsetFeetFromSegmentStart!,
          a.dimensions.roughWidthFeet!,
          b.positionOffsetFeetFromSegmentStart!,
          b.dimensions.roughWidthFeet!,
        )
      ) {
        return { deductCount: 0, blocked: true };
      }
    }
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
    )
  ) {
    return { deductCount: 0, blocked: false };
  }

  let totalDeduct = 0;
  for (const opening of eligible) {
    const result = computeNetStudDeduction({
      lengthFeet: segment.lengthFeet!,
      spacingInches: wall.assembly.studSpacingInches!,
      positionOffsetFeetFromSegmentStart:
        opening.positionOffsetFeetFromSegmentStart!,
      roughWidthFeet: opening.dimensions.roughWidthFeet!,
    });
    totalDeduct += result.deductCount;
  }

  return { deductCount: totalDeduct, blocked: false };
}

function calculateSegmentStuds(
  wall: BuildingWall,
  segment: WallSegment,
  validation: ValidationPayload | undefined,
  openings: readonly Opening[],
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

  const baseline = countRegularlySpacedStuds(
    segment.lengthFeet,
    wall.assembly.studSpacingInches,
  );
  const { deductCount, blocked } = segmentNetStudDeduction(
    wall,
    segment,
    openings,
  );
  const quantity = blocked
    ? baseline
    : Math.max(0, baseline - deductCount);

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
 * When openings with governed position + rough width are linked to a segment,
 * applies ch.13 Layer 2 net regular-stud deductions before emitting stud counts.
 */
export function calculateWallFraming(
  wallFraming: WallFramingPayload,
  validation?: ValidationPayload,
  openings?: OpeningsPayload,
): FramingMaterialLineItem[] {
  const wallsById = new Map(wallFraming.walls.map((wall) => [wall.id, wall]));
  const segments = [...wallFraming.segments].sort((left, right) =>
    compareIds(left.id, right.id),
  );
  const openingList = openings?.openings ?? [];
  const materials: FramingMaterialLineItem[] = [];

  for (const segment of segments) {
    const wall = wallsById.get(segment.parentWallId);
    if (!wall) {
      continue;
    }

    const studs = calculateSegmentStuds(
      wall,
      segment,
      validation,
      openingList,
    );
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
