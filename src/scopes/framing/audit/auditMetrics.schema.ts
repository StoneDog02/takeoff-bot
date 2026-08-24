import { z } from "zod";

export const auditRunModeSchema = z.enum(["A0", "A", "A+", "B"]);

export const capabilityStatusSchema = z.enum([
  "production",
  "flag_gated",
  "artifact_only",
  "unwired",
  "stub",
  "missing",
]);

export const scopeCapabilityClassSchema = z.enum([
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
]);

export const groundTruthLabelSchema = z.enum([
  "VERIFIED_CORRECT",
  "PLAUSIBLE_UNVERIFIED",
  "KNOWN_INCORRECT",
  "UNRESOLVED",
  "NOT_ATTEMPTED",
]);

export type GroundTruthLabel = z.infer<typeof groundTruthLabelSchema>;

export const failureClassSchema = z.enum([
  "MISSING_PRIMITIVE",
  "NOT_WIRED",
  "UNRESOLVED_DOCUMENT_TRUTH",
  "GOVERNANCE_REJECT",
  "OWNERSHIP_FAILURE",
  "TRANSCRIPTION_FAILURE",
  "GEOMETRY_FAILURE",
  "SEMANTIC_FAILURE",
  "RESOLUTION_CONFLICT",
  "CALCULATION_BLOCKED",
  "VALIDATION_FAILURE",
  "GROUND_TRUTH_MISSING",
]);

