import { z } from "zod";

import { createTypedArtifactEnvelopeSchema } from "../../core/schemas/artifact-envelope.schema.js";
import { assumptionSchema } from "../../core/schemas/assumption.schema.js";
import { evidenceSchema } from "../../core/schemas/evidence.schema.js";
import {
  floorFramingAreaSchema,
  floorFramingSystemSchema,
} from "./floor-framing.schema.js";
import { framingMaterialLineItemSchema } from "./material.schema.js";
import { openingSchema } from "./opening.schema.js";
import {
  roofFramingSystemSchema,
  roofPlaneSchema,
} from "./roof-framing.schema.js";
import {
  sheathingAreaSchema,
  sheathingSystemSchema,
} from "./sheathing.schema.js";
import { structuralMemberSchema } from "./structural-member.schema.js";
import { buildingWallSchema, wallSegmentSchema } from "./wall.schema.js";
import { classifiedPlanPageSchema } from "../../pdf/pageClassification.js";
import { compiledDrawingPageSchema } from "../../compiler/schemas/compiledDrawingPage.schema.js";
import { governedProjectDictionarySchema } from "../../project-reading/schemas/projectDictionary.schema.js";
import { projectLearningPayloadSchema } from "../../project-reading/projectLearning/projectLearningTypes.js";
import { extractionBudgetAuditSchema } from "../extract/extractionBudgetAudit.schema.js";
import { planReferenceTraceSchema } from "../extract/planReferenceTrace.schema.js";

export const verifiedPlanSetPayloadSchema = z.object({
  pdfPath: z.string().trim().min(1),
  totalPages: z.number().int().positive(),
  pages: z.array(
    z.object({
      pageNumber: z.number().int().positive(),
      sheetId: z.string().trim().min(1).nullable(),
      label: z.string().trim().min(1).nullable(),
      textContent: z.string(),
    }),
  ),
  indexedAt: z.string().datetime({ offset: true }),
  sourceContentHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/i)
    .nullable()
    .default(null),
});

export const pageClassificationPayloadSchema = z.object({
  pages: z.array(classifiedPlanPageSchema),
});

export const planReadingOrderPayloadSchema = z.object({
  orderedPageNumbers: z.array(z.number().int().positive()),
  rationale: z.array(z.string().trim().min(1)),
});

export const buildingAssembliesPayloadSchema = z.object({
  assemblyNames: z.array(z.string().trim().min(1)),
  notes: z.array(z.string().trim().min(1)).default([]),
});

export const extractedFramingEvidencePayloadSchema = z.object({
  evidence: z.array(evidenceSchema),
});

export const compiledDrawingPagesPayloadSchema = z.object({
  pages: z.array(compiledDrawingPageSchema),
});

export const compilerAutomationAuditPayloadSchema = z.object({
  compiledPageNumbers: z.array(z.number().int().positive()),
  physicalRuns: z.object({
    detected: z.number().int().nonnegative(),
    highAuthority: z.number().int().nonnegative(),
    governedEmit: z.number().int().nonnegative(),
    lengthResolved: z.number().int().nonnegative(),
  }),
  byReason: z.object({
    automated: z.number().int().nonnegative(),
    "compiler-unresolved": z.number().int().nonnegative(),
    "source-authority-missing": z.number().int().nonnegative(),
    "page-role-blocked": z.number().int().nonnegative(),
    "scale-unresolved": z.number().int().nonnegative(),
    "scale-rejected": z.number().int().nonnegative(),
    "virtual-text-blocked": z.number().int().nonnegative(),
    "conflicting-authority": z.number().int().nonnegative(),
  }),
  conflicts: z.array(
    z.object({
      physicalRunKey: z.string(),
      compilerEvidenceId: z.string(),
      claudeEvidenceId: z.string(),
      compilerFeet: z.number(),
      claudeFeet: z.number(),
    }),
  ),
  timingMs: z.object({
    total: z.number().nonnegative(),
    perPage: z.record(z.number().nonnegative()),
  }),
});

