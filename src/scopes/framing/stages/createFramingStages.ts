import type { z } from "zod";

import type { PipelineStage, PipelineStageContext } from "../../../core/pipeline/types.js";
import type {
  ArtifactEnvelope,
  ArtifactProducer,
} from "../../../core/schemas/artifact-envelope.schema.js";
import type { ArtifactId } from "../../../core/schemas/identity.schema.js";
import { evidenceIdSchema, type PipelineRunId } from "../../../core/schemas/identity.schema.js";
import { generateArtifactId } from "../../../core/utils/ids.js";
import { extractFramingEvidenceViaClaude } from "../prompts/extractFramingEvidence.js";
import {
  buildingAssembliesArtifactSchema,
  confidenceArtifactSchema,
  extractedFramingEvidenceArtifactSchema,
  extractedFramingEvidencePayloadSchema,
  finalFramingTakeoffArtifactSchema,
  framingCalculationsArtifactSchema,
  openingsArtifactSchema,
  pageClassificationArtifactSchema,
  planReadingOrderArtifactSchema,
  structuralMembersArtifactSchema,
  validationArtifactSchema,
  verifiedPlanSetArtifactSchema,
  wallFramingArtifactSchema,
  type BuildingAssembliesPayload,
  type ConfidencePayload,
  type ExtractedFramingEvidencePayload,
  type FramingCalculationsPayload,
  type OpeningsPayload,
  type PageClassificationPayload,
  type PlanReadingOrderPayload,
  type StructuralMembersPayload,
  type ValidationPayload,
  type WallFramingPayload,
} from "../schemas/framing-artifacts.schema.js";
import { coordinateFramingCalculations } from "../calculators/calculation-coordinator.js";
import { coordinateFramingConfidence } from "../confidence/confidence-coordinator.js";
import { resolveWallFraming } from "../resolvers/resolveWallFraming.js";
import { coordinateFramingValidation } from "../validators/validation-coordinator.js";
import { resolveStructuralMembers } from "../resolvers/resolveStructuralMembers.js";

const SCHEMA_VERSION = "1.0.0";
const ENGINE_VERSION = "0.1.0";

function getPayload<T>(context: PipelineStageContext, stageName: string): T {
  const artifact = context.completedArtifacts.get(stageName);
  if (!artifact) {
    throw new Error(`Required artifact from stage '${stageName}' is missing.`);
  }
  return artifact.payload as T;
}

function uniqueSortedArtifactIds(ids: readonly ArtifactId[]): ArtifactId[] {
  return [...new Set(ids)].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  ) as ArtifactId[];
}

export function createFramingStageArtifact<TSchema extends z.ZodTypeAny>(
  context: PipelineStageContext,
  order: number,
  schema: TSchema,
  artifactType: string,
  payload: unknown,
  producer: ArtifactProducer = {
    type: "system",
    identifier: "framing-pipeline",
  },
  additionalInputArtifactIds: readonly ArtifactId[] = [],
): ArtifactEnvelope<unknown> {
  const now = new Date().toISOString();
  const priorArtifacts = [...context.completedArtifacts.values()];
  const previousArtifact = priorArtifacts.at(-1);
  const parsed = schema.parse({
    artifactId: generateArtifactId(order),
    artifactType,
    schemaVersion: SCHEMA_VERSION,
    artifactVersion: 1,
    engineVersion: ENGINE_VERSION,
    pipelineRunId: context.pipelineRunId,
    projectId: context.projectId,
    createdAt: now,
    lastModifiedAt: now,
    producer,
    inputArtifactIds: uniqueSortedArtifactIds([
      ...priorArtifacts.map((artifact) => artifact.artifactId),
      ...additionalInputArtifactIds,
    ]),
    parentArtifactIds: previousArtifact ? [previousArtifact.artifactId] : [],
    payload,
  });

  return parsed as ArtifactEnvelope<unknown>;
}

