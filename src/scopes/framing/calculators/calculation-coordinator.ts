import {
  framingCalculationsPayloadSchema,
  type ConnectorsHardwarePayload,
  type FramingCalculationsPayload,
  type OpeningsPayload,
  type SheathingPayload,
  type StructuralMembersPayload,
  type ValidationPayload,
  type WallFramingPayload,
} from "../schemas/framing-artifacts.schema.js";
import type { FramingMaterialLineItem } from "../schemas/material.schema.js";
import { calculateFasteners } from "./calculateFasteners.js";
import { calculateOpeningFraming } from "./calculateOpeningFraming.js";
import { calculateSheathing } from "./calculateSheathing.js";
import { calculateStructuralMembers } from "./calculateStructuralMembers.js";
import { calculateWallFraming } from "./calculateWallFraming.js";

export type FramingCalculationInput = {
  wallFraming?: WallFramingPayload;
  openings?: OpeningsPayload;
  structuralMembers?: StructuralMembersPayload;
  sheathing?: SheathingPayload;
  connectorsHardware?: ConnectorsHardwarePayload;
  validation?: ValidationPayload;
};

/**
 * Runs available Framing subsystem calculators and concatenates their
 * material line items. Does not merge, deduplicate, or alter quantities.
 *
 * Order: Wall Framing, Opening Framing, Structural Members, Sheathing, then
 * specified Fasteners. Connector and Hardware objects are not calculated here.
 */
export function coordinateFramingCalculations(
  input: FramingCalculationInput,
): FramingCalculationsPayload {
  const materials: FramingMaterialLineItem[] = [];
  const assumptions: FramingCalculationsPayload["assumptions"] = [];

  if (input.wallFraming) {
    materials.push(
      ...calculateWallFraming(input.wallFraming, input.validation),
    );
  }

  if (input.openings && input.wallFraming) {
    const openingResult = calculateOpeningFraming(
      input.openings,
      input.wallFraming,
      input.validation,
    );
    materials.push(...openingResult.materials);
    assumptions.push(...openingResult.assumptions);
  }

  if (input.structuralMembers) {
    materials.push(
      ...calculateStructuralMembers(input.structuralMembers, input.validation),
    );
  }

  if (input.sheathing) {
    materials.push(...calculateSheathing(input.sheathing, input.validation));
  }

  if (input.connectorsHardware) {
    materials.push(
      ...calculateFasteners(input.connectorsHardware, input.validation),
    );
  }

  return framingCalculationsPayloadSchema.parse({ materials, assumptions });
}

