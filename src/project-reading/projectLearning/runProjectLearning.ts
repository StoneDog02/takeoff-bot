import path from "node:path";

import type { ClassifiedPlanPage } from "../../pdf/pageClassification.js";
import type { PlanIndex } from "../../pdf/PlanIndex.js";
import type { ProjectSemanticDefinition } from "../schemas/projectDictionary.schema.js";
import { harvestProjectLearning } from "./harvestProjectLearning.js";
import {
  interpretProjectLearningRegionsDeterministic,
  type InterpretedDefinitionProposal,
} from "./interpretProjectLearningRegions.js";
import { interpretProjectLearningRegionsWithClaude } from "./interpretProjectLearningRegionsClaude.js";
import { selectProjectLearningPages } from "./selectProjectLearningPages.js";
import { validateProjectLearningDefinitions } from "./validateProjectLearningDefinitions.js";
import {
  projectLearningPayloadSchema,
  type ProjectLearningCandidate,
  type ProjectLearningHarvestTelemetry,
  type ProjectLearningPayload,
} from "./projectLearningTypes.js";

export type RunProjectLearningInput = {
  projectId: string;
  planIndex: PlanIndex;
  classifiedPages: readonly ClassifiedPlanPage[];
  /** Persist ODL JSON under this directory when live harvest runs. */
  artifactOutputDir: string;
  allowLiveOdl?: boolean;
  /**
   * When true, use Claude region interpretation (production).
   * When false, deterministic-only (CI / mock AI).
   */
  allowLiveClaudeInterpret?: boolean;
  seedCandidates?: ProjectLearningCandidate[];
  interpretProposals?: readonly InterpretedDefinitionProposal[];
  crossCheckByKey?: ReadonlyMap<string, readonly string[]>;
  skipHybridServerEnsure?: boolean;
  ocrFallbackCandidates?: ProjectLearningCandidate[];
};

export type RunProjectLearningResult = {
  payload: ProjectLearningPayload;
  validatedDefinitions: ProjectSemanticDefinition[];
  selectionReason: string;
  harvestTelemetry: ProjectLearningHarvestTelemetry;
};

/**
 * Once-per-run Project Learning pipeline: select → harvest → interpret → validate.
 * Only validatedDefinitions are context-eligible.
 */
export async function runProjectLearning(
  input: RunProjectLearningInput,
): Promise<RunProjectLearningResult> {
  const selection = selectProjectLearningPages({
    classifiedPages: input.classifiedPages,
    planIndex: input.planIndex,
  });

  const harvestStarted = Date.now();
  const harvest = await harvestProjectLearning({
    pdfPath: input.planIndex.pdfPath,
    pageNumbers: selection.pageNumbers,
    preferHybrid: selection.preferHybrid,
    outputDir: path.join(input.artifactOutputDir, "odl-raw"),
    planIndex: input.planIndex,
    seedCandidates: input.seedCandidates,
    allowLiveOdl: input.allowLiveOdl,
    skipHybridServerEnsure: input.skipHybridServerEnsure,
    ocrFallbackCandidates: input.ocrFallbackCandidates,
  });
  const harvestTimingMs = Date.now() - harvestStarted;

  const interpretStarted = Date.now();
  let interpreted: ProjectLearningCandidate[];
  let interpretPath: "deterministic" | "claude-region" = "deterministic";
  let interpretTelemetry = undefined as
    | import("./claudeRegionInterpretContract.js").ProjectLearningInterpretTelemetry
    | undefined;

  if (input.allowLiveClaudeInterpret) {
    const claude = await interpretProjectLearningRegionsWithClaude({
      pdfPath: input.planIndex.pdfPath,
      candidates: harvest.candidates,
    });
    interpretTelemetry = claude.telemetry;
    // Promote any remaining harvested candidates that already carry explicit
    // construction semantics (e.g. row-band OCR assist) without bypassing
    // the later validation/governor gate.
    interpreted = interpretProjectLearningRegionsDeterministic({
      candidates: claude.candidates,
      proposals: input.interpretProposals,
    });
    interpretPath = "claude-region";
  } else {
    interpreted = interpretProjectLearningRegionsDeterministic({
      candidates: harvest.candidates,
      proposals: input.interpretProposals,
    });
  }
  const interpretTimingMs = Date.now() - interpretStarted;

  const validated = validateProjectLearningDefinitions({
    candidates: interpreted,
    crossCheckByKey: input.crossCheckByKey,
    provenanceToolCallId: "project-learning-v1",
  });

  const payload = projectLearningPayloadSchema.parse({
    projectId: input.projectId,
    generatedAt: new Date().toISOString(),
    harvestPageNumbers: selection.pageNumbers,
    candidates: validated.candidates,
    metrics: {
      pagesHarvested: selection.pageNumbers.length,
      hybridUsed: harvest.telemetry.hybridActuallyUsed,
      harvestTelemetry: harvest.telemetry,
      harvestTimingMs,
      interpretTimingMs,
      acceptedCount: validated.acceptedKeys.length,
      rejectedCount: validated.rejectedKeys.length,
      unresolvedCount: validated.candidates.filter(
        (c) => c.validationStatus === "unresolved",
      ).length,
      conflictCount: validated.candidates.filter(
        (c) => c.validationStatus === "conflict",
      ).length,
      interpretPath,
      interpretTelemetry,
    },
  });

  return {
    payload,
    validatedDefinitions: validated.validatedDefinitions,
    selectionReason: selection.reason,
    harvestTelemetry: harvest.telemetry,
  };
}
