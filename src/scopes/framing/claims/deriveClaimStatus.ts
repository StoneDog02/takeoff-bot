import type { Assumption } from "../../../core/schemas/assumption.schema.js";
import type { MaterialClaimStatus } from "../schemas/claim-outcome.schema.js";

/**
 * Derive claim status for a calculated material line.
 * Pending (blocked) statuses belong on pending-claim rows, not materials.
 */
export function deriveMaterialClaimStatus(input: {
  assumptions?: readonly Assumption[];
  assumptionIds?: readonly string[];
  lowConfidence?: boolean;
  applicabilityReview?: boolean;
}): MaterialClaimStatus {
  if (input.applicabilityReview) {
    return "APPLICABILITY_REVIEW";
  }

  const assumptions = input.assumptions ?? [];
  const hasActiveAssumption =
    assumptions.some((assumption) => assumption.status === "active") ||
    (assumptions.length === 0 &&
      (input.assumptionIds?.length ?? 0) > 0);

  if (hasActiveAssumption) {
    return "CALCULATED_WITH_ASSUMPTION";
  }

  if (input.lowConfidence) {
    return "CALCULATED_LOW_CONFIDENCE";
  }

  return "CONFIRMED";
}