export const capabilityInventoryEntrySchema = z.object({
  name: z.string(),
  status: capabilityStatusSchema,
  envFlags: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

export const auditSummarySchema = z.object({
  generatedAt: z.string(),
  fixturePdf: z.string(),
  runMode: auditRunModeSchema,
  pipelineSuccess: z.boolean(),
  stageCount: z.number().int(),
  failedStages: z.array(z.string()),
  executionMode: z.enum(["mock", "anthropic"]).nullable(),
  envSnapshot: z.record(z.string()),
  capabilityInventory: z.array(capabilityInventoryEntrySchema),
  topBlocker: z
    .object({
      failureClass: failureClassSchema,
      summary: z.string(),
      productImpact: z.string(),
      rankingMethod: z
        .enum(["dependency_aware_v1", "first_product_blocker"])
        .optional(),
      rankedEntryId: z.string().optional(),
    })
    .nullable(),
});

export const scopeCoverageRowSchema = z.object({
  category: z.string(),
  class: scopeCapabilityClassSchema,
  whatWorks: z.string(),
  whatBlocks: z.string(),
  evidenceRefs: z.array(z.string()).optional(),
});

export const scopeCoverageSchema = z.object({
  runMode: auditRunModeSchema,
  rows: z.array(scopeCoverageRowSchema),
});

export const failureTaxonomyEntrySchema = z.object({
  id: z.string(),
  failureClass: failureClassSchema,
  whatTryingToDetermine: z.string(),
  whatSystemKnew: z.string(),
  whereChainStopped: z.string(),
  why: z.string(),
  productBlocker: z.boolean(),
  unlockCapability: z.string(),
});

export const failureTaxonomySchema = z.object({
  entries: z.array(failureTaxonomyEntrySchema),
});

export const resolutionPropertyStatsSchema = z.object({
  propertyPath: z.string(),
  resolved: z.number().int().nonnegative(),
  unresolved: z.number().int().nonnegative(),
  conflict: z.number().int().nonnegative(),
});

export const resolutionCoverageSchema = z.object({
  walls: z.object({
    count: z.number().int().nonnegative(),
    segments: z.number().int().nonnegative(),
    wallProperties: z.array(resolutionPropertyStatsSchema),
    segmentProperties: z.array(resolutionPropertyStatsSchema),
  }),
  openings: z.object({ count: z.number().int().nonnegative() }),
  structuralMembers: z.object({ count: z.number().int().nonnegative() }),
  floorFraming: z.object({
    systems: z.number().int().nonnegative(),
    areas: z.number().int().nonnegative(),
  }),
  roofFraming: z.object({
    systems: z.number().int().nonnegative(),
    planes: z.number().int().nonnegative(),
  }),
  sheathing: z.object({
    systems: z.number().int().nonnegative(),
    areas: z.number().int().nonnegative(),
  }),
});

export const materialLineSummarySchema = z.object({
  id: z.string(),
  category: z.string(),
  description: z.string(),
  quantity: z.number(),
  unit: z.string(),
  sourceObjectCount: z.number().int().nonnegative(),
  groundTruthLabel: groundTruthLabelSchema.optional(),
});

export const materialOutputSummarySchema = z.object({
  lineItemCount: z.number().int().nonnegative(),
  byCategory: z.record(z.string(), z.number().int().nonnegative()),
  lineItems: z.array(materialLineSummarySchema),
  absentCategories: z.array(z.string()),
});

export const automationCoverageSchema = z.object({
  denominatorExplanation: z.string(),
  segmentsWithLength: z.number().int().nonnegative(),
  segmentsWithFullWallAssemblyForStuds: z.number().int().nonnegative(),
  segmentsCalculableStuds: z.number().int().nonnegative(),
  segmentsCalculablePlates: z.number().int().nonnegative(),
  materialCategoriesPresent: z.array(z.string()),
  materialCategoriesAbsent: z.array(z.string()),
});

export const runtimeCostSchema = z.object({
  totalDurationMs: z.number().nonnegative(),
  perStageMs: z.record(z.string(), z.number().nonnegative()),
  compiledPageCount: z.number().int().nonnegative(),
  claudeCalls: z.number().int().nonnegative().optional(),
  estimatedTokens: z.number().int().nonnegative().optional(),
  estimatedCostUsd: z.number().nonnegative().optional(),
});

export const openingCoverageSchema = z.object({
  openingsDetected: z.number().int().nonnegative(),
  openingsWithParentWall: z.number().int().nonnegative(),
  openingsWithGovernedWidth: z.number().int().nonnegative(),
  openingsDimensionEstablished: z.number().int().nonnegative(),
  openingsDimensionAmbiguous: z.number().int().nonnegative(),
  openingsDimensionUnresolved: z.number().int().nonnegative(),
  openingsMaterialAuthoritative: z.number().int().nonnegative(),
  openingsAffectingStudCalculation: z.number().int().nonnegative(),
  /**
   * Stud qty delta using the same overlap/blocking rules as calculateWallFraming.
   * Negative when production path would deduct; 0 when overlap blocks or no eligible openings.
   */
  regularStudQuantityDelta: z.number(),
  /**
   * Actual calculator delta: calculateWallFraming(with openings) − calculateWallFraming(baseline).
   * Prefer this for GREEN; equals regularStudQuantityDelta when wiring is correct.
   */
  productionStudQuantityDelta: z.number(),
  segmentsWithNetDeduction: z.number().int().nonnegative(),
  segmentsBlockedByOpeningOverlap: z.number().int().nonnegative(),
});

export type OpeningCoverage = z.infer<typeof openingCoverageSchema>;

export const groundTruthCheckSchema = z.object({
  checkId: z.string(),
  label: groundTruthLabelSchema,
  detail: z.string(),
});

export const geometrySummarySchema = z.object({
  pbgRunCount: z.number().int().nonnegative(),
  lengthEvidenceCount: z.number().int().nonnegative(),
  physicalRunKeysWithLength: z.array(z.string()),
  groundTruthChecks: z.array(groundTruthCheckSchema),
});

export const semanticsSummarySchema = z.object({
  evidenceByPassId: z.record(z.string(), z.number().int().nonnegative()),
  scheduleDefinitionsOnCompile: z.number().int().nonnegative(),
  projectDictionaryBindings: z.number().int().nonnegative(),
  semanticBindingsEmit: z.number().int().nonnegative(),
  dereferenceEmit: z.number().int().nonnegative(),
  wallsWithSemanticTypeKey: z.number().int().nonnegative(),
  groundTruthChecks: z.array(groundTruthCheckSchema).default([]),
});

export const ocrWarningEntrySchema = z.object({
  message: z.string(),
  consumerPath: z.string(),
  classification: z.enum(["harmless_reject", "legitimate_miss_risk", "unknown"]),
});

export const ocrWarningAuditSchema = z.object({
  totalWarnings: z.number().int().nonnegative(),
  byConsumer: z.record(z.string(), z.number().int().nonnegative()),
  samples: z.array(ocrWarningEntrySchema),
  correlatedTruthMisses: z.array(z.string()),
});

export type AuditRunMode = z.infer<typeof auditRunModeSchema>;
export type AuditSummary = z.infer<typeof auditSummarySchema>;
export type ScopeCoverage = z.infer<typeof scopeCoverageSchema>;
export type FailureTaxonomy = z.infer<typeof failureTaxonomySchema>;
export type ResolutionCoverage = z.infer<typeof resolutionCoverageSchema>;
export type MaterialOutputSummary = z.infer<typeof materialOutputSummarySchema>;
export type AutomationCoverage = z.infer<typeof automationCoverageSchema>;
export type RuntimeCost = z.infer<typeof runtimeCostSchema>;
export type GeometrySummary = z.infer<typeof geometrySummarySchema>;
export type SemanticsSummary = z.infer<typeof semanticsSummarySchema>;
export type FailureClass = z.infer<typeof failureClassSchema>;
export type FailureTaxonomyEntry = z.infer<typeof failureTaxonomyEntrySchema>;
export type ScopeCoverageRow = z.infer<typeof scopeCoverageRowSchema>;

export const CAPABILITY_INVENTORY: z.infer<typeof capabilityInventoryEntrySchema>[] = [
  { name: "planIndex", status: "production" },
  { name: "pageClassification", status: "production" },
  { name: "planReadingOrder", status: "production" },
  { name: "buildingAssemblies", status: "stub", notes: "Static exterior-wood-stud-wall" },
  {
    name: "drawingCompiler",
    status: "flag_gated",
    envFlags: ["TAKEOFF_COMPILER=1", "TAKEOFF_COMPILER_OCR=1"],
  },
  {
    name: "projectOrientation",
    status: "flag_gated",
    envFlags: ["TAKEOFF_PROJECT_ORIENTATION=1"],
  },
  {
    name: "semanticMarkRecovery",
    status: "flag_gated",
    envFlags: ["TAKEOFF_SEMANTIC_MARK_RECOVERY=1"],
  },
  {
    name: "scheduleDefinitionExtraction",
    status: "flag_gated",
    envFlags: ["TAKEOFF_SEMANTIC_DEFINITION_EXTRACTION=1"],
  },
  {
    name: "semanticBindingEvidence",
    status: "flag_gated",
    envFlags: ["TAKEOFF_SEMANTIC_BINDING=1"],
  },
  {
    name: "definitionEvidenceBridge",
    status: "production",
    notes: "buildSemanticDefinitionEvidenceFromCompiledPages merged in stage 6",
  },
  {
    name: "dictionaryBindingEvidenceBridge",
    status: "production",
    notes: "buildProjectDictionaryBindingEvidence merged when project-dictionary exists",
  },
  {
    name: "wallAssemblyPlanNoteEvidence",
    status: "production",
    notes:
      "MULTI_SOURCE: note OCR + thickness legend → studSize/spacing/plateCount (B2.2M.2)",
  },
  {
    name: "openingGeometryEvidence",
    status: "flag_gated",
    envFlags: ["TAKEOFF_OPENING_GEOMETRY=1"],
    notes: "PBG gap + governed dimension → opening Evidence (B2.2M.3)",
  },
  {
    name: "dereferenceEvidenceBridge",
    status: "unwired",
    notes: "buildDereferencedBindingEvidence diagnostic-only (A+ audit mode)",
  },
  { name: "claudeFramingExtraction", status: "production", notes: "Requires API key" },
  { name: "geometryLengthEvidence", status: "production" },
  { name: "wallFramingResolver", status: "production" },
  { name: "openingsResolver", status: "production" },
  { name: "structuralMembersResolver", status: "production" },
  { name: "floorRoofSheathingResolvers", status: "production" },
  { name: "blockingSubsystem", status: "missing" },
  { name: "connectorsHardwareSubsystem", status: "missing" },
  { name: "calculateFasteners", status: "unwired" },
  { name: "projectInterpreterClaude", status: "artifact_only" },
  { name: "finalFramingTakeoff", status: "production" },
];
