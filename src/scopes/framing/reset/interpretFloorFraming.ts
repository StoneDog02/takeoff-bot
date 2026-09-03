import type { Evidence } from "../../../core/schemas/evidence.schema.js";
import { resolveFloorFraming } from "../resolvers/resolveFloorFraming.js";
import type { FloorFramingPayload } from "../schemas/framing-artifacts.schema.js";

/**
 * Absorb floor framing including joist parse, MAX SPAN, fragments,
 * spacing-axis, and slab-vs-wood rules inside resolveFloorFraming (D18).
 */
export function interpretFloorFraming(
  evidence: readonly Evidence[],
): FloorFramingPayload {
  return resolveFloorFraming([...evidence]);
}
