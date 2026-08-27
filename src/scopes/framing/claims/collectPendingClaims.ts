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
  return materials.some(
    (material) =>
      material.quantityKey === quantityKey &&
      material.sourceObjectIds.includes(objectId),
  );
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

/**
 * Horizontal pending-claim collection from validation impacts and unwired keys.
 * Does not invent quantities. Registry-authorized misses stay blocked here.
 */
export function collectPendingClaims(input: {
  validation?: ValidationPayload;
  materials: readonly FramingMaterialLineItem[];
  /** Optional explicit pending claims from calculators. */
  explicitPendingClaims?: readonly PendingMaterialClaim[];
}): PendingMaterialClaim[] {
  const pending: PendingMaterialClaim[] = [
    ...(input.explicitPendingClaims ?? []),
  ];
  const seen = new Set(pending.map((claim) => claim.id));

  const validation = input.validation;
  if (validation) {
    for (const issue of validation.validationIssues) {
      if (issue.target.kind !== "object") {
        continue;
      }
      const objectId = issue.target.objectId;
      for (const impact of issue.quantityImpacts) {
        if (impact.canCalculate !== false) {
          continue;
        }
        const quantityKey = impact.quantityKey;
        if (quantityKey == null || quantityKey.trim().length === 0) {
          continue;
        }
        if (materialCoversClaim(input.materials, quantityKey, objectId)) {
          continue;
        }

        const contract = getClaimCriticalInputContract(quantityKey);
        const id = createPendingClaimId(quantityKey, objectId);
        if (seen.has(id)) {
          continue;
        }

        // If a registry entry exists for a typical missing property, calculators
        // should have assumed. Pending here means no authorized path fired.
        const claim = pendingMaterialClaimSchema.parse({
          id,
          quantityKey,
          claimStatus: "BLOCKED_MISSING_REQUIRED_INPUT",
          description:
            impact.description.trim().length > 0
              ? impact.description
              : `Pending ${quantityKey}`,
          unit: contract?.unit ?? null,
          sourceObjectIds: [objectId],
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

  // Unwired package capability markers (no object context) — one row per key.
  for (const unsupported of UNSUPPORTED_KEYS) {
    const id = `PENDING-${unsupported.quantityKey.replaceAll(".", "-")}-unsupported`;
    if (seen.has(id)) {
      continue;
    }
    // Only emit if no material covers the key at all.
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
 */
export function createBlockedMissingInputPendingClaim(input: {
  quantityKey: string;
  objectId: ObjectId;
  missingPropertyPath: string;
  description: string;
  basis: string;
  reviewItemIds?: string[];
}): PendingMaterialClaim | null {
  const registered = lookupAssumptionRegistryEntry(
    input.quantityKey,
    input.missingPropertyPath,
  );
  if (registered) {
    // Caller should have consulted the registry; do not also emit pending.
    return null;
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
