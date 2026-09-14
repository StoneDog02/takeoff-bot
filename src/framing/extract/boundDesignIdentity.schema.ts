import { z } from "zod";

/**
 * Status of a single source kind in a bound design identity.
 *
 * Per V1 spec §13.4: Cross-sheet evidence sources (plan mark, schedule/dictionary
 * definition, detail/section) bind to one project design identity as they become
 * available. Distinct sources may bind to the same identity. A partial bind
 * (subset bound with some kinds missing) stays inspectable under that same
 * identity; the missing path stays explicit.
 */
export const sourceKindStatusSchema = z.enum([
  /** Source kind was attempted and successfully established. */
  "established",
  /** Source kind was attempted but not found/resolved. */
  "missing",
  /** Source kind was not attempted (e.g., budget exhausted before attempt). */
  "unattempted",
  /** Source kind attempt was deferred (budget/policy). */
  "deferred",
  /** Source kind resolution is unresolved (ambiguous or failed). */
  "unresolved",
]);

export type SourceKindStatus = z.infer<typeof sourceKindStatusSchema>;

/**
 * Provenance of a single source kind in a bound design identity.
 */
export const sourceKindProvenanceSchema = z.object({
  /** Status of this source kind. */
  status: sourceKindStatusSchema,
  /** Human-readable reason for this status. */
  reason: z.string().trim().min(1).nullable().default(null),
  /** Navigation key / queue item ID that attempted this source kind. */
  queueItemId: z.string().trim().min(1).nullable().default(null),
  /** Page number where evidence was found (for plan mark, detail). */
  sourcePageNumber: z.number().int().positive().nullable().default(null),
  /** Sheet ID where evidence was found. */
  sourceSheetId: z.string().trim().min(1).nullable().default(null),
  /** Detail/section number (for detail source kind). */
  detailNumber: z.string().trim().min(1).nullable().default(null),
  /** Dictionary/schedule semantic type key (for definition source kind). */
  semanticTypeKey: z.string().trim().min(1).nullable().default(null),
  /** Extraction pass ID if evidence was extracted. */
  extractionPassId: z.string().trim().min(1).nullable().default(null),
});

export type SourceKindProvenance = z.infer<typeof sourceKindProvenanceSchema>;

/**
 * A bound design identity tracks the binding of three source kinds
 * (plan mark, schedule/dictionary definition, detail/section) to one
 * project design identity.
 *
 * Per V1 spec §13.4 + locked amendment:
 * - A bound design does NOT require every source kind to be established.
 * - Distinct sources may bind to the same identity as they become available.
 * - Partial bind stays inspectable; the missing path stays explicit.
 * - Must NOT invent the missing source, reject identity because one kind
 *   is absent, treat the gap as established, or count partial bind as
 *   ReadComplete exhaustion.
 * - Dictionary does not complete the hop (dictionary is context, not hop completion).
 * - Budget is not ReadComplete.
 */
export const boundDesignIdentitySchema = z.object({
  /** Stable subject key identifying this design across sources. */
  subjectKey: z.string().trim().min(1),
  /** Subject kind (e.g., structural-member, wall). */
  subjectKind: z.string().trim().min(1),
  /**
   * Plan mark / location source.
   * Where on plans the element appears (e.g., "B4 plan location").
   */
  planMark: sourceKindProvenanceSchema,
  /**
   * Schedule / dictionary definition source.
   * The definition from schedules (e.g., "B4 beam schedule").
   * Note: Dictionary is context, not hop completion. A dictionary hit
   * does not skip required plan/detail hops.
   */
  definition: sourceKindProvenanceSchema,
  /**
   * Detail / section source.
   * Specific construction details (e.g., "B4 structural detail").
   */
  detail: sourceKindProvenanceSchema,
  /**
   * Whether this identity has all three source kinds established.
   * False means partial bind (some kinds missing/deferred/unattempted/unresolved).
   */
  isComplete: z.boolean(),
  /**
   * Whether this identity has at least one source kind established.
   * Must be true for a valid bound design identity.
   */
  hasAnyEstablished: z.boolean(),
  /**
   * Summary of why this identity is partial (when isComplete is false).
   * Lists the missing/deferred/unattempted/unresolved source kinds explicitly.
   */
  partialReason: z.string().trim().min(1).nullable().default(null),
});

export type BoundDesignIdentity = z.infer<typeof boundDesignIdentitySchema>;

/**
 * Collection of bound design identities tracked during reference drain.
 */
export const boundDesignIdentityCollectionSchema = z.object({
  identities: z.array(boundDesignIdentitySchema),
  /**
   * Audit summary of binding completeness.
   */
  audit: z.object({
    /** Total identities tracked. */
    totalIdentities: z.number().int().nonnegative(),
    /** Identities with all three source kinds established. */
    completeIdentities: z.number().int().nonnegative(),
    /** Identities with partial binding (some kinds missing). */
    partialIdentities: z.number().int().nonnegative(),
    /** Dictionary hits that did NOT skip detail/plan hops. */
    dictionaryHitsWithContinuedHops: z.number().int().nonnegative(),
    /** References deferred due to budget (not ReadComplete established). */
    budgetDeferredReferences: z.number().int().nonnegative(),
  }),
});

