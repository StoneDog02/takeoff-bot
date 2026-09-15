import { z } from "zod";

import {
  floorFramingPayloadSchema,
  foundationInterfacePayloadSchema,
  openingsPayloadSchema,
  roofFramingPayloadSchema,
  sheathingPayloadSchema,
  structuralMembersPayloadSchema,
  wallFramingPayloadSchema,
} from "./framing-artifacts.schema.js";
import {
  reviewRecordSchema,
  unresolvedRecordSchema,
} from "./honesty-records.schema.js";
import { supportGraphSchema } from "./support-graph.schema.js";

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
  foundationInterface: foundationInterfacePayloadSchema.default({ sillSegments: [] }),
  supportGraph: supportGraphSchema.default({ edges: [] }),
  unresolved: z.array(unresolvedRecordSchema).default([]),
  reviews: z.array(reviewRecordSchema).default([]),
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
    foundationInterface: { sillSegments: [] },
    supportGraph: { edges: [] },
    unresolved: [],
    reviews: [],
  };
}
