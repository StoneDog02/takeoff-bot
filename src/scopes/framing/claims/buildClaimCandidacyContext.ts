import type { ObjectId } from "../../../core/schemas/identity.schema.js";
import type {
  FloorFramingPayload,
  OpeningsPayload,
  RoofFramingPayload,
  SheathingPayload,
  WallFramingPayload,
} from "../schemas/framing-artifacts.schema.js";
import type { ClaimCandidacyContext } from "./admitMaterialClaimCandidate.js";

/**
 * Build candidacy context from Stage domain payloads for pending admission.
 */
export function buildClaimCandidacyContext(input: {
  openings?: OpeningsPayload;
  wallFraming?: WallFramingPayload;
  floorFraming?: FloorFramingPayload;
  roofFraming?: RoofFramingPayload;
  sheathing?: SheathingPayload;
}): ClaimCandidacyContext {
  const openingCategoryById = new Map<string, string>();
  const openingIdentityRoleById = new Map<string, string>();
  if (input.openings) {
    for (const opening of input.openings.openings) {
      openingCategoryById.set(opening.id, opening.category);
      openingIdentityRoleById.set(opening.id, opening.identityRole);
    }
  }

  const segmentIdsByWallId = new Map<string, ObjectId[]>();
  if (input.wallFraming) {
    for (const segment of input.wallFraming.segments) {
      const list = segmentIdsByWallId.get(segment.parentWallId) ?? [];
      list.push(segment.id);
      segmentIdsByWallId.set(segment.parentWallId, list);
    }
  }

  const areaIdsByFloorSystemId = new Map<string, ObjectId[]>();
  if (input.floorFraming) {
    for (const system of input.floorFraming.systems) {
      areaIdsByFloorSystemId.set(system.id, [...system.areaIds]);
    }
  }

  const planeIdsByRoofSystemId = new Map<string, ObjectId[]>();
  if (input.roofFraming) {
    for (const system of input.roofFraming.systems) {
      planeIdsByRoofSystemId.set(system.id, [...system.planeIds]);
    }
  }

  const areaIdsBySheathingSystemId = new Map<string, ObjectId[]>();
  if (input.sheathing) {
    for (const system of input.sheathing.systems) {
      areaIdsBySheathingSystemId.set(system.id, [...system.areaIds]);
    }
  }

  return {
    openingCategoryById,
    openingIdentityRoleById,
    segmentIdsByWallId,
    areaIdsByFloorSystemId,
    planeIdsByRoofSystemId,
    areaIdsBySheathingSystemId,
  };
}
