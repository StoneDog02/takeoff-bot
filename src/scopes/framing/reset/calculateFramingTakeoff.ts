import type { Assumption } from "../../../core/schemas/assumption.schema.js";
import { calculateFloorFraming } from "../calculators/calculateFloorFraming.js";
import { calculateOpeningFraming } from "../calculators/calculateOpeningFraming.js";
import { calculateRoofFraming } from "../calculators/calculateRoofFraming.js";
import { calculateSheathing } from "../calculators/calculateSheathing.js";
import { calculateStructuralMembers } from "../calculators/calculateStructuralMembers.js";
import { calculateWallFraming } from "../calculators/calculateWallFraming.js";
import type { FramingMaterialLineItem } from "../schemas/material.schema.js";
import type { FramingConstruction } from "./framingConstruction.schema.js";

export type FramingTakeoffCalculationResult = {
  materials: FramingMaterialLineItem[];
  assumptions: Assumption[];
};

/**
 * CALCULATE / DERIVE / ASSUME for the reset path.
 *
 * No Stage 13 validation permission (D20–D22).
 * Opening governed assumptions remain reachable via calculateOpeningFraming.
 */
export function calculateFramingTakeoff(
  construction: FramingConstruction,
): FramingTakeoffCalculationResult {
  const materials: FramingMaterialLineItem[] = [];
  const assumptions: Assumption[] = [];

  materials.push(
    ...calculateWallFraming(construction.walls, construction.openings),
  );

  const openingResult = calculateOpeningFraming(
    construction.openings,
    construction.walls,
  );
  materials.push(...openingResult.materials);
  assumptions.push(...openingResult.assumptions);

  materials.push(
    ...calculateStructuralMembers(construction.structuralMembers),
  );
  materials.push(...calculateFloorFraming(construction.floorFraming));
  materials.push(...calculateRoofFraming(construction.roofFraming));
  materials.push(...calculateSheathing(construction.sheathing));

  return { materials, assumptions };
}
