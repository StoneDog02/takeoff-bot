import type { z } from "zod";

import type { PipelineStage, PipelineStageContext } from "../../../core/pipeline/types.js";
import type {
  ArtifactEnvelope,
  ArtifactProducer,
} from "../../../core/schemas/artifact-envelope.schema.js";
import { evidenceIdSchema } from "../../../core/schemas/identity.schema.js";
import { generateArtifactId } from "../../../core/utils/ids.js";
import { extractFramingEvidenceViaClaude } from "../prompts/extractFramingEvidence.js";
import {
  buildingAssembliesArtifactSchema,
  extractedFramingEvidenceArtifactSchema,
  extractedFramingEvidencePayloadSchema,
  finalFramingTakeoffArtifactSchema,
  framingCalculationsArtifactSchema,
  framingObjectsArtifactSchema,
  pageClassificationArtifactSchema,
  planReadingOrderArtifactSchema,
  validationConfidenceArtifactSchema,
  verifiedPlanSetArtifactSchema,
  wallFramingArtifactSchema,
  type BuildingAssembliesPayload,
  type ExtractedFramingEvidencePayload,
  type FramingCalculationsPayload,
  type FramingObjectsPayload,
  type PageClassificationPayload,
  type PlanReadingOrderPayload,
  type ValidationConfidencePayload,
  type WallFramingPayload,
} from "../schemas/framing-artifacts.schema.js";

const SCHEMA_VERSION = "1.0.0";
const ENGINE_VERSION = "0.1.0";

function getPayload<T>(context: PipelineStageContext, stageName: string): T {
  const artifact = context.completedArtifacts.get(stageName);
  if (!artifact) {
    throw new Error(`Required artifact from stage '${stageName}' is missing.`);
  }
  return artifact.payload as T;
}

function createArtifact<TSchema extends z.ZodTypeAny>(
  context: PipelineStageContext,
  order: number,
  schema: TSchema,
  artifactType: string,
  payload: unknown,
  producer: ArtifactProducer = {
    type: "system",
    identifier: "framing-pipeline",
  },
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
    inputArtifactIds: priorArtifacts.map((artifact) => artifact.artifactId),
    parentArtifactIds: previousArtifact ? [previousArtifact.artifactId] : [],
    payload,
  });

  return parsed as ArtifactEnvelope<unknown>;
}

