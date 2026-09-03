import type { Assumption } from "../../../core/schemas/assumption.schema.js";
import type { UserDecisionId } from "../../../core/schemas/identity.schema.js";
import { assumptionSchema } from "../../../core/schemas/assumption.schema.js";

/**
 * Mark a Run-1 active assumption as replaced or confirmed after UserDecision.
 * Returns a new immutable record (does not mutate input).
 */
export function applyAssumptionUserDecisionLifecycle(
  assumption: Assumption,
  input: {
    status: "confirmed" | "replaced";
    userDecisionId: UserDecisionId;
  },
): Assumption {
  return assumptionSchema.parse({
    ...assumption,
    status: input.status,
    userDecisionId: input.userDecisionId,
  });
}
