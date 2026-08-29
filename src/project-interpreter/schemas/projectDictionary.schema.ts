import { z } from "zod";

export const bboxSchema = z.object({
  x0: z.number(),
  y0: z.number(),
  x1: z.number(),
  y1: z.number(),
});

export const provenanceRefSchema = z.object({
  kind: z.enum(["compiler", "artifact", "ocr", "vision_region"]),
  pageNumber: z.number().int().positive().optional(),
  region: bboxSchema.optional(),
  observationId: z.string().optional(),
  artifactPath: z.string().optional(),
  toolCallId: z.string(),
});

export const projectObservationSchema = z.object({
  id: z.string(),
  claim: z.string(),
  provenance: z.array(provenanceRefSchema).min(1),
});

export const projectConventionHypothesisSchema = z.object({
  id: z.string(),
  status: z.enum(["hypothesis", "established_rule", "rejected", "unresolved"]),
  conventionClass: z.string(),
  claim: z.string(),
  provenance: z.array(provenanceRefSchema).min(1),
  governanceNotes: z.array(z.string()).optional(),
  /** Audit only — never used by governance scoring. */
  modelConfidence: z.number().min(0).max(1).optional(),
});

export const projectSemanticDefinitionSchema = z.object({
  semanticTypeKey: z.string(),
  sourcePage: z.number().int().positive(),
  properties: z.array(
    z.object({
      propertyPath: z.string(),
      rawText: z.string(),
    }),
  ),
  status: z.literal("definition"),
  provenance: z.array(provenanceRefSchema).min(1),
});

export const projectReferenceBindingSchema = z.object({
  physicalRunKey: z.string(),
  referenceKey: z.string().nullable(),
  status: z.enum([
    "hypothesis",
    "established_binding",
    "rejected",
    "unresolved",
  ]),
  mechanism: z.string(),
  provenance: z.array(provenanceRefSchema).min(1),
  governanceNotes: z.array(z.string()).optional(),
  modelConfidence: z.number().min(0).max(1).optional(),
});

export const projectUnresolvedSchema = z.object({
  id: z.string(),
  question: z.string(),
  reason: z.string(),
});

export const projectContradictionSchema = z.object({
  id: z.string(),
  description: z.string(),
  sources: z.array(provenanceRefSchema).min(1),
});

export const experimentBranchSchema = z.enum([
  "visual_heavy",
  "compiler_heavy",
  "hybrid",
]);

export const projectDictionaryMetricsSchema = z.object({
  toolCalls: z.number().int().nonnegative(),
  tokens: z.number().int().nonnegative(),
  durationMs: z.number().nonnegative(),
  regionInspectCount: z.number().int().nonnegative().optional(),
  interpreterMode: z.enum(["claude", "compiler_seed"]).optional(),
});

export const projectDictionarySchema = z.object({
  projectId: z.string(),
  generatedAt: z.string(),
  interpreterModel: z.string(),
  experimentBranch: experimentBranchSchema,
  observations: z.array(projectObservationSchema),
  hypotheses: z.array(projectConventionHypothesisSchema),
  definitions: z.array(projectSemanticDefinitionSchema),
  bindings: z.array(projectReferenceBindingSchema),
  unresolved: z.array(projectUnresolvedSchema),
  contradictions: z.array(projectContradictionSchema),
  metrics: projectDictionaryMetricsSchema,
});

export type Bbox = z.infer<typeof bboxSchema>;
export type ProvenanceRef = z.infer<typeof provenanceRefSchema>;
export type ProjectObservation = z.infer<typeof projectObservationSchema>;
export type ProjectConventionHypothesis = z.infer<
  typeof projectConventionHypothesisSchema
>;
export type ProjectSemanticDefinition = z.infer<
  typeof projectSemanticDefinitionSchema
>;
export type ProjectReferenceBinding = z.infer<
  typeof projectReferenceBindingSchema
>;
export type ProjectUnresolved = z.infer<typeof projectUnresolvedSchema>;
export type ProjectContradiction = z.infer<typeof projectContradictionSchema>;
export type ExperimentBranch = z.infer<typeof experimentBranchSchema>;
export type ProjectDictionary = z.infer<typeof projectDictionarySchema>;

export const governedProjectDictionarySchema = projectDictionarySchema.extend({
  governance: z.object({
    evaluatedAt: z.string(),
    passRate: z.number().min(0).max(1),
    acceptedHypothesisIds: z.array(z.string()),
    rejectedHypothesisIds: z.array(z.string()),
    acceptedBindingIds: z.array(z.string()),
    rejectedBindingIds: z.array(z.string()),
    acceptedDefinitionKeys: z.array(z.string()).default([]),
    rejectedDefinitionKeys: z.array(z.string()).default([]),
    validatorResults: z.array(
      z.object({
        validator: z.string(),
        claimId: z.string(),
        passed: z.boolean(),
        message: z.string(),
      }),
    ),
    greenOutcome: z.enum(["GREEN", "FAILURE", "STOP"]).nullable(),
    greenCriterion: z.string().nullable(),
  }),
});

export type GovernedProjectDictionary = z.infer<
  typeof governedProjectDictionarySchema
>;
