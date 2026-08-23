import { z } from "zod";

import {
  candidateSourceSchema,
  governanceAuditSchema,
  pageRoleResultSchema,
  transcriptionAuthoritySchema,
} from "./governance.schema.js";
import { physicalWallRunSchema } from "./physicalWallRun.schema.js";
import {
  physicalRunSemanticBindingSchema,
  topologicalPropagationOpportunitySchema,
  typeMarkOwnershipAssociationSchema,
} from "./semanticBinding.schema.js";
import { semanticMarkRecoveryBlockSchema } from "../semantic-mark-recovery/semanticMarkObservation.schema.js";
import { semanticDefinitionBlockSchema } from "./semanticDefinition.schema.js";
import { textPrimitiveSchema } from "./textPrimitive.schema.js";

export const semanticDereferenceBlockSchema = z.object({
  bindings: z.array(
    z.object({
      bindingId: z.string(),
      physicalRunKey: z.string(),
      referenceKey: z.string(),
      definitionId: z.string(),
      relationship: z.enum(["dereferenced-reference", "graphic-convention"]),
      authorityGrade: z.enum(["A", "B"]),
      status: z.enum(["assigned", "ambiguous", "conflict", "rejected"]),
      emit: z.boolean(),
      sourcePageNumber: z.number().int().positive(),
      provenance: z.object({
        referenceObservationId: z.string(),
        conventionEntryIds: z.array(z.string()),
        definitionId: z.string(),
        dereferenceMethod: z.literal("key-equality"),
        referenceMechanism: z.string(),
      }),
      notes: z.array(z.string()),
    }),
  ),
  emitBindingIds: z.array(z.string()),
  referenceMechanism: z.string().nullable(),
  metrics: z.object({
    referencesRecovered: z.number().int().nonnegative(),
    definitionsAvailable: z.number().int().nonnegative(),
    dereferenceMatches: z.number().int().nonnegative(),
    emitCount: z.number().int().nonnegative(),
  }),
});

export const dimTranscriptionSchema = z.object({
  dimId: z.string(),
  authority: transcriptionAuthoritySchema,
  rawText: z.string(),
  parsedFeet: z.number().nullable(),
  parseStatus: z.enum(["ok", "unresolved"]),
  textPrimitiveId: z.string().nullable(),
  confidence: z.number().nullable(),
  rotationDeg: z.number().nullable(),
  cropPath: z.string().nullable(),
  association: z.object({
    normalDist: z.number().nullable(),
    axialOverlap: z.number().nullable(),
    method: z.string(),
  }),
});

export const dimOwnershipAssociationSchema = z.object({
  dimId: z.string(),
  roleGuess: z.string().nullable(),
  status: z.string(),
  runId: z.string().optional(),
  physicalRunKey: z.string().optional(),
  orientation: z.enum(["H", "V"]).optional(),
  uniquenessMargin: z.number().optional(),
  lengthOk: z.boolean().optional(),
  lengthRatio: z.number().optional(),
  ocrText: z.string().nullable().optional(),
  parse: z
    .object({
      status: z.string(),
      originalText: z.string().optional(),
      feet: z.number().optional(),
      reason: z.string().optional(),
    })
    .nullable()
    .optional(),
  candidateSource: candidateSourceSchema.optional(),
  transcriptionAuthority: z.string().optional(),
});

export const dimOwnershipSummarySchema = z.object({
  associatedUnique: z.number(),
  ambiguous: z.number(),
  weakLength: z.number(),
  overallUniqueAndLengthOk: z.number(),
  overallLengthOkRate: z.number().nullable(),
  associations: z.array(dimOwnershipAssociationSchema),
});

export const compiledDrawingPageSchema = z.object({
  pdfPath: z.string().trim().min(1),
  pageNumber: z.number().int().positive(),
  pageWidth: z.number().finite().positive(),
  pageHeight: z.number().finite().positive(),
  pageRole: pageRoleResultSchema,
  text: z.object({
    rawItemCount: z.number().int().nonnegative(),
    primitives: z.array(textPrimitiveSchema),
    imperialCandidates: z.array(textPrimitiveSchema),
  }),
  geometry: z.object({
    segmentCount: z.number().int().nonnegative(),
    faceCount: z.number().int().nonnegative(),
    pairCount: z.number().int().nonnegative(),
    physicalRunCount: z.number().int().nonnegative(),
    pbgRuns: z.array(physicalWallRunSchema),
    rejectedRunCount: z.number().int().nonnegative(),
    dims: z.array(
      z.object({
        id: z.string(),
        candidateSource: candidateSourceSchema,
        orientation: z.enum(["H", "V"]),
        length: z.number(),
      }),
    ),
    dimSourceCounts: z.object({
      detected: z.number().int().nonnegative(),
      "near-high-seed": z.number().int().nonnegative(),
      "virtual-text": z.number().int().nonnegative(),
    }),
  }),
  transcriptions: z.array(dimTranscriptionSchema),
  ptPerFt: z.number().nullable(),
  ownership: dimOwnershipSummarySchema,
  governance: governanceAuditSchema,
  semanticBinding: z.object({
    emitBindingIds: z.array(z.string()),
    bindings: z.array(physicalRunSemanticBindingSchema),
    propagationOpportunities: z.array(topologicalPropagationOpportunitySchema),
    ownershipAssociations: z.array(typeMarkOwnershipAssociationSchema),
  }),
  semanticMarkRecovery: semanticMarkRecoveryBlockSchema,
  semanticDefinitions: semanticDefinitionBlockSchema.optional(),
  semanticDereference: semanticDereferenceBlockSchema.optional(),
  timingMs: z.object({
    total: z.number().nonnegative(),
    transcription: z.number().nonnegative(),
  }),
});

export type CompiledDrawingPage = z.infer<typeof compiledDrawingPageSchema>;
export type DimTranscriptionRecord = z.infer<typeof dimTranscriptionSchema>;
