import type { ObjectId } from "../../../core/schemas/identity.schema.js";
import {
  getClaimCriticalInputContract,
  getMaterialClaimRole,
  type ClaimCriticalInputContract,
} from "./claimContracts.js";
import { isOpeningCategoryEligibleForQuantityKey } from "./openingClaimApplicability.js";

/**
 * Deterministic reason a candidate was not admitted as a product material claim.
 */
export type ClaimAdmissionSuppressionReason =
  | "non_emit_key"
  | "unknown_quantity_key"
  | "wrong_owner_type"
  | "inapplicable_category"
  | "missing_category_context"
  | "no_canonical_owners"
  | "non_occurrence_identity";

export type ClaimAdmissionDecision =
  | {
      admitted: true;
      contract: ClaimCriticalInputContract;
      /** Canonical quantity-owner object IDs for pending minting. */
      ownerObjectIds: readonly ObjectId[];
      ownerObjectType: string;
    }
  | {
      admitted: false;
      reason: ClaimAdmissionSuppressionReason;
      detail: string;
    };

export type ClaimCandidacyContext = {
  /** Opening category by opening object id (for applicability). */
  openingCategoryById?: ReadonlyMap<string, string>;
  /** Opening identityRole by opening object id (M3). */
  openingIdentityRoleById?: ReadonlyMap<string, string>;
  /** Wall segment ids keyed by parent building-wall id. */
  segmentIdsByWallId?: ReadonlyMap<string, readonly ObjectId[]>;
  /** Floor area ids keyed by parent floor-framing-system id. */
  areaIdsByFloorSystemId?: ReadonlyMap<string, readonly ObjectId[]>;
  /** Roof plane ids keyed by parent roof-framing-system id. */
  planeIdsByRoofSystemId?: ReadonlyMap<string, readonly ObjectId[]>;
  /** Sheathing area ids keyed by parent sheathing-system id. */
  areaIdsBySheathingSystemId?: ReadonlyMap<string, readonly ObjectId[]>;
};

/**
 * Decide whether a validation/calculator blocked quantityKey on an object is a
 * legitimate product material-claim candidate, and which canonical owners own it.
 *
 * Does not invent quantities. Does not consult the assumption registry.
 */
export function admitMaterialClaimCandidate(input: {
  quantityKey: string;
  objectId: ObjectId;
  objectType: string;
  context?: ClaimCandidacyContext;
}): ClaimAdmissionDecision {
  const role = getMaterialClaimRole(input.quantityKey);
  if (role === undefined) {
    return {
      admitted: false,
      reason: "unknown_quantity_key",
      detail: `No claim role registered for ${input.quantityKey}.`,
    };
  }
  if (role !== "emit") {
    return {
      admitted: false,
      reason: "non_emit_key",
      detail: `${input.quantityKey} has claimRole=${role}; not a product material claim.`,
    };
  }

  const contract = getClaimCriticalInputContract(input.quantityKey);
  if (!contract) {
    return {
      admitted: false,
      reason: "unknown_quantity_key",
      detail: `Emit role without contract for ${input.quantityKey}.`,
    };
  }

  const ownerTypes = new Set(contract.quantityOwnerObjectTypes);
  const contributorTypes = new Set(contract.assemblyContributorObjectTypes);

  if (ownerTypes.has(input.objectType)) {
    const applicability = checkOpeningApplicability(
      contract,
      input.objectId,
      input.objectType,
      input.context,
    );
    if (applicability !== null) {
      return applicability;
    }
    return {
      admitted: true,
      contract,
      ownerObjectIds: [input.objectId],
      ownerObjectType: input.objectType,
    };
  }

  if (contributorTypes.has(input.objectType)) {
    const children = resolveContributorChildren(
      contract,
      input.objectId,
      input.objectType,
      input.context,
    );
    if (children.length === 0) {
      return {
        admitted: false,
        reason: "no_canonical_owners",
        detail: `${input.objectType} ${input.objectId} has no child quantity owners for ${input.quantityKey}.`,
      };
    }
    return {
      admitted: true,
      contract,
      ownerObjectIds: children,
      ownerObjectType: contract.quantityOwnerObjectTypes[0]!,
    };
  }

  return {
    admitted: false,
    reason: "wrong_owner_type",
    detail: `${input.objectType} is not a quantity owner or assembly contributor for ${input.quantityKey}.`,
  };
}

function checkOpeningApplicability(
  contract: ClaimCriticalInputContract,
  objectId: ObjectId,
  objectType: string,
  context: ClaimCandidacyContext | undefined,
): Extract<ClaimAdmissionDecision, { admitted: false }> | null {
  if (objectType !== "opening") {
    return null;
  }

  const identityRole = context?.openingIdentityRoleById?.get(objectId);
  if (identityRole === "schedule_definition") {
    return {
      admitted: false,
      reason: "non_occurrence_identity",
      detail: `Opening ${objectId} identityRole=schedule_definition cannot own emit claim ${contract.quantityKey}.`,
    };
  }

  if (contract.eligibleOpeningCategories == null) {
    return null;
  }
  const category = context?.openingCategoryById?.get(objectId);
  if (category === undefined) {
    return {
      admitted: false,
      reason: "missing_category_context",
      detail: `Opening ${objectId} category unavailable for ${contract.quantityKey} admission.`,
    };
  }
  if (!isOpeningCategoryEligibleForQuantityKey(contract.quantityKey, category)) {
    return {
      admitted: false,
      reason: "inapplicable_category",
      detail: `Opening category ${category} is not eligible for ${contract.quantityKey}.`,
    };
  }
  return null;
}

function resolveContributorChildren(
  contract: ClaimCriticalInputContract,
  objectId: ObjectId,
  objectType: string,
  context: ClaimCandidacyContext | undefined,
): ObjectId[] {
  if (objectType === "building-wall") {
    return [...(context?.segmentIdsByWallId?.get(objectId) ?? [])];
  }
  if (objectType === "floor-framing-system") {
    return [...(context?.areaIdsByFloorSystemId?.get(objectId) ?? [])];
  }
  if (objectType === "roof-framing-system") {
    return [...(context?.planeIdsByRoofSystemId?.get(objectId) ?? [])];
  }
  if (objectType === "sheathing-system") {
    return [...(context?.areaIdsBySheathingSystemId?.get(objectId) ?? [])];
  }
  void contract;
  return [];
}

/**
 * Whether a review quantity impact touches an emit-capable material claim key.
 * Used for contractor-actionable review projection (blocking or correcting).
 */
export function quantityKeyAffectsAdmittedEmitClaim(
  quantityKey: string | null | undefined,
): boolean {
  if (quantityKey == null || quantityKey.trim().length === 0) {
    return false;
  }
  return getMaterialClaimRole(quantityKey) === "emit";
}
