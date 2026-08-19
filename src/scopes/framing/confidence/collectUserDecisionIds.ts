import type { UserDecisionId } from "../../../core/schemas/identity.schema.js";
import type { PropertyResolutionTrace } from "../../../core/schemas/resolved-object.schema.js";

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function collectUserDecisionIds(
  traces: readonly PropertyResolutionTrace[],
): UserDecisionId[] {
  const ids = new Set<UserDecisionId>();
  for (const trace of traces) {
    for (const id of trace.userDecisionIds ?? []) {
      ids.add(id);
    }
  }
  return [...ids].sort(compareIds);
}

export function collectUserDecisionIdsFromEvaluations(
  evaluations: readonly { userDecisionIds: readonly UserDecisionId[] }[],
): UserDecisionId[] {
  const ids = new Set<UserDecisionId>();
  for (const evaluation of evaluations) {
    for (const id of evaluation.userDecisionIds) {
      ids.add(id);
    }
  }
  return [...ids].sort(compareIds);
}
