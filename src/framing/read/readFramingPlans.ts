import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Evidence } from "../../core/schemas/evidence.schema.js";
import { evidenceIdSchema } from "../../core/schemas/identity.schema.js";
import { compileDrawingPage } from "../../compiler/compileDrawingPage.js";
import type { CompiledDrawingPage } from "../../compiler/schemas/compiledDrawingPage.schema.js";
import type { SemanticDefinition } from "../../compiler/schemas/semanticDefinition.schema.js";
import { buildPlanReadingOrderFromClassification } from "../../pdf/buildPlanReadingOrder.js";
import type { PlanIndex } from "../../pdf/PlanIndex.js";
import { resolvePageClassificationForPipeline } from "../../pdf/resolvePageClassificationForPipeline.js";
import { buildOrientationDictionary } from "../../project-reading/buildOrientationDictionary.js";
import { CompilerInvestigationFacade } from "../../project-reading/compilerInvestigationFacade.js";
import { DictionaryGovernor } from "../../project-reading/dictionaryGovernor.js";
import type { ProjectOrientationContext } from "../../project-reading/projectOrientationContext.js";
import { isProjectLearningEnabled } from "../../project-reading/projectLearning/isProjectLearningEnabled.js";
import {
  mapProjectLearningToSemanticDefinitions,
  mergeProjectSemanticDefinitions,
} from "../../project-reading/projectLearning/mapProjectLearningToSemanticDefinitions.js";
import { runProjectLearning } from "../../project-reading/projectLearning/runProjectLearning.js";
import type {
  GovernedProjectDictionary,
  ProjectDictionary,
  ProjectSemanticDefinition as DictSemanticDefinition,
} from "../../project-reading/schemas/projectDictionary.schema.js";
import { isDrawingSemanticBindingEnabled } from "./isDrawingSemanticBindingEnabled.js";
import { isProjectOrientationEnabled } from "./isProjectOrientationEnabled.js";
import {
  isDrawingCompilerEnabled,
  selectPagesForDrawingCompiler,
} from "./selectPagesForDrawingCompiler.js";
import { runFramingExtractionPasses } from "../extract/runFramingExtractionPasses.js";
import { adoptOpeningSemanticEvidenceOntoGeometry } from "../geometry/adoptOpeningSemanticEvidenceOntoGeometry.js";
import { buildAreaSystemRelationshipEvidence } from "../geometry/buildAreaSystemRelationshipEvidence.js";
import { buildConstructionSemanticRelationshipEvidence } from "../geometry/buildConstructionSemanticRelationshipEvidence.js";
import { buildGeometryEvidenceFromCompiledPages } from "../geometry/buildGeometryEvidenceFromCompiledPages.js";
import { buildGovernedSemanticCompilerEvidenceWithOwnership } from "../geometry/buildGovernedSemanticCompilerEvidence.js";
import { buildSemanticBindingEvidenceFromCompiledPages } from "../geometry/buildSemanticBindingEvidenceFromCompiledPages.js";
import { collectWallAssemblyNoteTexts } from "../geometry/collectWallAssemblyNoteTexts.js";
import { mergeExtractedAndGeometryEvidence } from "../geometry/mergeExtractedAndGeometryEvidence.js";
import {
  extractedFramingEvidencePayloadSchema,
  type ExtractedFramingEvidencePayload,
  type PageClassificationPayload,
  type PlanReadingOrderPayload,
} from "../schemas/framing-artifacts.schema.js";
import { resolveFloorFraming } from "../resolve/resolveFloorFraming.js";
import { resolveOpenings } from "../resolve/resolveOpenings.js";
import { resolveRoofFraming } from "../resolve/resolveRoofFraming.js";
import { resolveSheathing } from "../resolve/resolveSheathing.js";
import { resolveStructuralMembers } from "../resolve/resolveStructuralMembers.js";
import { resolveWallFraming } from "../resolve/resolveWallFraming.js";
import {
  framingConstructionSchema,
  type FramingConstruction,
} from "../schemas/framingConstruction.schema.js";

export type ReadFramingPlansInput = {
  projectId: string;
  planIndex: PlanIndex;
  useMockAi: boolean;
  /** When set, skip live extraction and resolve this Evidence directly. */
  evidenceReplay?: readonly Evidence[];
  writeDebugArtifacts?: boolean;
  artifactsRoot?: string;
};

export type ReadFramingPlansResult = {
  construction: FramingConstruction;
  evidence: Evidence[];
  pageClassification: PageClassificationPayload;
  planReadingOrder: PlanReadingOrderPayload;
  compiledPages: CompiledDrawingPage[];
  projectDictionary: GovernedProjectDictionary | null;
  debugPaths: string[];
};

