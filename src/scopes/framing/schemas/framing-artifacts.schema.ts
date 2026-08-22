import { z } from "zod";

import { createTypedArtifactEnvelopeSchema } from "../../../core/schemas/artifact-envelope.schema.js";
import { assumptionSchema } from "../../../core/schemas/assumption.schema.js";
import { confidenceEvaluationSchema } from "../../../core/schemas/confidence.schema.js";
import { evidenceSchema } from "../../../core/schemas/evidence.schema.js";
import { reviewItemSchema } from "../../../core/schemas/review-item.schema.js";
import { userDecisionSchema } from "../../../core/schemas/user-decision.schema.js";
import {
  validationIssueSchema,
  validationResultSchema,
} from "../../../core/schemas/validation.schema.js";
import { blockingSchema } from "./blocking.schema.js";
import {
  connectorSchema,
  fastenerSchema,
  hardwareSchema,
} from "./connectors-hardware.schema.js";
import {
  floorFramingAreaSchema,
  floorFramingSystemSchema,
} from "./floor-framing.schema.js";
import { framingScopeSchema } from "./framing-scope.schema.js";
import { framingTakeoffSchema } from "./framing-takeoff.schema.js";
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
import { classifiedPlanPageSchema } from "../../../plans/pageClassification.js";

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

export const blockingPayloadSchema = z.object({
  blocking: z.array(blockingSchema),
});

export const connectorsHardwarePayloadSchema = z.object({
  connectors: z.array(connectorSchema),
  hardware: z.array(hardwareSchema),
  fasteners: z.array(fastenerSchema),
});

export const assumptionsPayloadSchema = z.object({
  assumptions: z.array(assumptionSchema),
});

export const userDecisionPayloadSchema = userDecisionSchema;

export const validationPayloadSchema = z.object({
  validationIssues: z.array(validationIssueSchema),
  validationResults: z.array(validationResultSchema),
  reviewItems: z.array(reviewItemSchema),
});

export const confidencePayloadSchema = z.object({
  confidenceEvaluations: z.array(confidenceEvaluationSchema),
});

export const framingScopePayloadSchema = framingScopeSchema;

export const framingObjectsPayloadSchema = z.object({
  openings: z.array(openingSchema),
  structuralMembers: z.array(structuralMemberSchema),
  subsystemNotes: z.array(z.string().trim().min(1)).default([]),
});

export const framingCalculationsPayloadSchema = z.object({
  materials: z.array(framingMaterialLineItemSchema),
  assumptions: z.array(assumptionSchema).default([]),
});

export const validationConfidencePayloadSchema = z.object({
  validationIssues: z.array(validationIssueSchema),
  validationResults: z.array(validationResultSchema),
  reviewItems: z.array(reviewItemSchema),
  confidenceEvaluations: z.array(confidenceEvaluationSchema).min(1),
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
export const blockingArtifactSchema = createTypedArtifactEnvelopeSchema(
  "blocking",
  blockingPayloadSchema,
);
export const connectorsHardwareArtifactSchema =
  createTypedArtifactEnvelopeSchema(
    "connectors-hardware",
    connectorsHardwarePayloadSchema,
  );
export const assumptionsArtifactSchema = createTypedArtifactEnvelopeSchema(
  "assumptions",
  assumptionsPayloadSchema,
);
export const userDecisionArtifactSchema = createTypedArtifactEnvelopeSchema(
  "user-decision",
  userDecisionPayloadSchema,
);
export const validationArtifactSchema = createTypedArtifactEnvelopeSchema(
  "validation",
  validationPayloadSchema,
);
export const confidenceArtifactSchema = createTypedArtifactEnvelopeSchema(
  "confidence",
  confidencePayloadSchema,
);
export const framingScopeArtifactSchema = createTypedArtifactEnvelopeSchema(
  "framing-scope",
  framingScopePayloadSchema,
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
export const validationConfidenceArtifactSchema =
  createTypedArtifactEnvelopeSchema(
    "validation-confidence",
    validationConfidencePayloadSchema,
  );
export const finalFramingTakeoffArtifactSchema =
  createTypedArtifactEnvelopeSchema(
    "final-framing-takeoff",
    framingTakeoffSchema,
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
export type WallFramingPayload = z.infer<typeof wallFramingPayloadSchema>;
export type FloorFramingPayload = z.infer<typeof floorFramingPayloadSchema>;
export type RoofFramingPayload = z.infer<typeof roofFramingPayloadSchema>;
export type OpeningsPayload = z.infer<typeof openingsPayloadSchema>;
export type StructuralMembersPayload = z.infer<
  typeof structuralMembersPayloadSchema
>;
export type SheathingPayload = z.infer<typeof sheathingPayloadSchema>;
export type BlockingPayload = z.infer<typeof blockingPayloadSchema>;
export type ConnectorsHardwarePayload = z.infer<
  typeof connectorsHardwarePayloadSchema
>;
export type AssumptionsPayload = z.infer<typeof assumptionsPayloadSchema>;
export type UserDecisionPayload = z.infer<typeof userDecisionPayloadSchema>;
export type ValidationPayload = z.infer<typeof validationPayloadSchema>;
export type ConfidencePayload = z.infer<typeof confidencePayloadSchema>;
export type FramingScopePayload = z.infer<typeof framingScopePayloadSchema>;
export type FramingObjectsPayload = z.infer<
  typeof framingObjectsPayloadSchema
>;
export type FramingCalculationsPayload = z.infer<
  typeof framingCalculationsPayloadSchema
>;
export type ValidationConfidencePayload = z.infer<
  typeof validationConfidencePayloadSchema
>;
