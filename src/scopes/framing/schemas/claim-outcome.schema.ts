import { z } from "zod";

import {
  assumptionIdSchema,
  identifierSchema,
  objectIdSchema,
  reviewItemIdSchema,
} from "../../../core/schemas/identity.schema.js";

const pendingClaimUnitSchema = z.enum([
  "each",
  "linear-foot",
  "square-foot",
  "sheet",
  "board-foot",
  "pound",
]);

/**
 * Material claim outcome states for the Material Claim Authority Ladder.
 *
 * CALCULATED_* rows carry a positive quantity on FramingMaterialLineItem.
 * BLOCKED_* / UNSUPPORTED appear as companion pending-claim rows (no quantity).
 */
export const materialClaimStatusSchema = z.enum([
  "CONFIRMED",
  "CALCULATED_WITH_ASSUMPTION",
  "CALCULATED_LOW_CONFIDENCE",
  "APPLICABILITY_REVIEW",
  "BLOCKED_MISSING_REQUIRED_INPUT",
  "BLOCKED_CONFLICT",
  "UNSUPPORTED_CAPABILITY",
]);

export const pendingMaterialClaimSchema = z.object({
  id: identifierSchema,
  quantityKey: z.string().trim().min(1),
  claimStatus: materialClaimStatusSchema.refine(
    (status) =>
      status === "BLOCKED_MISSING_REQUIRED_INPUT" ||
      status === "BLOCKED_CONFLICT" ||
      status === "UNSUPPORTED_CAPABILITY" ||
      status === "APPLICABILITY_REVIEW",
    {
      message:
        "Pending claims must use a non-quantity claim status (blocked, unsupported, or applicability review).",
    },
  ),
  description: z.string().trim().min(1),
  unit: pendingClaimUnitSchema.nullable().default(null),
  sourceObjectIds: z.array(objectIdSchema).min(1),
  missingPropertyPath: z.string().trim().min(1).nullable().default(null),
  basis: z.string().trim().min(1),
  assumptionIds: z.array(assumptionIdSchema).default([]),
  reviewItemIds: z.array(reviewItemIdSchema).default([]),
});

export type MaterialClaimStatus = z.infer<typeof materialClaimStatusSchema>;
export type PendingMaterialClaim = z.infer<typeof pendingMaterialClaimSchema>;