function buildMockExtractedEvidence(
  planIndex: PlanIndex,
): ExtractedFramingEvidencePayload {
  const page = planIndex.pages.find((candidate) =>
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

async function writeDebugJson(
  root: string,
  projectId: string,
  fileName: string,
  payload: unknown,
): Promise<string> {
  const directory = path.resolve(root, projectId, "framing");
  await mkdir(directory, { recursive: true });
  const artifactPath = path.join(directory, fileName);
  await writeFile(artifactPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return artifactPath;
}

function buildFramingConstructionFromEvidence(
  evidence: readonly Evidence[],
): FramingConstruction {
  const walls = resolveWallFraming([...evidence]);
  const openings = resolveOpenings([...evidence], { wallFraming: walls });
  return framingConstructionSchema.parse({
    walls,
    openings,
    structuralMembers: resolveStructuralMembers([...evidence]),
    floorFraming: resolveFloorFraming([...evidence]),
    roofFraming: resolveRoofFraming([...evidence]),
    sheathing: resolveSheathing([...evidence]),
  });
}

/**
 * READ THE PLANS for the framing takeoff path.
 *
 * Internally sequences classification, reading order, Project Learning /
 * Orientation / DictionaryGovernor, Drawing Compiler, and extraction bridges.
 * Does not use Stage 4 buildingAssemblies. Does not mint wall-existence
 * Evidence as an eligibility gate (D4, D10).
 */
export async function readFramingPlans(
  input: ReadFramingPlansInput,
): Promise<ReadFramingPlansResult> {
  const debugPaths: string[] = [];
  const artifactsRoot = input.artifactsRoot ?? "artifacts";

  const classified = await resolvePageClassificationForPipeline({
    planIndex: input.planIndex,
    useMockAi: input.useMockAi,
  });
  const pageClassification: PageClassificationPayload = {
    pages: classified.pages,
  };
  const planReadingOrder: PlanReadingOrderPayload =
    buildPlanReadingOrderFromClassification(pageClassification.pages);

  if (input.writeDebugArtifacts) {
    debugPaths.push(
      await writeDebugJson(
        artifactsRoot,
        input.projectId,
        "reader-page-classification.json",
        pageClassification,
      ),
    );
    debugPaths.push(
      await writeDebugJson(
        artifactsRoot,
        input.projectId,
        "reader-plan-reading-order.json",
        planReadingOrder,
      ),
    );
  }

  const compiledPages: CompiledDrawingPage[] = [];
  let orientationContext: ProjectOrientationContext | undefined;
  let crossPageDefinitions: readonly SemanticDefinition[] = [];
  let projectDictionary: GovernedProjectDictionary | null = null;

  if (isDrawingCompilerEnabled()) {
    const emptyTextPageNumbers = input.planIndex.pages
      .filter((page) => page.textContent.trim().length === 0)
      .map((page) => page.pageNumber);
    const selected = selectPagesForDrawingCompiler({
      classifiedPages: pageClassification.pages,
      orderedPageNumbers: planReadingOrder.orderedPageNumbers,
      emptyTextPageNumbers,
    });

    let learningValidatedDefs: DictSemanticDefinition[] = [];

    if (isProjectLearningEnabled()) {
      const learning = await runProjectLearning({
        projectId: input.projectId,
        planIndex: input.planIndex,
        classifiedPages: pageClassification.pages,
        artifactOutputDir: path.join(
          artifactsRoot,
          "project-learning",
          input.projectId,
          "reader",
        ),
        allowLiveOdl: !input.useMockAi,
        allowLiveClaudeInterpret: !input.useMockAi,
      });
      learningValidatedDefs = learning.validatedDefinitions;
      if (input.writeDebugArtifacts) {
        debugPaths.push(
          await writeDebugJson(
            artifactsRoot,
            input.projectId,
            "reader-project-learning.json",
            learning.payload,
          ),
        );
      }
    }

    const schedulePageFromClassification = pageClassification.pages.find(
      (page) =>
        page.pageKind === "schedule" || page.contentRoles.includes("schedule"),
    )?.pageNumber;

    if (isProjectOrientationEnabled()) {
      const facade = await CompilerInvestigationFacade.create(
        input.planIndex.pdfPath,
      );
      const built = await buildOrientationDictionary({
        projectId: input.planIndex.pdfPath,
        pdfPath: input.planIndex.pdfPath,
        facade,
        schedulePageNumber: schedulePageFromClassification,
      });
      const dictionaryWithLearning: ProjectDictionary = {
        ...built.dictionary,
        definitions: mergeProjectSemanticDefinitions(
          built.dictionary.definitions,
          learningValidatedDefs,
        ),
      };
      const governor = new DictionaryGovernor(facade);
      const govReport = await governor.govern(dictionaryWithLearning);
      const acceptedLearning = learningValidatedDefs.filter((def) =>
        govReport.acceptedDefinitionKeys.some(
          (key) =>
            key.trim().toUpperCase() === def.semanticTypeKey.trim().toUpperCase(),
        ),
      );
      orientationContext = {
        ...built.orientationContext,
        definitions: [
          ...built.orientationContext.definitions,
          ...mapProjectLearningToSemanticDefinitions(acceptedLearning),
        ],
        dictionaryDefinitions: govReport.dictionary.definitions,
      };
      crossPageDefinitions = orientationContext.definitions;
      projectDictionary = govReport.dictionary as GovernedProjectDictionary;
    } else if (learningValidatedDefs.length > 0) {
      const facade = await CompilerInvestigationFacade.create(
        input.planIndex.pdfPath,
      );
      const learningDictionary: ProjectDictionary = {
        projectId: input.projectId,
        generatedAt: new Date().toISOString(),
        interpreterModel: "project-learning-v1",
        experimentBranch: "hybrid",
        observations: [],
        hypotheses: [],
        definitions: learningValidatedDefs,
        bindings: [],
        unresolved: [],
        contradictions: [],
        metrics: { toolCalls: 0, tokens: 0, durationMs: 0 },
      };
      const governor = new DictionaryGovernor(facade);
      const govReport = await governor.govern(learningDictionary);
      const acceptedLearning = learningValidatedDefs.filter((def) =>
        govReport.acceptedDefinitionKeys.some(
          (key) =>
            key.trim().toUpperCase() === def.semanticTypeKey.trim().toUpperCase(),
        ),
      );
      crossPageDefinitions =
        mapProjectLearningToSemanticDefinitions(acceptedLearning);
      projectDictionary = govReport.dictionary as GovernedProjectDictionary;
    }

    for (const pageNumber of selected) {
      const compiled = await compileDrawingPage({
        pdfPath: input.planIndex.pdfPath,
        pageNumber,
        options: {
          crossPageDefinitions:
            crossPageDefinitions.length > 0 ? crossPageDefinitions : undefined,
          orientationContext,
          referenceMechanism:
            orientationContext?.referenceMechanismHint ?? undefined,
        },
      });
      compiledPages.push(compiled);
    }
  }

  if (input.writeDebugArtifacts) {
    debugPaths.push(
      await writeDebugJson(
        artifactsRoot,
        input.projectId,
        "reader-compiled-drawing-pages.json",
        { pages: compiledPages },
      ),
    );
  }

  let evidence: Evidence[];

  if (input.evidenceReplay) {
    evidence = [...input.evidenceReplay];
  } else if (input.useMockAi) {
    evidence = buildMockExtractedEvidence(input.planIndex).evidence;
  } else {
    const extractionResult = await runFramingExtractionPasses({
      planIndex: input.planIndex,
      pages: pageClassification.pages,
      pageClassification,
      planReadingOrder,
      // D4: no stub buildingAssemblies
      projectDictionary,
      compiledPages,
      scopeName: "framing",
    });

    let mergedEvidence = mergeExtractedAndGeometryEvidence({
      claudeEvidence: extractionResult.payload.evidence,
      geometryEvidence: buildGeometryEvidenceFromCompiledPages(compiledPages),
    }).evidence;

    const bridgeEvidence = buildAreaSystemRelationshipEvidence(
      mergedEvidence,
      projectDictionary,
    );
    if (bridgeEvidence.length > 0) {
      mergedEvidence = [...mergedEvidence, ...bridgeEvidence];
    }

    const constructionSemanticResult =
      buildConstructionSemanticRelationshipEvidence({
        evidence: mergedEvidence,
        classifiedPages: pageClassification.pages,
      });
    if (constructionSemanticResult.evidence.length > 0) {
      mergedEvidence = [
        ...mergedEvidence,
        ...constructionSemanticResult.evidence,
      ];
    }

    const wallAssemblyNoteTexts = await collectWallAssemblyNoteTexts({
      pdfPath: input.planIndex.pdfPath,
      pageNumbers: [1, 3, 4].filter(
        (pageNumber) => pageNumber <= input.planIndex.totalPages,
      ),
      ocrCacheDir: process.env.TAKEOFF_WALL_ASSEMBLY_OCR_CACHE_DIR ?? null,
    });
    const semanticCompilerBuild =
      buildGovernedSemanticCompilerEvidenceWithOwnership(
        compiledPages,
        projectDictionary,
        { noteTexts: wallAssemblyNoteTexts },
      );
    if (semanticCompilerBuild.evidence.length > 0) {
      mergedEvidence = [...mergedEvidence, ...semanticCompilerBuild.evidence];
    }
    if (semanticCompilerBuild.ownedOpeningMarks.length > 0) {
      mergedEvidence = adoptOpeningSemanticEvidenceOntoGeometry({
        evidence: mergedEvidence,
        ownedMarks: semanticCompilerBuild.ownedOpeningMarks,
      }).evidence;
    }

    if (isDrawingSemanticBindingEnabled()) {
      mergedEvidence = [
        ...mergedEvidence,
        ...buildSemanticBindingEvidenceFromCompiledPages(compiledPages),
      ];
    }

    // Intentionally omit wall-existence Evidence mint (D10).
    evidence = mergedEvidence;
  }

  if (input.writeDebugArtifacts) {
    debugPaths.push(
      await writeDebugJson(
        artifactsRoot,
        input.projectId,
        "reader-extracted-evidence.json",
        { evidence },
      ),
    );
  }

  const construction = buildFramingConstructionFromEvidence(evidence);

  if (input.writeDebugArtifacts) {
    debugPaths.push(
      await writeDebugJson(
        artifactsRoot,
        input.projectId,
        "reader-construction.json",
        construction,
      ),
    );
  }

  return {
    construction,
    evidence,
    pageClassification,
    planReadingOrder,
    compiledPages,
    projectDictionary,
    debugPaths,
  };
}
