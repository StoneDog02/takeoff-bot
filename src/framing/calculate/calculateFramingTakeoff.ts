import type { Assumption } from "../../core/schemas/assumption.schema.js";
import { calculateFloorFraming } from "./calculateFloorFraming.js";
import { calculateFoundationInterface } from "./calculateFoundationInterface.js";
import { calculateOpeningFraming } from "./calculateOpeningFraming.js";
import { calculateRoofFraming } from "./calculateRoofFraming.js";
import { calculateSheathing } from "./calculateSheathing.js";
import { calculateStructuralMembers } from "./calculateStructuralMembers.js";
import { calculateWallFraming } from "./calculateWallFraming.js";
import {
  mergeReviewRecords,
  mergeUnresolvedRecords,
  reviewsFromAssumptions,
} from "../resolve/honestyRecords.js";
import type {
  ReviewRecord,
  UnresolvedRecord,
} from "../schemas/honesty-records.schema.js";
import type { FramingMaterialLineItem } from "../schemas/material.schema.js";
import type { FramingConstruction } from "../schemas/framingConstruction.schema.js";

export type FramingTakeoffCalculationResult = {
  materials: FramingMaterialLineItem[];
  assumptions: Assumption[];
  unresolved: UnresolvedRecord[];
  reviews: ReviewRecord[];
};

/**
 * CALCULATE / DERIVE / ASSUME for the framing takeoff path.
 *
 * No Stage 13 validation permission (D20–D22).
 * Opening governed assumptions remain reachable via calculateOpeningFraming.
 * Unresolved and Review records are inspectable here; they do not block the
 * pipeline or enter taxonomy accounting terminals.
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

  const foundationResult = calculateFoundationInterface(
    construction.foundationInterface,
  );
  materials.push(...foundationResult.materials);

  const unresolved = mergeUnresolvedRecords(
    construction.unresolved ?? [],
    openingResult.unresolved,
    foundationResult.unresolved,
  );
  const reviews = mergeReviewRecords(
    construction.reviews ?? [],
    reviewsFromAssumptions(assumptions, construction),
  );

  return { materials, assumptions, unresolved, reviews };
}
