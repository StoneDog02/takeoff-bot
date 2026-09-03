import type { Evidence } from "../../../core/schemas/evidence.schema.js";
import { resolveWallFraming } from "../resolvers/resolveWallFraming.js";
import type { WallFramingPayload } from "../schemas/framing-artifacts.schema.js";

/**
 * Absorb wall construction from reader Evidence into calculator-ready bags.
 * Preserves type/schedule merge inside resolveWallFraming (D13); not a
 * production resolution stage.
 */
export function interpretWalls(evidence: readonly Evidence[]): WallFramingPayload {
  return resolveWallFraming([...evidence]);
}
