import type { Evidence } from "../../../core/schemas/evidence.schema.js";
import {
  framingConstructionSchema,
  type FramingConstruction,
} from "./framingConstruction.schema.js";
import { interpretFloorFraming } from "./interpretFloorFraming.js";
import { interpretOpenings } from "./interpretOpenings.js";
import { interpretRoofFraming } from "./interpretRoofFraming.js";
import { interpretSheathing } from "./interpretSheathing.js";
import { interpretStructuralMembers } from "./interpretStructuralMembers.js";
import { interpretWalls } from "./interpretWalls.js";

/**
 * Convert reader-internal Evidence into FramingConstruction for calculators.
 */
export function interpretFramingConstruction(
  evidence: readonly Evidence[],
): FramingConstruction {
  const walls = interpretWalls(evidence);
  const openings = interpretOpenings(evidence, walls);
  return framingConstructionSchema.parse({
    walls,
    openings,
    structuralMembers: interpretStructuralMembers(evidence),
    floorFraming: interpretFloorFraming(evidence),
    roofFraming: interpretRoofFraming(evidence),
    sheathing: interpretSheathing(evidence),
  });
}
