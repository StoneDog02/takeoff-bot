import type { ObjectId } from "../../../core/schemas/identity.schema.js";
import type {
  AssumptionsPayload,
  BlockingPayload,
  ConfidencePayload,
  ConnectorsHardwarePayload,
  FloorFramingPayload,
  FramingScopePayload,
  OpeningsPayload,
  RoofFramingPayload,
  SheathingPayload,
  StructuralMembersPayload,
  ValidationPayload,
  WallFramingPayload,
} from "../schemas/framing-artifacts.schema.js";
import type { RelatedObjectRef } from "./types.js";

export type FramingValidationArtifacts = {
  wallFraming?: WallFramingPayload;
  floorFraming?: FloorFramingPayload;
  roofFraming?: RoofFramingPayload;
  openings?: OpeningsPayload;
  structuralMembers?: StructuralMembersPayload;
  connectorsHardware?: ConnectorsHardwarePayload;
  sheathing?: SheathingPayload;
  blocking?: BlockingPayload;
  assumptions?: AssumptionsPayload;
  framingScope?: FramingScopePayload;
  /**
   * Previously produced Validation Artifact payload. Used only for Framing
   * Scope snapshot-integrity checks; this is not the coordinator output.
   */
  validation?: ValidationPayload;
  /**
   * Previously produced Confidence Artifact payload. Used only for Framing
   * Scope snapshot-integrity checks.
   */
  confidence?: ConfidencePayload;
};

function registerObject(
  map: Map<ObjectId, RelatedObjectRef>,
  objectId: ObjectId,
  objectType: string,
): void {
  map.set(objectId, { objectId, objectType });
}

export function buildRelatedObjectMaps(input: FramingValidationArtifacts): {
  relatedObjectsById: Map<ObjectId, RelatedObjectRef>;
  connectorsById: Map<ObjectId, RelatedObjectRef>;
} {
  const relatedObjectsById = new Map<ObjectId, RelatedObjectRef>();
  const connectorsById = new Map<ObjectId, RelatedObjectRef>();

  if (input.wallFraming) {
    for (const wall of input.wallFraming.walls) {
      registerObject(relatedObjectsById, wall.id, wall.objectType);
    }
    for (const segment of input.wallFraming.segments) {
      registerObject(relatedObjectsById, segment.id, segment.objectType);
    }
  }

  if (input.floorFraming) {
    for (const system of input.floorFraming.systems) {
      registerObject(relatedObjectsById, system.id, system.objectType);
    }
    for (const area of input.floorFraming.areas) {
      registerObject(relatedObjectsById, area.id, area.objectType);
    }
  }

  if (input.roofFraming) {
    for (const system of input.roofFraming.systems) {
      registerObject(relatedObjectsById, system.id, system.objectType);
    }
    for (const plane of input.roofFraming.planes) {
      registerObject(relatedObjectsById, plane.id, plane.objectType);
    }
  }

  if (input.openings) {
    for (const opening of input.openings.openings) {
      registerObject(relatedObjectsById, opening.id, opening.objectType);
    }
  }

  if (input.structuralMembers) {
    for (const member of input.structuralMembers.structuralMembers) {
      registerObject(relatedObjectsById, member.id, member.objectType);
    }
  }

  if (input.sheathing) {
    for (const system of input.sheathing.systems) {
      registerObject(relatedObjectsById, system.id, system.objectType);
    }
    for (const area of input.sheathing.areas) {
      registerObject(relatedObjectsById, area.id, area.objectType);
    }
  }

  if (input.blocking) {
    for (const blocking of input.blocking.blocking) {
      registerObject(relatedObjectsById, blocking.id, blocking.objectType);
    }
  }

  if (input.connectorsHardware) {
    for (const connector of input.connectorsHardware.connectors) {
      registerObject(relatedObjectsById, connector.id, connector.objectType);
      registerObject(connectorsById, connector.id, connector.objectType);
    }
    for (const hardware of input.connectorsHardware.hardware) {
      registerObject(relatedObjectsById, hardware.id, hardware.objectType);
    }
    for (const fastener of input.connectorsHardware.fasteners) {
      registerObject(relatedObjectsById, fastener.id, fastener.objectType);
    }
  }

  return { relatedObjectsById, connectorsById };
}

export function hasParentArtifacts(input: FramingValidationArtifacts): boolean {
  return (
    input.wallFraming !== undefined ||
    input.floorFraming !== undefined ||
    input.roofFraming !== undefined
  );
}

export function hasCoveredObjectArtifacts(
  input: FramingValidationArtifacts,
): boolean {
  return (
    hasParentArtifacts(input) || input.structuralMembers !== undefined
  );
}

export function hasAssociatedObjectArtifacts(
  input: FramingValidationArtifacts,
): boolean {
  return (
    hasCoveredObjectArtifacts(input) ||
    input.openings !== undefined ||
    input.sheathing !== undefined
  );
}

export function hasConnectorAssociatedArtifacts(
  input: FramingValidationArtifacts,
): boolean {
  return hasAssociatedObjectArtifacts(input) || input.blocking !== undefined;
}

export function hasMemberAssociatedArtifacts(
  input: FramingValidationArtifacts,
): boolean {
  return (
    hasParentArtifacts(input) ||
    input.openings !== undefined ||
    input.blocking !== undefined ||
    input.sheathing !== undefined
  );
}

export function buildWallsById(
  payload: WallFramingPayload,
): Map<ObjectId, RelatedObjectRef> {
  const wallsById = new Map<ObjectId, RelatedObjectRef>();
  for (const wall of payload.walls) {
    registerObject(wallsById, wall.id, wall.objectType);
  }
  for (const segment of payload.segments) {
    registerObject(wallsById, segment.id, segment.objectType);
  }
  return wallsById;
}

export function buildOpeningsById(
  payload: OpeningsPayload,
): Map<ObjectId, RelatedObjectRef> {
  return new Map(
    payload.openings.map((opening) => [
      opening.id,
      { objectId: opening.id, objectType: opening.objectType },
    ]),
  );
}

export function buildStructuralMembersById(
  payload: StructuralMembersPayload,
): Map<ObjectId, RelatedObjectRef> {
  return new Map(
    payload.structuralMembers.map((member) => [
      member.id,
      { objectId: member.id, objectType: member.objectType },
    ]),
  );
}