export const projectDictionaryPayloadSchema = governedProjectDictionarySchema;

export const semanticBindingAuditPayloadSchema = z.object({
  compiledPageNumbers: z.array(z.number().int().positive()),
  perPage: z.record(z.unknown()),
  directSemanticBindingAutomationRate: z.number().nonnegative(),
  eligibleButUnboundRuns: z.number().int().nonnegative(),
  semanticPropertySignalsNotUsedAsIdentity: z.number().int().nonnegative(),
  ambiguousDirectBindings: z.number().int().nonnegative(),
  bindingConflicts: z.number().int().nonnegative(),
  calculablePhysicalRunRate: z.number().nonnegative(),
  topologyPropagationOpportunities: z.number().int().nonnegative(),
  directEmitCount: z.number().int().nonnegative(),
  eligibleRunCount: z.number().int().nonnegative(),
});

export const wallFramingPayloadSchema = z.object({
  walls: z.array(buildingWallSchema),
  segments: z.array(wallSegmentSchema),
});

export const floorFramingPayloadSchema = z.object({
  systems: z.array(floorFramingSystemSchema),
  areas: z.array(floorFramingAreaSchema),
});

export const roofFramingPayloadSchema = z.object({
  systems: z.array(roofFramingSystemSchema),
  planes: z.array(roofPlaneSchema),
});

export const openingsPayloadSchema = z.object({
  openings: z.array(openingSchema),
});

export const structuralMembersPayloadSchema = z.object({
  structuralMembers: z.array(structuralMemberSchema),
});

export const sheathingPayloadSchema = z.object({
  systems: z.array(sheathingSystemSchema),
  areas: z.array(sheathingAreaSchema),
});

export const assumptionsPayloadSchema = z.object({
  assumptions: z.array(assumptionSchema),
});

export const framingObjectsPayloadSchema = z.object({
  openings: z.array(openingSchema),
  structuralMembers: z.array(structuralMemberSchema),
  subsystemNotes: z.array(z.string().trim().min(1)).default([]),
});

export const framingCalculationsPayloadSchema = z.object({
  materials: z.array(framingMaterialLineItemSchema),
  assumptions: z.array(assumptionSchema).default([]),
});

export const verifiedPlanSetArtifactSchema = createTypedArtifactEnvelopeSchema(
  "verified-plan-set",
  verifiedPlanSetPayloadSchema,
);
export const pageClassificationArtifactSchema =
  createTypedArtifactEnvelopeSchema(
    "page-classification",
    pageClassificationPayloadSchema,
  );
export const planReadingOrderArtifactSchema = createTypedArtifactEnvelopeSchema(
  "plan-reading-order",
  planReadingOrderPayloadSchema,
);
export const buildingAssembliesArtifactSchema =
  createTypedArtifactEnvelopeSchema(
    "building-assemblies",
    buildingAssembliesPayloadSchema,
  );
export const extractedFramingEvidenceArtifactSchema =
  createTypedArtifactEnvelopeSchema(
    "extracted-framing-evidence",
    extractedFramingEvidencePayloadSchema,
  );
export const extractionBudgetAuditArtifactSchema =
  createTypedArtifactEnvelopeSchema(
    "extraction-budget-audit",
    extractionBudgetAuditSchema,
  );
export const planReferenceTraceArtifactSchema =
  createTypedArtifactEnvelopeSchema(
    "plan-reference-trace",
    planReferenceTraceSchema,
  );
export const compiledDrawingPagesArtifactSchema =
  createTypedArtifactEnvelopeSchema(
    "compiled-drawing-pages",
    compiledDrawingPagesPayloadSchema,
  );
export const compilerAutomationAuditArtifactSchema =
  createTypedArtifactEnvelopeSchema(
    "compiler-automation-audit",
    compilerAutomationAuditPayloadSchema,
  );
