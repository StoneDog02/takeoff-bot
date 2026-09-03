import {
  framingCalculationsPayloadSchema,
  type ConnectorsHardwarePayload,
  type FloorFramingPayload,
  type FramingCalculationsPayload,
  type OpeningsPayload,
  type RoofFramingPayload,
  type SheathingPayload,
  type StructuralMembersPayload,
  type ValidationPayload,
  type WallFramingPayload,
} from "../schemas/framing-artifacts.schema.js";
import type { FramingMaterialLineItem } from "../schemas/material.schema.js";
import type { PendingMaterialClaim } from "../schemas/claim-outcome.schema.js";
import { buildClaimCandidacyContext } from "../claims/buildClaimCandidacyContext.js";
import { collectPendingClaims } from "../claims/collectPendingClaims.js";
import { deriveMaterialClaimStatus } from "../claims/deriveClaimStatus.js";
import { calculateFasteners } from "./calculateFasteners.js";
import { calculateFloorFraming } from "./calculateFloorFraming.js";
import { calculateOpeningFraming } from "./calculateOpeningFraming.js";
import { calculateRoofFraming } from "./calculateRoofFraming.js";
import { calculateSheathing } from "./calculateSheathing.js";
import { calculateStructuralMembers } from "./calculateStructuralMembers.js";
import { calculateWallFraming } from "./calculateWallFraming.js";

export type FramingCalculationInput = {
  wallFraming?: WallFramingPayload;
  openings?: OpeningsPayload;
  structuralMembers?: StructuralMembersPayload;
  floorFraming?: FloorFramingPayload;
  roofFraming?: RoofFramingPayload;
  sheathing?: SheathingPayload;
  connectorsHardware?: ConnectorsHardwarePayload;
  validation?: ValidationPayload;
};

/**
 * Runs available Framing subsystem calculators and concatenates their
 * material line items. Does not merge, deduplicate, or alter quantities.
 *
 * Order: Wall Framing, Opening Framing, Structural Members, Floor Framing,
 * Roof Framing, Sheathing, then specified Fasteners. Connector and Hardware
 * objects are not calculated here.
 *
 * LEGACY: still used by createFramingStages Stage 14 / audit. Production
 * framing uses `calculateFramingTakeoff` in reset/ (no pendingClaims, D22).
 * pendingClaims collection below is retained only for legacy artifact shape.
 */
export function coordinateFramingCalculations(
  input: FramingCalculationInput,
): FramingCalculationsPayload {
  const materials: FramingMaterialLineItem[] = [];
  const assumptions: FramingCalculationsPayload["assumptions"] = [];
  const explicitPendingClaims: PendingMaterialClaim[] = [];

  if (input.wallFraming) {
    materials.push(
      ...calculateWallFraming(
        input.wallFraming,
        input.validation,
        input.openings,
      ),
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
    explicitPendingClaims.push(...openingResult.pendingClaims);
  }

  if (input.structuralMembers) {
    materials.push(
      ...calculateStructuralMembers(input.structuralMembers, input.validation),
    );
  }

  if (input.floorFraming) {
    materials.push(
      ...calculateFloorFraming(input.floorFraming, input.validation),
    );
  }

  if (input.roofFraming) {
    materials.push(
      ...calculateRoofFraming(input.roofFraming, input.validation),
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

  const pendingClaims = collectPendingClaims({
    validation: input.validation,
    materials,
    explicitPendingClaims,
    candidacyContext: buildClaimCandidacyContext({
      openings: input.openings,
      wallFraming: input.wallFraming,
      floorFraming: input.floorFraming,
      roofFraming: input.roofFraming,
      sheathing: input.sheathing,
    }),
  });

  const materialsWithStatus = materials.map((material) => {
    if (material.claimStatus) {
      return material;
    }
    const relatedAssumptions = assumptions.filter((assumption) =>
      material.assumptionIds.includes(assumption.id),
    );
    return {
      ...material,
      claimStatus: deriveMaterialClaimStatus({
        assumptions: relatedAssumptions,
        assumptionIds: material.assumptionIds,
      }),
    };
  });

  return framingCalculationsPayloadSchema.parse({
    materials: materialsWithStatus,
    assumptions,
    pendingClaims,
  });
}