export type BoundDesignIdentityCollection = z.infer<
  typeof boundDesignIdentityCollectionSchema
>;

/**
 * Creates an empty source kind provenance with unattempted status.
 */
export function createUnattemptedSourceKind(
  reason?: string,
): SourceKindProvenance {
  return {
    status: "unattempted",
    reason: reason ?? "Source kind not attempted.",
    queueItemId: null,
    sourcePageNumber: null,
    sourceSheetId: null,
    detailNumber: null,
    semanticTypeKey: null,
    extractionPassId: null,
  };
}

/**
 * Creates a source kind provenance with deferred status.
 */
export function createDeferredSourceKind(
  reason: string,
  queueItemId?: string,
): SourceKindProvenance {
  return {
    status: "deferred",
    reason,
    queueItemId: queueItemId ?? null,
    sourcePageNumber: null,
    sourceSheetId: null,
    detailNumber: null,
    semanticTypeKey: null,
    extractionPassId: null,
  };
}

/**
 * Creates a source kind provenance with established status.
 */
export function createEstablishedSourceKind(input: {
  reason?: string;
  queueItemId?: string;
  sourcePageNumber?: number;
  sourceSheetId?: string;
  detailNumber?: string;
  semanticTypeKey?: string;
  extractionPassId?: string;
}): SourceKindProvenance {
  return {
    status: "established",
    reason: input.reason ?? "Source kind established.",
    queueItemId: input.queueItemId ?? null,
    sourcePageNumber: input.sourcePageNumber ?? null,
    sourceSheetId: input.sourceSheetId ?? null,
    detailNumber: input.detailNumber ?? null,
    semanticTypeKey: input.semanticTypeKey ?? null,
    extractionPassId: input.extractionPassId ?? null,
  };
}

/**
 * Creates a source kind provenance with missing status.
 */
export function createMissingSourceKind(
  reason: string,
  queueItemId?: string,
): SourceKindProvenance {
  return {
    status: "missing",
    reason,
    queueItemId: queueItemId ?? null,
    sourcePageNumber: null,
    sourceSheetId: null,
    detailNumber: null,
    semanticTypeKey: null,
    extractionPassId: null,
  };
}

/**
 * Creates a source kind provenance with unresolved status.
 */
export function createUnresolvedSourceKind(
  reason: string,
  queueItemId?: string,
): SourceKindProvenance {
  return {
    status: "unresolved",
    reason,
    queueItemId: queueItemId ?? null,
    sourcePageNumber: null,
    sourceSheetId: null,
    detailNumber: null,
    semanticTypeKey: null,
    extractionPassId: null,
  };
}

/**
 * Computes whether a bound design identity is complete and builds the partial reason.
 */
export function computeBoundDesignCompleteness(input: {
  planMark: SourceKindProvenance;
  definition: SourceKindProvenance;
  detail: SourceKindProvenance;
}): { isComplete: boolean; hasAnyEstablished: boolean; partialReason: string | null } {
  const established = [
    input.planMark.status === "established",
    input.definition.status === "established",
    input.detail.status === "established",
  ];
  const isComplete = established.every(Boolean);
  const hasAnyEstablished = established.some(Boolean);

  if (isComplete) {
    return { isComplete: true, hasAnyEstablished: true, partialReason: null };
  }

  const reasons: string[] = [];
  if (input.planMark.status !== "established") {
    reasons.push(`planMark:${input.planMark.status}`);
  }
  if (input.definition.status !== "established") {
    reasons.push(`definition:${input.definition.status}`);
  }
  if (input.detail.status !== "established") {
    reasons.push(`detail:${input.detail.status}`);
  }

  return {
    isComplete: false,
    hasAnyEstablished,
    partialReason: reasons.join("; "),
  };
}

/**
 * Creates a bound design identity from its constituent source kind provenances.
 */
export function createBoundDesignIdentity(input: {
  subjectKey: string;
  subjectKind: string;
  planMark: SourceKindProvenance;
  definition: SourceKindProvenance;
  detail: SourceKindProvenance;
}): BoundDesignIdentity {
  const { isComplete, hasAnyEstablished, partialReason } =
    computeBoundDesignCompleteness({
      planMark: input.planMark,
      definition: input.definition,
      detail: input.detail,
    });

  return boundDesignIdentitySchema.parse({
    subjectKey: input.subjectKey,
    subjectKind: input.subjectKind,
    planMark: input.planMark,
    definition: input.definition,
    detail: input.detail,
    isComplete,
    hasAnyEstablished,
    partialReason,
  });
}
