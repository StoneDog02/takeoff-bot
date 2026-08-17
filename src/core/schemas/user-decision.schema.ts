import { z } from "zod";

import {
  evidenceIdSchema,
  identifierSchema,
  reviewItemIdSchema,
  userDecisionIdSchema,
} from "./identity.schema.js";

/**
 * JSON-safe value accepted from a user decision.
 *
 * The core contract guarantees deterministic serialization. The subsystem
 * that owns the target property remains responsible for validating the value
 * against its domain schema before applying it.
 */
export type UserDecisionValue =
  | string
  | number
  | boolean
  | null
  | UserDecisionValue[]
  | { [key: string]: UserDecisionValue };

export const userDecisionValueSchema: z.ZodType<UserDecisionValue> =
  z.lazy(() =>
    z.union([
      z.string(),
      z.number().finite(),
      z.boolean(),
      z.null(),
      z.array(userDecisionValueSchema),
      z.record(userDecisionValueSchema),
    ]),
  );

const optionalRationaleSchema = z
  .string()
  .trim()
  .min(1)
  .nullable()
  .default(null);

/**
 * Persisted outcomes of actionable Review Items.
 *
 * inspect-source is intentionally excluded because viewing source material is
 * navigation, not a decision that changes deterministic engine state.
 */
export const userDecisionResultTypeSchema = z.enum([
  "acknowledged",
  "confirmed",
  "value-provided",
  "option-selected",
  "conflict-resolved",
  "rejected",
]);

const userDecisionResultBaseSchema = z.object({
  rationale: optionalRationaleSchema,
});

export const userDecisionResultSchema = z
  .discriminatedUnion("type", [
    userDecisionResultBaseSchema.extend({
      type: z.literal("acknowledged"),
    }),
    userDecisionResultBaseSchema.extend({
      type: z.literal("confirmed"),
    }),
    z.object({
      type: z.literal("value-provided"),
      value: userDecisionValueSchema,
      rationale: z.string().trim().min(1),
    }),
    userDecisionResultBaseSchema.extend({
      type: z.literal("option-selected"),
      optionId: identifierSchema,
      value: userDecisionValueSchema,
    }),
    z.object({
      type: z.literal("conflict-resolved"),
      value: userDecisionValueSchema,
      acceptedEvidenceIds: z.array(evidenceIdSchema).min(1),
      rejectedEvidenceIds: z.array(evidenceIdSchema).default([]),
      rationale: z.string().trim().min(1),
    }),
    z.object({
      type: z.literal("rejected"),
      rationale: z.string().trim().min(1),
    }),
  ])
  .superRefine((result, context) => {
    if (result.type !== "conflict-resolved") {
      return;
    }

    if (
      new Set(result.acceptedEvidenceIds).size !==
      result.acceptedEvidenceIds.length
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["acceptedEvidenceIds"],
        message: "acceptedEvidenceIds must not contain duplicate IDs.",
      });
    }

    if (
      new Set(result.rejectedEvidenceIds).size !==
      result.rejectedEvidenceIds.length
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rejectedEvidenceIds"],
        message: "rejectedEvidenceIds must not contain duplicate IDs.",
      });
    }

    const rejectedEvidenceIds = new Set(result.rejectedEvidenceIds);

    if (
      result.acceptedEvidenceIds.some((evidenceId) =>
        rejectedEvidenceIds.has(evidenceId),
      )
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rejectedEvidenceIds"],
        message:
          "An evidence ID cannot be both accepted and rejected.",
      });
    }
  });

/**
 * One immutable user response to one actionable Review Item.
 *
 * A proactive override first creates a user-request Review Item, preserving a
 * complete request/decision audit trail. Revised decisions create a new record
 * that references the decision it supersedes; existing decisions are never
 * mutated.
 *
 * This payload is intended to be persisted one decision per artifact envelope,
 * which owns actor, timestamp, producer, version, and lineage metadata.
 */
export const userDecisionSchema = z
  .object({
    id: userDecisionIdSchema,
    reviewItemId: reviewItemIdSchema,
    result: userDecisionResultSchema,
    supersedesUserDecisionId: userDecisionIdSchema
      .nullable()
      .default(null),
  })
  .superRefine((decision, context) => {
    if (decision.supersedesUserDecisionId === decision.id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["supersedesUserDecisionId"],
        message: "A User Decision cannot supersede itself.",
      });
    }
  });

export type UserDecisionResultType = z.infer<
  typeof userDecisionResultTypeSchema
>;
export type UserDecisionResult = z.infer<
  typeof userDecisionResultSchema
>;
export type UserDecision = z.infer<typeof userDecisionSchema>;