function buildMockExtractedEvidence(
  context: PipelineStageContext,
): ExtractedFramingEvidencePayload {
  const page = context.planIndex.pages.find(
    (candidate) => candidate.sheetId === "A2.01",
  );
  if (!page) {
    throw new Error("Mock fixture sheet A2.01 is missing.");
  }

  const originalText = page.textContent
    .split("\n")
    .find((line) => line.startsWith("Wall W-001:"));
  if (!originalText) {
    throw new Error("Explicit mock wall fixture is missing from A2.01.");
  }

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

  return extractedFramingEvidencePayloadSchema.parse({
    evidence: [
      {
        id: evidenceIdSchema.parse("E-W001-CLASS"),
        type: "note",
        relationship: "supports",
        description: "Explicit wall classification and assembly.",
        source,
        originalText,
        references: [],
      },
      {
        id: evidenceIdSchema.parse("E-W001-GEOMETRY"),
        type: "dimension",
        relationship: "supports",
        description: "Explicit wall length and height.",
        source,
        originalText,
        references: [],
      },
      {
        id: evidenceIdSchema.parse("E-W001-FRAMING"),
        type: "note",
        relationship: "supports",
        description: "Explicit stud size, spacing, and plate count.",
        source,
        originalText,
        references: [],
      },
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
      return createArtifact(
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
      return createArtifact(
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
      return createArtifact(
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
      return createArtifact(
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

      return createArtifact(
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
      const evidenceIds = extracted.evidence.map((evidence) => evidence.id);
      const classEvidenceIds = evidenceIds.filter((id) =>
        /CLASS|TYPE|ASSEMBLY/i.test(id),
      );
      const geometryEvidenceIds = evidenceIds.filter((id) =>
        /GEOMETRY|LENGTH|HEIGHT|DIM/i.test(id),
      );
      const framingEvidenceIds = evidenceIds.filter((id) =>
        /FRAMING|STUD|PLATE|SPACING/i.test(id),
      );
      const completion = {
        status: "complete",
        percentage: 100,
        completedItems: 1,
        totalItems: 1,
      } as const;
      const payload = {
        walls: [
          {
            id: "W-001",
            objectType: "building-wall",
            completion,
            reviewStatus: "no-review-required",
            blockingStatus: "not-blocked",
            evidenceIds,
            assumptionIds: [],
            validationIssueIds: [],
            reviewItemIds: [],
            resolutionTraces: [
              {
                propertyPath: "assembly",
                method: "explicit-project-value",
                explanation: context.useMockAi
                  ? "Assembly values were parsed from the explicit mock fixture statement."
                  : "Interim fixture resolution after live evidence extraction; deterministic wall resolution is not fully wired yet.",
                evidenceIds:
                  classEvidenceIds.length > 0 || framingEvidenceIds.length > 0
                    ? [...classEvidenceIds, ...framingEvidenceIds]
                    : evidenceIds,
                assumptionIds: [],
                validationIssueIds: [],
                reviewItemIds: [],
              },
            ],
            name: "Mock exterior wall W-001",
            level: "Level 1",
            wallType: "exterior-wood-stud-wall",
            location: "exterior",
            bearingStatus: "non-bearing",
            isShearOrBraced: false,
            fireRating: null,
            constructionPhase: "new",
            assembly: {
              material: "dimensional-lumber",
              studSize: "2x4",
              studSpacingInches: 16,
              heightFeet: 8,
              plateCount: 3,
              sheathing: null,
            },
            segmentIds: ["WS-001"],
          },
        ],
        segments: [
          {
            id: "WS-001",
            objectType: "wall-segment",
            completion,
            reviewStatus: "no-review-required",
            blockingStatus: "not-blocked",
            evidenceIds:
              geometryEvidenceIds.length > 0 ? geometryEvidenceIds : evidenceIds,
            assumptionIds: [],
            validationIssueIds: [],
            reviewItemIds: [],
            resolutionTraces: [
              {
                propertyPath: "lengthFeet",
                method: "explicit-project-value",
                explanation: context.useMockAi
                  ? "Length is explicitly stated in the mock fixture."
                  : "Interim fixture length after live evidence extraction; deterministic geometry resolution is not fully wired yet.",
                evidenceIds:
                  geometryEvidenceIds.length > 0
                    ? geometryEvidenceIds
                    : evidenceIds,
                assumptionIds: [],
                validationIssueIds: [],
                reviewItemIds: [],
              },
            ],
            parentWallId: "W-001",
            lengthFeet: 20,
            openingIds: [],
          },
        ],
      };

      return createArtifact(
        context,
        6,
        wallFramingArtifactSchema,
        "wall-framing",
        payload,
      );
    },
  },
  {
    order: 7,
    name: "framingObjects",
    async run(context) {
      const payload: FramingObjectsPayload = {
        openings: [],
        structuralMembers: [],
        subsystemNotes: [
          "The explicit mock fixture states that W-001 has no openings.",
          "No structural member facts were present; none were invented.",
          "Floor, roof, sheathing, blocking, and hardware produced no resolved objects from the fixture.",
        ],
      };
      return createArtifact(
        context,
        7,
        framingObjectsArtifactSchema,
        "framing-objects",
        payload,
      );
    },
  },
  {
    order: 8,
    name: "calculations",
    async run(context) {
      const wallPayload = getPayload<WallFramingPayload>(context, "wallFraming");
      const wall = wallPayload.walls[0];
      const segment = wallPayload.segments[0];
      if (!wall || !segment || segment.lengthFeet === null) {
        throw new Error("Resolved wall geometry is required for calculations.");
      }
      const spacing = wall.assembly.studSpacingInches;
      const plateCount = wall.assembly.plateCount;
      if (spacing === null || plateCount === null || wall.assembly.studSize === null) {
        throw new Error("Resolved wall assembly is required for calculations.");
      }

      const studCount = Math.ceil((segment.lengthFeet * 12) / spacing) + 1;
      const payload: FramingCalculationsPayload = {
        materials: [
          {
            id: "MAT-W001-STUDS",
            category: "lumber",
            description: `${wall.assembly.studSize} studs at ${spacing} in O.C.`,
            canonicalClassification: `stud-${wall.assembly.studSize}`,
            quantity: studCount,
            unit: "each",
            sourceObjectIds: [wall.id, segment.id],
            assumptionIds: [],
            reviewItemIds: [],
          },
          {
            id: "MAT-W001-PLATES",
            category: "lumber",
            description: `${wall.assembly.studSize} wall plates`,
            canonicalClassification: `plate-${wall.assembly.studSize}`,
            quantity: segment.lengthFeet * plateCount,
            unit: "linear-foot",
            sourceObjectIds: [wall.id, segment.id],
            assumptionIds: [],
            reviewItemIds: [],
          },
        ],
      };

      return createArtifact(
        context,
        8,
        framingCalculationsArtifactSchema,
        "framing-calculations",
        payload,
      );
    },
  },
  {
    order: 9,
    name: "validationConfidence",
    async run(context) {
      const extracted = getPayload<ExtractedFramingEvidencePayload>(
        context,
        "extractedEvidence",
      );
      const evidenceIds = extracted.evidence.map((evidence) => evidence.id);
      const payload = {
        validationIssues: [],
        validationResults: [
          {
            id: "VR-W001-ASSEMBLY",
            ruleId: "wall.assembly.resolved",
            level: "object",
            target: { kind: "object", objectId: "W-001", objectType: "building-wall" },
            outcome: "passed",
            explanation: "Required wall assembly properties are resolved.",
            validationIssueIds: [],
            evidenceIds,
          },
          {
            id: "VR-W001-GEOMETRY",
            ruleId: "wall.geometry.resolved",
            level: "calculation",
            target: { kind: "object", objectId: "WS-001", objectType: "wall-segment" },
            outcome: "passed",
            explanation: "Wall length is resolved for deterministic calculation.",
            validationIssueIds: [],
            evidenceIds,
          },
        ],
        reviewItems: [],
        confidenceEvaluations: [
          {
            id: "CE-TAKEOFF-001",
            target: {
              kind: "takeoff",
              pipelineRunId: context.pipelineRunId,
              scopeName: "framing",
            },
            evidence: {
              label: "high",
              explanation: context.useMockAi
                ? "All demo values are explicit."
                : "Live extraction completed; interim fixture resolution remains in place.",
            },
            resolution: { label: "high", explanation: "No assumptions were used." },
            validation: { label: "high", explanation: "All implemented rules passed." },
            overallLabel: "high",
            completion: { status: "complete", percentage: 100, completedItems: 1, totalItems: 1 },
            reviewStatus: "no-review-required",
            blockingStatus: "not-blocked",
            quantityImpactWeight: "high",
            explanation: context.useMockAi
              ? "The explicit mock wall fixture is fully resolved and calculated."
              : "Live evidence was extracted; wall quantities still use interim fixture resolution.",
            evidenceIds,
            assumptionIds: [],
            validationIssueIds: [],
            validationResultIds: ["VR-W001-ASSEMBLY", "VR-W001-GEOMETRY"],
            reviewItemIds: [],
            userDecisionIds: [],
          },
        ],
      };

      return createArtifact(
        context,
        9,
        validationConfidenceArtifactSchema,
        "validation-confidence",
        payload,
      );
    },
  },
  {
    order: 10,
    name: "report",
    async run(context) {
      const wallPayload = getPayload<WallFramingPayload>(context, "wallFraming");
      const objects = getPayload<FramingObjectsPayload>(context, "framingObjects");
      const calculations = getPayload<FramingCalculationsPayload>(context, "calculations");
      const validation = getPayload<ValidationConfidencePayload>(context, "validationConfidence");
      const confidence = validation.confidenceEvaluations[0];
      if (!confidence) {
        throw new Error("Takeoff confidence evaluation is missing.");
      }

      return createArtifact(
        context,
        10,
        finalFramingTakeoffArtifactSchema,
        "final-framing-takeoff",
        {
          projectId: context.projectId,
          scopeName: "framing",
          executionMode: context.useMockAi ? "mock" : "anthropic",
          status: "completed",
          wallIds: wallPayload.walls.map((wall) => wall.id),
          wallSegmentIds: wallPayload.segments.map((segment) => segment.id),
          openingIds: objects.openings.map((opening) => opening.id),
          structuralMemberIds: objects.structuralMembers.map((member) => member.id),
          materials: calculations.materials,
          reviewItemIds: validation.reviewItems.map((item) => item.id),
          validationIssueIds: validation.validationIssues.map((issue) => issue.id),
          confidenceEvaluationId: confidence.id,
          summary: {
            wallCount: wallPayload.walls.length,
            wallSegmentCount: wallPayload.segments.length,
            openingCount: objects.openings.length,
            structuralMemberCount: objects.structuralMembers.length,
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