function buildMockExtractedEvidence(
  context: PipelineStageContext,
): ExtractedFramingEvidencePayload {
  const page = context.planIndex.pages.find((candidate) =>
    candidate.textContent.split(/\r?\n/).some((line) => /\bW-001\b/.test(line)),
  );
  if (!page) {
    throw new Error(
      "Mock extracted-evidence fixture requires indexed page text containing W-001.",
    );
  }

  const originalText =
    page.textContent
      .split(/\r?\n/)
      .find((line) => /\bW-001\b/.test(line)) ?? page.textContent;

  const source = {
    page: {
      documentId: null,
      pageNumber: page.pageNumber,
      sheetId: page.sheetId,
      sheetTitle: page.label,
      pageLabel: page.label,
      revision: null,
    },
    region: null,
    elementLabel: "W-001",
    detailNumber: null,
    sectionNumber: null,
    scheduleName: null,
    noteReference: null,
  };

  function fixtureEvidence(
    id: string,
    type: "note" | "dimension",
    description: string,
    propertyPath: string,
    candidateValue: string | number | boolean | null,
  ) {
    return {
      id: evidenceIdSchema.parse(id),
      type,
      relationship: "supports" as const,
      description,
      source,
      originalText,
      references: [],
      subjectKind: "wall" as const,
      subjectKey: "W-001",
      propertyPath,
      candidateValue,
    };
  }

  return extractedFramingEvidencePayloadSchema.parse({
    evidence: [
      fixtureEvidence(
        "E-W001-CLASS",
        "note",
        "Explicit wall type classification.",
        "wallType",
        "wood stud wall",
      ),
      fixtureEvidence(
        "E-W001-LOCATION",
        "note",
        "Explicit wall location.",
        "location",
        "exterior",
      ),
      fixtureEvidence(
        "E-W001-BEARING",
        "note",
        "Explicit wall bearing classification.",
        "bearingStatus",
        "non-bearing",
      ),
      fixtureEvidence(
        "E-W001-GEOMETRY",
        "dimension",
        "Explicit wall segment length.",
        "lengthFeet",
        20,
      ),
      fixtureEvidence(
        "E-W001-HEIGHT",
        "dimension",
        "Explicit wall height.",
        "assembly.heightFeet",
        8,
      ),
      fixtureEvidence(
        "E-W001-FRAMING",
        "note",
        "Explicit stud size.",
        "assembly.studSize",
        "2x4",
      ),
      fixtureEvidence(
        "E-W001-SPACING",
        "dimension",
        "Explicit stud spacing.",
        "assembly.studSpacingInches",
        16,
      ),
      fixtureEvidence(
        "E-W001-PLATES",
        "note",
        "Explicit plate count.",
        "assembly.plateCount",
        3,
      ),
    ],
  });
}

function classifyPage(sheetId: string | null, label: string | null) {
  const normalizedLabel = label?.toLowerCase() ?? "";
  const discipline = sheetId?.startsWith("S")
    ? "structural"
    : sheetId?.startsWith("A")
      ? "architectural"
      : "other";
  const pageType = normalizedLabel.includes("cover")
    ? "cover"
    : normalizedLabel.includes("schedule")
      ? "schedule"
      : normalizedLabel.includes("note")
        ? "notes"
        : normalizedLabel.includes("detail")
          ? "detail"
          : normalizedLabel.includes("plan")
            ? "plan"
            : "other";

  return { discipline, pageType } as const;
}

