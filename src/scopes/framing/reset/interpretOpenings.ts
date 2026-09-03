import type { Evidence } from "../../../core/schemas/evidence.schema.js";
import { resolveOpenings } from "../resolvers/resolveOpenings.js";
import type {
  OpeningsPayload,
  WallFramingPayload,
} from "../schemas/framing-artifacts.schema.js";

/**
 * Absorb openings with host-wall context from reader Evidence (D15).
 * Does not apply wall openingIds backlinks as calculation authority.
 */
export function interpretOpenings(
  evidence: readonly Evidence[],
  wallFraming: WallFramingPayload,
): OpeningsPayload {
  return resolveOpenings([...evidence], { wallFraming });
}
