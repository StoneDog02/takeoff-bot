import type { ObjectId } from "../../../core/schemas/identity.schema.js";
import type { ValidationPayload } from "../schemas/framing-artifacts.schema.js";
import {
  pendingMaterialClaimSchema,
  type PendingMaterialClaim,
} from "../schemas/claim-outcome.schema.js";
import type { FramingMaterialLineItem } from "../schemas/material.schema.js";
import {
  BLOCKING_QUANTITY_KEYS,
  CONNECTORS_HARDWARE_QUANTITY_KEYS,
} from "../validators/rule-ids.js";
import { createMaterialLineItemId } from "../calculators/ids.js";
import {
  admitMaterialClaimCandidate,
  type ClaimAdmissionSuppressionReason,
  type ClaimCandidacyContext,
} from "./admitMaterialClaimCandidate.js";
import { getClaimCriticalInputContract } from "./claimContracts.js";
import { lookupAssumptionRegistryEntry } from "./assumptionRegistry.js";

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function materialCoversClaim(
  materials: readonly FramingMaterialLineItem[],
  quantityKey: string,
  objectId: ObjectId,
): boolean {
  const expectedId = createMaterialLineItemId(quantityKey, objectId);
  return materials.some((material) => {
    if (material.id === expectedId) {
      return true;
    }
    if (
      material.quantityKey === quantityKey &&
      material.sourceObjectIds.includes(objectId)
    ) {
      return true;
    }
    return false;
  });
}

function createPendingClaimId(
  quantityKey: string,
  objectId: ObjectId,
): string {
  return `PENDING-${quantityKey.replaceAll(".", "-")}-object-${objectId}`;
}

const UNSUPPORTED_KEYS: readonly {
  quantityKey: string;
  description: string;
}[] = [
  {
    quantityKey: BLOCKING_QUANTITY_KEYS.quantity,
    description: "Blocking quantity (calculator not wired)",
  },
  {
    quantityKey: BLOCKING_QUANTITY_KEYS.material,
    description: "Blocking material (calculator not wired)",
  },
  {
    quantityKey: CONNECTORS_HARDWARE_QUANTITY_KEYS.connectorMaterial,
    description: "Connector material (calculator not wired)",
  },
  {
    quantityKey: CONNECTORS_HARDWARE_QUANTITY_KEYS.hardwareMaterial,
    description: "Hardware material (calculator not wired)",
  },
];

export type PendingClaimSuppression = {
  quantityKey: string;
  objectId: ObjectId;
  objectType: string;
  reason: ClaimAdmissionSuppressionReason;
  detail: string;
};

/**
 * Horizontal pending-claim collection from validation impacts and unwired keys.
 * Does not invent quantities. Only admit-capable emit candidates become pending.
 * Registry-authorized misses stay blocked at the calculator (not double-pending).
 */
