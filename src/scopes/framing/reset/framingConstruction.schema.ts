import { z } from "zod";

import {
  floorFramingPayloadSchema,
  openingsPayloadSchema,
  roofFramingPayloadSchema,
  sheathingPayloadSchema,
  structuralMembersPayloadSchema,
  wallFramingPayloadSchema,
} from "../schemas/framing-artifacts.schema.js";

/**
 * Production reader → calculator boundary for the factory reset.
 *
 * Uses existing domain payload shapes as plain construction bags. Resolution
 * traces / claim lifecycle are not production authority (D13–D21).
 */
export const framingConstructionSchema = z.object({
  walls: wallFramingPayloadSchema,
  openings: openingsPayloadSchema,
  structuralMembers: structuralMembersPayloadSchema,
  floorFraming: floorFramingPayloadSchema,
  roofFraming: roofFramingPayloadSchema,
  sheathing: sheathingPayloadSchema,
});

export type FramingConstruction = z.infer<typeof framingConstructionSchema>;

export function emptyFramingConstruction(): FramingConstruction {
  return {
    walls: { walls: [], segments: [] },
    openings: { openings: [] },
    structuralMembers: { structuralMembers: [] },
    floorFraming: { systems: [], areas: [] },
    roofFraming: { systems: [], planes: [] },
    sheathing: { systems: [], areas: [] },
  };
}
