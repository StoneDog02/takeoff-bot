import type { Evidence } from "../../../core/schemas/evidence.schema.js";
import { resolveSheathing } from "../resolvers/resolveSheathing.js";
import type { SheathingPayload } from "../schemas/framing-artifacts.schema.js";

/**
 * Absorb sheathing specification + coverage when present (D17).
 * parentSystemId / areaIds are not production calculation gates.
 */
export function interpretSheathing(
  evidence: readonly Evidence[],
): SheathingPayload {
  return resolveSheathing([...evidence]);
}
