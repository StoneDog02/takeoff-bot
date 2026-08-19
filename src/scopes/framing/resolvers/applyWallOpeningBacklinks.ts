import {
  wallFramingPayloadSchema,
  type OpeningsPayload,
  type WallFramingPayload,
} from "../schemas/framing-artifacts.schema.js";
import type { ObjectId } from "../../../core/schemas/identity.schema.js";

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Populates Wall Segment openingIds from resolved Opening parentObjectId
 * references. Does not mutate the input payloads.
 */
export function applyWallOpeningBacklinks(
  wallFraming: WallFramingPayload,
  openings: OpeningsPayload,
): WallFramingPayload {
  const openingsBySegment = new Map<ObjectId, ObjectId[]>();

  for (const opening of openings.openings) {
    if (opening.parentObjectId === null) {
      continue;
    }

    const existing = openingsBySegment.get(opening.parentObjectId) ?? [];
    existing.push(opening.id);
    openingsBySegment.set(opening.parentObjectId, existing);
  }

  const segments = wallFraming.segments.map((segment) => {
    const linkedOpeningIds = openingsBySegment.get(segment.id);
    if (!linkedOpeningIds || linkedOpeningIds.length === 0) {
      return segment;
    }

    const openingIds = [...new Set([...segment.openingIds, ...linkedOpeningIds])].sort(
      compareIds,
    ) as ObjectId[];

    return {
      ...segment,
      openingIds,
    };
  });

  return wallFramingPayloadSchema.parse({
    walls: wallFraming.walls,
    segments,
  });
}