export const projectDictionaryArtifactSchema =
  createTypedArtifactEnvelopeSchema(
    "project-dictionary",
    projectDictionaryPayloadSchema,
  );
export const projectLearningArtifactSchema = createTypedArtifactEnvelopeSchema(
  "project-learning",
  projectLearningPayloadSchema,
);
export const semanticBindingAuditArtifactSchema =
  createTypedArtifactEnvelopeSchema(
    "semantic-binding-audit",
    semanticBindingAuditPayloadSchema,
  );
export const wallFramingArtifactSchema = createTypedArtifactEnvelopeSchema(
  "wall-framing",
  wallFramingPayloadSchema,
);
export const floorFramingArtifactSchema = createTypedArtifactEnvelopeSchema(
  "floor-framing",
  floorFramingPayloadSchema,
);
export const roofFramingArtifactSchema = createTypedArtifactEnvelopeSchema(
  "roof-framing",
  roofFramingPayloadSchema,
);
export const openingsArtifactSchema = createTypedArtifactEnvelopeSchema(
  "openings",
  openingsPayloadSchema,
);
export const structuralMembersArtifactSchema =
  createTypedArtifactEnvelopeSchema(
    "structural-members",
    structuralMembersPayloadSchema,
  );
export const sheathingArtifactSchema = createTypedArtifactEnvelopeSchema(
  "sheathing",
  sheathingPayloadSchema,
);
export const assumptionsArtifactSchema = createTypedArtifactEnvelopeSchema(
  "assumptions",
  assumptionsPayloadSchema,
);
export const framingObjectsArtifactSchema = createTypedArtifactEnvelopeSchema(
  "framing-objects",
  framingObjectsPayloadSchema,
);
export const framingCalculationsArtifactSchema =
  createTypedArtifactEnvelopeSchema(
    "framing-calculations",
    framingCalculationsPayloadSchema,
  );
export type VerifiedPlanSetPayload = z.infer<
  typeof verifiedPlanSetPayloadSchema
>;
export type PageClassificationPayload = z.infer<
  typeof pageClassificationPayloadSchema
>;
export type PlanReadingOrderPayload = z.infer<
  typeof planReadingOrderPayloadSchema
>;
export type BuildingAssembliesPayload = z.infer<
  typeof buildingAssembliesPayloadSchema
>;
export type ExtractedFramingEvidencePayload = z.infer<
  typeof extractedFramingEvidencePayloadSchema
>;
export type CompiledDrawingPagesPayload = z.infer<
  typeof compiledDrawingPagesPayloadSchema
>;
export type CompilerAutomationAuditPayload = z.infer<
  typeof compilerAutomationAuditPayloadSchema
>;
export type ProjectDictionaryPayload = z.infer<
  typeof projectDictionaryPayloadSchema
>;
export type ProjectLearningPayload = z.infer<typeof projectLearningPayloadSchema>;
export type SemanticBindingAuditPayload = z.infer<
  typeof semanticBindingAuditPayloadSchema
>;
export type WallFramingPayload = z.infer<typeof wallFramingPayloadSchema>;
export type FloorFramingPayload = z.infer<typeof floorFramingPayloadSchema>;
export type RoofFramingPayload = z.infer<typeof roofFramingPayloadSchema>;
export type OpeningsPayload = z.infer<typeof openingsPayloadSchema>;
export type StructuralMembersPayload = z.infer<
  typeof structuralMembersPayloadSchema
>;
export type SheathingPayload = z.infer<typeof sheathingPayloadSchema>;
export type AssumptionsPayload = z.infer<typeof assumptionsPayloadSchema>;
export type FramingObjectsPayload = z.infer<
  typeof framingObjectsPayloadSchema
>;
export type FramingCalculationsPayload = z.infer<
  typeof framingCalculationsPayloadSchema
>;
