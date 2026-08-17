import { z } from "zod";

import { createTypedArtifactEnvelopeSchema } from "../../../core/schemas/artifact-envelope.schema.js";
import { confidenceEvaluationSchema } from "../../../core/schemas/confidence.schema.js";
import { evidenceSchema } from "../../../core/schemas/evidence.schema.js";
import { reviewItemSchema } from "../../../core/schemas/review-item.schema.js";
import {
  validationIssueSchema,
  validationResultSchema,
} from "../../../core/schemas/validation.schema.js";
import { framingTakeoffSchema } from "./framing-takeoff.schema.js";
import { framingMaterialLineItemSchema } from "./material.schema.js";
import { openingSchema } from "./opening.schema.js";
import { structuralMemberSchema } from "./structural-member.schema.js";
import { buildingWallSchema, wallSegmentSchema } from "./wall.schema.js";

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
});

export const pageClassificationPayloadSchema = z.object({
  pages: z.array(
    z.object({
      pageNumber: z.number().int().positive(),
      sheetId: z.string().trim().min(1).nullable(),
      discipline: z.enum(["architectural", "structural", "other"]),
      pageType: z.enum([
        "cover",
        "plan",
        "schedule",
        "notes",
        "detail",
        "other",
      ]),
      relevantToFraming: z.boolean(),
    }),
  ),
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

export const framingObjectsPayloadSchema = z.object({
  openings: z.array(openingSchema),
  structuralMembers: z.array(structuralMemberSchema),
  subsystemNotes: z.array(z.string().trim().min(1)).default([]),
});

export const framingCalculationsPayloadSchema = z.object({
  materials: z.array(framingMaterialLineItemSchema),
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
export type FramingObjectsPayload = z.infer<
  typeof framingObjectsPayloadSchema
>;
export type FramingCalculationsPayload = z.infer<
  typeof framingCalculationsPayloadSchema
>;
export type ValidationConfidencePayload = z.infer<
  typeof validationConfidencePayloadSchema
>;
