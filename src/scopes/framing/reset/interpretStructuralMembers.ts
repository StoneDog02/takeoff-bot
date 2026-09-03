import type { Evidence } from "../../../core/schemas/evidence.schema.js";
import { resolveStructuralMembers } from "../resolvers/resolveStructuralMembers.js";
import type { StructuralMembersPayload } from "../schemas/framing-artifacts.schema.js";

/**
 * Absorb structural members; dimensional/mark/qty/synonym rules run inside
 * resolveStructuralMembers via applyStructuralMemberAuthority (D16).
 * Opening↔header ObjectId linking is not a calculation gate.
 */
export function interpretStructuralMembers(
  evidence: readonly Evidence[],
): StructuralMembersPayload {
  return resolveStructuralMembers([...evidence]);
}
