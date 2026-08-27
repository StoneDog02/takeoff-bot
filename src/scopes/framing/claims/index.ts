export {
  getClaimCriticalInputContract,
  getMaterialClaimRole,
  isClaimCriticalPropertyForQuantity,
  isEmitCapableQuantityKey,
  isReviewOnlyPropertyForQuantity,
  listClaimCriticalInputContracts,
  type ClaimCriticalInputContract,
  type MaterialClaimRole,
} from "./claimContracts.js";
export {
  consultAssumptionRegistry,
  listAssumptionRegistryEntries,
  lookupAssumptionRegistryEntry,
  type AssumptionConsultationResult,
  type AssumptionRegistryContext,
  type AssumptionRegistryEntry,
} from "./assumptionRegistry.js";
export { deriveMaterialClaimStatus } from "./deriveClaimStatus.js";
export {
  collectPendingClaims,
  createBlockedMissingInputPendingClaim,
  type PendingClaimSuppression,
} from "./collectPendingClaims.js";
export { applyAssumptionUserDecisionLifecycle } from "./applyAssumptionLifecycle.js";
export {
  admitMaterialClaimCandidate,
  quantityKeyAffectsAdmittedEmitClaim,
  type ClaimAdmissionDecision,
  type ClaimAdmissionSuppressionReason,
  type ClaimCandidacyContext,
} from "./admitMaterialClaimCandidate.js";
export { buildClaimCandidacyContext } from "./buildClaimCandidacyContext.js";
export {
  eligibleOpeningCategoriesForQuantityKey,
  isOpeningCategoryEligibleForQuantityKey,
  OPENING_CRIPPLES_ABOVE_ELIGIBLE_CATEGORIES,
  OPENING_CRIPPLES_BELOW_ELIGIBLE_CATEGORIES,
  OPENING_ROUGH_SILL_ELIGIBLE_CATEGORIES,
  OPENING_WALL_FRAMING_ELIGIBLE_CATEGORIES,
} from "./openingClaimApplicability.js";
