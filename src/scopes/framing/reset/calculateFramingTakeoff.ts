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
 * No Stage 13 validation permission, no pendingClaims lifecycle (D20–D22).
 * Opening governed assumptions remain reachable via calculateOpeningFraming.
 */
export function calculateFramingTakeoff(
  construction: FramingConstruction,
): FramingTakeoffCalculationResult {
  const materials: FramingMaterialLineItem[] = [];
  const assumptions: Assumption[] = [];

  materials.push(
    ...calculateWallFraming(
      construction.walls,
      undefined,
      construction.openings,
    ),
  );

  const openingResult = calculateOpeningFraming(
    construction.openings,
    construction.walls,
    undefined,
  );
  materials.push(...openingResult.materials);
  assumptions.push(...openingResult.assumptions);
  // Explicitly discard pendingClaims (D22).

  materials.push(
    ...calculateStructuralMembers(construction.structuralMembers, undefined),
  );
  materials.push(...calculateFloorFraming(construction.floorFraming, undefined));
  materials.push(...calculateRoofFraming(construction.roofFraming, undefined));
  materials.push(...calculateSheathing(construction.sheathing, undefined));

  return { materials, assumptions };
}