export function collectPendingClaims(input: {
  validation?: ValidationPayload;
  materials: readonly FramingMaterialLineItem[];
  /** Optional explicit pending claims from calculators. */
  explicitPendingClaims?: readonly PendingMaterialClaim[];
  /** Domain context for owner remapping and opening applicability. */
  candidacyContext?: ClaimCandidacyContext;
  /** When provided, filled with deterministic suppression audit rows. */
  suppressionsOut?: PendingClaimSuppression[];
}): PendingMaterialClaim[] {
  const pending: PendingMaterialClaim[] = [
    ...(input.explicitPendingClaims ?? []),
  ];
  const seen = new Set(pending.map((claim) => claim.id));
  const suppressions = input.suppressionsOut;

  const validation = input.validation;
  if (validation) {
    for (const issue of validation.validationIssues) {
      if (issue.target.kind !== "object") {
        continue;
      }
      const objectId = issue.target.objectId;
      const objectType = issue.target.objectType;
      for (const impact of issue.quantityImpacts) {
        if (impact.canCalculate !== false) {
          continue;
        }
        const quantityKey = impact.quantityKey;
        if (quantityKey == null || quantityKey.trim().length === 0) {
          continue;
        }

        const decision = admitMaterialClaimCandidate({
          quantityKey,
          objectId,
          objectType,
          context: input.candidacyContext,
        });

        if (!decision.admitted) {
          suppressions?.push({
            quantityKey,
            objectId,
            objectType,
            reason: decision.reason,
            detail: decision.detail,
          });
          continue;
        }

        for (const ownerObjectId of decision.ownerObjectIds) {
          if (materialCoversClaim(input.materials, quantityKey, ownerObjectId)) {
            continue;
          }

          const contract = decision.contract;
          const id = createPendingClaimId(quantityKey, ownerObjectId);
          if (seen.has(id)) {
            continue;
          }

          const claim = pendingMaterialClaimSchema.parse({
            id,
            quantityKey,
            claimStatus: "BLOCKED_MISSING_REQUIRED_INPUT",
            description:
              impact.description.trim().length > 0
                ? impact.description
                : `Pending ${quantityKey}`,
            unit: contract.unit ?? null,
            sourceObjectIds: [ownerObjectId],
            missingPropertyPath: null,
            basis: `Validation blocked ${quantityKey} with canCalculate=false; no calculated material line.`,
            assumptionIds: [],
            reviewItemIds: [],
          });
          pending.push(claim);
          seen.add(id);
        }
      }
    }
  }

  // Unwired package capability markers (no object context) — one row per key.
  for (const unsupported of UNSUPPORTED_KEYS) {
    const id = `PENDING-${unsupported.quantityKey.replaceAll(".", "-")}-unsupported`;
    if (seen.has(id)) {
      continue;
    }
    const covered = input.materials.some(
      (material) => material.quantityKey === unsupported.quantityKey,
    );
    if (covered) {
      continue;
    }
    pending.push(
      pendingMaterialClaimSchema.parse({
        id,
        quantityKey: unsupported.quantityKey,
        claimStatus: "UNSUPPORTED_CAPABILITY",
        description: unsupported.description,
        unit: null,
        sourceObjectIds: ["CAPABILITY-UNWIRED" as ObjectId],
        missingPropertyPath: null,
        basis: "Domain calculator / package pipeline is not wired for this quantityKey.",
        assumptionIds: [],
        reviewItemIds: [],
      }),
    );
    seen.add(id);
  }

  return pending.sort((left, right) => compareIds(left.id, right.id));
}

/**
 * Helper for calculators: emit pending when a claim-critical property is
 * unresolved and the assumption registry has no eligible entry.
 *
 * Calculators have already applied eligibility gates; when candidacyContext is
 * omitted, only emit-role + owner-type checks run (no category re-gate).
 */
export function createBlockedMissingInputPendingClaim(input: {
  quantityKey: string;
  objectId: ObjectId;
  missingPropertyPath: string;
  description: string;
  basis: string;
  reviewItemIds?: string[];
  /** Optional objectType for admission (defaults to opening for opening keys). */
  objectType?: string;
  candidacyContext?: ClaimCandidacyContext;
}): PendingMaterialClaim | null {
  const registered = lookupAssumptionRegistryEntry(
    input.quantityKey,
    input.missingPropertyPath,
  );
  if (registered) {
    return null;
  }

  const objectType = input.objectType ?? "opening";

  if (input.candidacyContext) {
    const decision = admitMaterialClaimCandidate({
      quantityKey: input.quantityKey,
      objectId: input.objectId,
      objectType,
      context: input.candidacyContext,
    });
    if (!decision.admitted) {
      return null;
    }
  } else {
    const contract = getClaimCriticalInputContract(input.quantityKey);
    if (!contract || contract.claimRole !== "emit") {
      return null;
    }
    if (!contract.quantityOwnerObjectTypes.includes(objectType)) {
      return null;
    }
  }

  const contract = getClaimCriticalInputContract(input.quantityKey);
  return pendingMaterialClaimSchema.parse({
    id: createPendingClaimId(input.quantityKey, input.objectId),
    quantityKey: input.quantityKey,
    claimStatus: "BLOCKED_MISSING_REQUIRED_INPUT",
    description: input.description,
    unit: contract?.unit ?? null,
    sourceObjectIds: [input.objectId],
    missingPropertyPath: input.missingPropertyPath,
    basis: input.basis,
    assumptionIds: [],
    reviewItemIds: input.reviewItemIds ?? [],
  });
}
