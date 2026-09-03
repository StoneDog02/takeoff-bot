import { z } from "zod";

export const compilerPageRoleSchema = z.enum([
  "plan",
  "elevation",
  "section",
  "detail",
  "unknown",
]);

export const pageRoleResultSchema = z.object({
  role: compilerPageRoleSchema,
  allowsWallPlanLengthEvidence: z.boolean(),
  planHits: z.array(z.string()).default([]),
  elevationHits: z.array(z.string()).default([]),
  sectionHits: z.array(z.string()).default([]),
  detailHits: z.array(z.string()).default([]),
  rawItemCount: z.number().int().nonnegative(),
  method: z.string(),
});

export const candidateSourceSchema = z.enum([
  "detected",
  "near-high-seed",
  "virtual-text",
]);

export const transcriptionAuthoritySchema = z.enum([
  "pdf-text-layer",
  "localized-ocr",
  "unresolved",
]);

export const scaleDecisionStatusSchema = z.enum([
  "pass",
  "reject",
  "unresolved",
]);

export const scaleDecisionSchema = z.object({
  status: scaleDecisionStatusSchema,
  impliedPtPerFt: z.number().optional(),
  peerCount: z.number().optional(),
  reason: z.string().optional(),
});

export const governDecisionSchema = z.object({
  dimId: z.string(),
  emit: z.boolean(),
  pageRoleOk: z.boolean(),
  ownershipOk: z.boolean(),
  sourceOk: z.boolean(),
  scale: scaleDecisionSchema.nullable(),
  reasons: z.array(z.string()),
});

export const governanceAuditSchema = z.object({
  pageRole: pageRoleResultSchema,
  decisions: z.array(governDecisionSchema),
  emitDimIds: z.array(z.string()),
  scaleByDim: z.record(scaleDecisionSchema),
  counts: z.object({
    emit: z.number(),
    rejectPageRole: z.number(),
    rejectOwnership: z.number(),
    rejectVirtual: z.number(),
    rejectScale: z.number(),
    unresolvedScale: z.number(),
    passScale: z.number(),
  }),
});

export type PageRoleResultRecord = z.infer<typeof pageRoleResultSchema>;
export type GovernanceAuditRecord = z.infer<typeof governanceAuditSchema>;