const stages: PipelineStage[] = [
  {
    order: 1,
    name: "verifiedPlanSet",
    async run(context) {
      return createFramingStageArtifact(
        context,
        1,
        verifiedPlanSetArtifactSchema,
        "verified-plan-set",
        context.planIndex,
      );
    },
  },
  {
    order: 2,
    name: "pageClassification",
    async run(context) {
      return createFramingStageArtifact(
        context,
        2,
        pageClassificationArtifactSchema,
        "page-classification",
        {
          pages: context.planIndex.pages.map((page) => {
            const classification = classifyPage(page.sheetId, page.label);
            return {
              pageNumber: page.pageNumber,
              sheetId: page.sheetId,
              ...classification,
              relevantToFraming: classification.pageType !== "cover",
            };
          }),
        },
      );
    },
  },
  {
    order: 3,
    name: "planReadingOrder",
    async run(context) {
      const preferredOrder = [1, 6, 4, 2, 3, 5, 7, 8];
      const availablePages = new Set(
        context.planIndex.pages.map((page) => page.pageNumber),
      );
      return createFramingStageArtifact(
        context,
        3,
        planReadingOrderArtifactSchema,
        "plan-reading-order",
        {
          orderedPageNumbers: preferredOrder.filter((pageNumber) =>
            availablePages.has(pageNumber),
          ),
          rationale: [
            "Verify project identity and notes before resolving geometry.",
            "Read structural context before architectural wall extraction.",
            "Read schedules and details before final resolution.",
          ],
        },
      );
    },
  },
  {
    order: 4,
    name: "buildingAssemblies",
    async run(context) {
      return createFramingStageArtifact(
        context,
        4,
        buildingAssembliesArtifactSchema,
        "building-assemblies",
        {
          assemblyNames: ["exterior-wood-stud-wall"],
          notes: [
            "Assembly identified from the explicit mock fixture statement.",
          ],
        },
      );
    },
  },
  {
    order: 5,
    name: "extractedEvidence",
    async run(context) {
      const payload = context.useMockAi
        ? buildMockExtractedEvidence(context)
        : await extractFramingEvidenceViaClaude({
            planIndex: context.planIndex,
            pageClassification: getPayload<PageClassificationPayload>(
              context,
              "pageClassification",
            ),
            planReadingOrder: getPayload<PlanReadingOrderPayload>(
              context,
              "planReadingOrder",
            ),
            buildingAssemblies: getPayload<BuildingAssembliesPayload>(
              context,
              "buildingAssemblies",
            ),
          });

      return createFramingStageArtifact(
        context,
        5,
        extractedFramingEvidenceArtifactSchema,
        "extracted-framing-evidence",
        payload,
        context.useMockAi
          ? { type: "system", identifier: "framing-pipeline" }
          : { type: "claude", identifier: "extractedEvidence" },
      );
    },
  },
  {
    order: 6,
    name: "wallFraming",
    async run(context) {
      const extracted = getPayload<ExtractedFramingEvidencePayload>(
        context,
        "extractedEvidence",
      );
      const userDecisionRunInput = context.userDecisionRunInput;
      const payload = userDecisionRunInput
        ? resolveWallFraming(extracted.evidence, {
            userDecisions: userDecisionRunInput.userDecisions,
            reviewItemsById: userDecisionRunInput.reviewItemsById,
          })
        : resolveWallFraming(extracted.evidence);

      return createFramingStageArtifact(
        context,
        6,
        wallFramingArtifactSchema,
        "wall-framing",
        payload,
        { type: "system", identifier: "framing-pipeline" },
        userDecisionRunInput?.inputArtifactIds ?? [],
      );
    },
  },
  {
    order: 7,
    name: "openings",
    async run(context) {
      const payload: OpeningsPayload = {
        openings: [],
      };
      return createFramingStageArtifact(
        context,
        7,
        openingsArtifactSchema,
        "openings",
        payload,
      );
    },
  },
  {
    order: 8,
    name: "structuralMembers",
    async run(context) {
      const extracted = getPayload<ExtractedFramingEvidencePayload>(
        context,
        "extractedEvidence",
      );
      const payload = resolveStructuralMembers(extracted.evidence);

      return createFramingStageArtifact(
        context,
        8,
        structuralMembersArtifactSchema,
        "structural-members",
        payload,
        { type: "system", identifier: "framing-pipeline" },
      );
    },
  },
  {
    order: 9,
    name: "validation",
    async run(context) {
      const wallPayload = getPayload<WallFramingPayload>(context, "wallFraming");
      const openings = getPayload<OpeningsPayload>(context, "openings");
      const structuralMembers = getPayload<StructuralMembersPayload>(
        context,
        "structuralMembers",
      );
      const validationPayload = coordinateFramingValidation({
        wallFraming: wallPayload,
        openings,
        structuralMembers,
      });

      return createFramingStageArtifact(
        context,
        9,
        validationArtifactSchema,
        "validation",
        validationPayload,
      );
    },
  },
  {
    order: 10,
    name: "calculations",
    async run(context) {
      const wallPayload = getPayload<WallFramingPayload>(context, "wallFraming");
      const structuralMembers = getPayload<StructuralMembersPayload>(
        context,
        "structuralMembers",
      );
      const validation = getPayload<ValidationPayload>(context, "validation");
      const payload = coordinateFramingCalculations({
        wallFraming: wallPayload,
        structuralMembers,
        validation,
      });

      return createFramingStageArtifact(
        context,
        10,
        framingCalculationsArtifactSchema,
        "framing-calculations",
        payload,
      );
    },
  },
  {
    order: 11,
    name: "confidence",
    async run(context) {
      const extracted = getPayload<ExtractedFramingEvidencePayload>(
        context,
        "extractedEvidence",
      );
      const wallPayload = getPayload<WallFramingPayload>(context, "wallFraming");
      const openings = getPayload<OpeningsPayload>(context, "openings");
      const structuralMembers = getPayload<StructuralMembersPayload>(
        context,
        "structuralMembers",
      );
      const validation = getPayload<ValidationPayload>(context, "validation");
      const payload = coordinateFramingConfidence({
        pipelineRunId: context.pipelineRunId as PipelineRunId,
        scopeName: context.scopeName,
        validation,
        wallFraming: wallPayload,
        openings,
        structuralMembers,
        evidenceIds: extracted.evidence.map((evidence) => evidence.id),
        useExplicitFixture: context.useMockAi,
      });

      return createFramingStageArtifact(
        context,
        11,
        confidenceArtifactSchema,
        "confidence",
        payload,
      );
    },
  },
  {
    order: 12,
    name: "report",
    async run(context) {
      const wallPayload = getPayload<WallFramingPayload>(context, "wallFraming");
      const openings = getPayload<OpeningsPayload>(context, "openings");
      const structuralMembers = getPayload<StructuralMembersPayload>(
        context,
        "structuralMembers",
      );
      const calculations = getPayload<FramingCalculationsPayload>(context, "calculations");
      const validation = getPayload<ValidationPayload>(context, "validation");
      const confidencePayload = getPayload<ConfidencePayload>(context, "confidence");
      const confidence = confidencePayload.confidenceEvaluations.find(
        (evaluation) => evaluation.target.kind === "takeoff",
      );
      if (!confidence) {
        throw new Error("Takeoff confidence evaluation is missing.");
      }

      return createFramingStageArtifact(
        context,
        12,
        finalFramingTakeoffArtifactSchema,
        "final-framing-takeoff",
        {
          projectId: context.projectId,
          scopeName: "framing",
          executionMode: context.useMockAi ? "mock" : "anthropic",
          status: "completed",
          wallIds: wallPayload.walls.map((wall) => wall.id),
          wallSegmentIds: wallPayload.segments.map((segment) => segment.id),
          openingIds: openings.openings.map((opening) => opening.id),
          structuralMemberIds: structuralMembers.structuralMembers.map(
            (member) => member.id,
          ),
          materials: calculations.materials,
          reviewItemIds: validation.reviewItems.map((item) => item.id),
          validationIssueIds: validation.validationIssues.map((issue) => issue.id),
          confidenceEvaluationId: confidence.id,
          summary: {
            wallCount: wallPayload.walls.length,
            wallSegmentCount: wallPayload.segments.length,
            openingCount: openings.openings.length,
            structuralMemberCount: structuralMembers.structuralMembers.length,
            materialLineItemCount: calculations.materials.length,
            reviewItemCount: validation.reviewItems.length,
            validationIssueCount: validation.validationIssues.length,
            completion: confidence.completion,
            confidenceLabel: confidence.overallLabel,
            reviewStatus: confidence.reviewStatus,
            blockingStatus: confidence.blockingStatus,
          },
        },
      );
    },
  },
];

export function createFramingStages(): PipelineStage[] {
  return stages;
}
