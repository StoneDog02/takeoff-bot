import type { Evidence } from "../../../core/schemas/evidence.schema.js";
import { resolveRoofFraming } from "../resolvers/resolveRoofFraming.js";
import type { RoofFramingPayload } from "../schemas/framing-artifacts.schema.js";

/**
 * Absorb roof construction; framing-family recognition remains for the
 * calculator stick-common-rafter path (D19).
 */
export function interpretRoofFraming(
  evidence: readonly Evidence[],
): RoofFramingPayload {
  return resolveRoofFraming([...evidence]);
}
