import type { ObjectId } from "../../core/schemas/identity.schema.js";
import type { Opening } from "../schemas/opening.schema.js";
import type { StructuralMember } from "../schemas/structural-member.schema.js";
import {
  openingsPayloadSchema,
  structuralMembersPayloadSchema,
  type OpeningsPayload,
  type StructuralMembersPayload,
} from "../schemas/framing-artifacts.schema.js";
import {
  framingConstructionSchema,
  type FramingConstruction,
} from "../schemas/framingConstruction.schema.js";

type IdentifiedObject = { id: ObjectId; physicalId?: ObjectId };

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * 1:1 default: reuse the existing ObjectId mint as physicalId.
 * Already-stamped values are preserved so dual-role sharing stays idempotent.
 */
export function defaultPhysicalIdFromObjectId<T extends IdentifiedObject>(
  object: T,
): T & { physicalId: ObjectId } {
  return {
    ...object,
    physicalId: object.physicalId ?? object.id,
  };
}

/**
 * Existing-realization-first dual-role share (spec §32.3).
 *
 * When an opening already points at a resolved structural member via
 * headerMemberId, both bag rows keep their roles and ObjectIds, but they
 * share the member's physicalId. Distinct plates/walls are not merged.
 */
export function shareLinkedHeaderPhysicalIds(
  openings: readonly Opening[],
  structuralMembers: readonly StructuralMember[],
): { openings: Opening[]; structuralMembers: StructuralMember[] } {
  const membersById = new Map(
    structuralMembers.map((member) => [member.id, member]),
  );

  const nextOpenings = openings.map((opening) => {
    if (opening.headerMemberId === null) {
      return defaultPhysicalIdFromObjectId(opening);
    }

    const member = membersById.get(opening.headerMemberId);
    if (!member) {
      return defaultPhysicalIdFromObjectId(opening);
    }

    const sharedPhysicalId = member.physicalId ?? member.id;
    return {
      ...opening,
      physicalId: sharedPhysicalId,
    };
  });

  const nextMembers = structuralMembers.map((member) =>
    defaultPhysicalIdFromObjectId(member),
  );

  return {
    openings: nextOpenings.sort((left, right) => compareIds(left.id, right.id)),
    structuralMembers: nextMembers.sort((left, right) =>
      compareIds(left.id, right.id),
    ),
  };
}

export function shareLinkedHeaderPhysicalIdPayloads(
  openings: OpeningsPayload,
  structuralMembers: StructuralMembersPayload,
): { openings: OpeningsPayload; structuralMembers: StructuralMembersPayload } {
  const shared = shareLinkedHeaderPhysicalIds(
    openings.openings,
    structuralMembers.structuralMembers,
  );

  return {
    openings: openingsPayloadSchema.parse({ openings: shared.openings }),
    structuralMembers: structuralMembersPayloadSchema.parse({
      structuralMembers: shared.structuralMembers,
    }),
  };
}

export type ConstructionBagObject = IdentifiedObject & { objectType: string };

/**
 * Walk every resolved construction bag row. Used by identity tests and the
 * stamper; not a HOUSE graph.
 */
export function collectConstructionBagObjects(
  construction: FramingConstruction,
): ConstructionBagObject[] {
  return [
    ...construction.walls.walls,
    ...construction.walls.segments,
    ...construction.openings.openings,
    ...construction.structuralMembers.structuralMembers,
    ...construction.floorFraming.systems,
    ...construction.floorFraming.areas,
    ...construction.roofFraming.systems,
    ...construction.roofFraming.planes,
    ...construction.sheathing.systems,
    ...construction.sheathing.areas,
    ...construction.foundationInterface.sillSegments,
  ];
}

/**
 * Stamp stable physicalIds on existing bag objects.
 *
 * Default is one bag object → one physicalId (ObjectId mint). Linked opening
 * + header member rows share one physicalId without deleting or merging rows.
 * Running twice on the same construction yields the same population.
 */
export function assignCanonicalPhysicalIds(
  construction: FramingConstruction,
): FramingConstruction {
  const shared = shareLinkedHeaderPhysicalIds(
    construction.openings.openings,
    construction.structuralMembers.structuralMembers,
  );

  return framingConstructionSchema.parse({
    walls: {
      walls: construction.walls.walls.map(defaultPhysicalIdFromObjectId),
      segments: construction.walls.segments.map(defaultPhysicalIdFromObjectId),
    },
    openings: { openings: shared.openings },
    structuralMembers: { structuralMembers: shared.structuralMembers },
    floorFraming: {
      systems: construction.floorFraming.systems.map(
        defaultPhysicalIdFromObjectId,
      ),
      areas: construction.floorFraming.areas.map(defaultPhysicalIdFromObjectId),
    },
    roofFraming: {
      systems: construction.roofFraming.systems.map(
        defaultPhysicalIdFromObjectId,
      ),
      planes: construction.roofFraming.planes.map(defaultPhysicalIdFromObjectId),
    },
    sheathing: {
      systems: construction.sheathing.systems.map(defaultPhysicalIdFromObjectId),
      areas: construction.sheathing.areas.map(defaultPhysicalIdFromObjectId),
    },
    foundationInterface: {
      sillSegments: construction.foundationInterface.sillSegments.map(
        defaultPhysicalIdFromObjectId,
      ),
    },
    supportGraph: construction.supportGraph ?? { edges: [] },
    unresolved: construction.unresolved ?? [],
    reviews: construction.reviews ?? [],
  });
}
