import { aggregateExtractionEvidencePasses } from "../../../plans/aggregateExtractionEvidencePasses.js";
import type { PlanIndex } from "../../../plans/PlanIndex.js";
import type { FramingExtractionIntent } from "../../../plans/deriveRoleAssignmentsFromPageClassification.js";
import type { ClassifiedPlanPage } from "../../../plans/pageClassification.js";
import type { CompiledDrawingPage } from "../../../drawing-compiler/schemas/compiledDrawingPage.schema.js";
import type { GovernedProjectDictionary } from "../../../project-interpreter/schemas/projectDictionary.schema.js";
import {
  extractFramingEvidenceViaClaude,
  type ExtractFramingEvidenceInput,
} from "../prompts/extractFramingEvidence.js";
import type { ExtractedFramingEvidencePayload } from "../schemas/framing-artifacts.schema.js";
import {
  auditExtractionProjectContext,
  buildExtractionProjectContext,
} from "./buildExtractionProjectContext.js";
import { drainPlanReferenceFollowUps } from "./drainPlanReferenceFollowUps.js";
import {
  buildFramingExtractionWorkPlan,
  type FramingExtractionWorkPlan,
} from "./buildFramingExtractionWorkPlan.js";
import type { ExtractionBudgetAudit } from "./extractionBudgetAudit.schema.js";
import type { PlanReferenceTrace } from "./planReferenceTrace.schema.js";

/** Empty assemblies — Stage 4 stub removed from production (D4). */
export const EMPTY_BUILDING_ASSEMBLIES: ExtractFramingEvidenceInput["buildingAssemblies"] =
  {
    assemblyNames: [],
    notes: [],
  };

export interface RunFramingExtractionPassesInput {
  planIndex: PlanIndex;
  pages: readonly ClassifiedPlanPage[];
  pageClassification: ExtractFramingEvidenceInput["pageClassification"];
  planReadingOrder: ExtractFramingEvidenceInput["planReadingOrder"];
  /** Optional; defaults to empty. Production reset does not inject stub assemblies (D4). */
  buildingAssemblies?: ExtractFramingEvidenceInput["buildingAssemblies"];
  projectDictionary?: GovernedProjectDictionary | null;
  compiledPages?: readonly CompiledDrawingPage[];
  scopeName?: string;
  intents?: readonly FramingExtractionIntent[];
  pageVisuals?: ExtractFramingEvidenceInput["pageVisuals"];
  visualOutputDir?: ExtractFramingEvidenceInput["visualOutputDir"];
  visualScale?: ExtractFramingEvidenceInput["visualScale"];
  pageTiles?: ExtractFramingEvidenceInput["pageTiles"];
  tileOutputDir?: ExtractFramingEvidenceInput["tileOutputDir"];
  tileSourceScale?: ExtractFramingEvidenceInput["tileSourceScale"];
  tileColumns?: ExtractFramingEvidenceInput["tileColumns"];
  tileRows?: ExtractFramingEvidenceInput["tileRows"];
  tileOverlapFraction?: ExtractFramingEvidenceInput["tileOverlapFraction"];
  onApiCall?: ExtractFramingEvidenceInput["onApiCall"];
  onUsage?: ExtractFramingEvidenceInput["onUsage"];
  /** Skip PlanReference follow-up drain (tests / frozen probes). */
  skipPlanReferenceDrain?: boolean;
  /** Optional pre-built work plan (for tests / frozen probes). */
  workPlan?: FramingExtractionWorkPlan;
}

export interface RunFramingExtractionPassesResult {
  payload: ExtractedFramingEvidencePayload;
  audit: ExtractionBudgetAudit;
  apiCallCount: number;
  planReferenceTrace: PlanReferenceTrace | null;
}

/**
 * Runs scoped extraction page bundles sequentially, aggregates Evidence, and
 * returns one project-level extracted-framing-evidence payload.
 */
export async function runFramingExtractionPasses(
  input: RunFramingExtractionPassesInput,
): Promise<RunFramingExtractionPassesResult> {
  const scopeName = input.scopeName ?? "framing";
  const buildingAssemblies =
    input.buildingAssemblies ?? EMPTY_BUILDING_ASSEMBLIES;
  const workPlan =
    input.workPlan ??
    buildFramingExtractionWorkPlan({
      planIndex: input.planIndex,
      pages: input.pages,
      scopeName,
      intents: input.intents,
    });

  let apiCallCount = 0;
  const passes: Array<{
    stamp: { extractionPassId: string; bundleId: string };
    evidence: ExtractedFramingEvidencePayload["evidence"];
  }> = [];
  const compiledPages = input.compiledPages ?? [];
  const dictionary = input.projectDictionary ?? null;
  const enrichedWorkUnits = [...workPlan.audit.workUnits];

  for (const [index, workUnit] of workPlan.workUnits.entries()) {
    const extractionProjectContext = buildExtractionProjectContext({
      intent: workUnit.bundle.intent,
      bundle: workUnit.bundle,
      dictionary,
      compiledPages,
      buildingAssemblies,
    });
    const contextAudit = auditExtractionProjectContext(extractionProjectContext);
    enrichedWorkUnits[index] = {
      ...enrichedWorkUnits[index]!,
      ...contextAudit,
    };

    const passResult = await extractFramingEvidenceViaClaude({
      planIndex: input.planIndex,
      pageClassification: input.pageClassification,
      planReadingOrder: input.planReadingOrder,
      buildingAssemblies,
      extractionProjectContext,
      extractionBundle: workUnit.bundle,
      pageVisuals: input.pageVisuals,
      visualOutputDir: input.visualOutputDir,
      visualScale: input.visualScale,
      pageTiles: input.pageTiles,
      tileOutputDir: input.tileOutputDir,
      tileSourceScale: input.tileSourceScale,
      tileColumns: input.tileColumns,
      tileRows: input.tileRows,
      tileOverlapFraction: input.tileOverlapFraction,
      onApiCall: () => {
        apiCallCount += 1;
        input.onApiCall?.();
      },
      onUsage: input.onUsage,
    });

    passes.push({
      stamp: {
        extractionPassId: workUnit.extractionPassId,
        bundleId: workUnit.bundle.bundleId,
      },
      evidence: passResult.evidence,
    });
  }

  const primaryEvidence = aggregateExtractionEvidencePasses({ passes });
  const alreadyCoveredPageNumbers = new Set<number>();
  for (const unit of workPlan.audit.workUnits) {
    for (const pageNumber of unit.orderedPageNumbers) {
      alreadyCoveredPageNumbers.add(pageNumber);
    }
  }

  let planReferenceTrace: PlanReferenceTrace | null = null;
  if (!input.skipPlanReferenceDrain) {
    const drainResult = await drainPlanReferenceFollowUps({
      planIndex: input.planIndex,
      pages: input.pages,
      primaryEvidence,
      alreadyCoveredPageNumbers,
      scopeName,
      pageClassification: input.pageClassification,
      planReadingOrder: input.planReadingOrder,
      buildingAssemblies,
      pageVisuals: input.pageVisuals,
      visualOutputDir: input.visualOutputDir,
      visualScale: input.visualScale,
      pageTiles: input.pageTiles,
      tileOutputDir: input.tileOutputDir,
      tileSourceScale: input.tileSourceScale,
      tileColumns: input.tileColumns,
      tileRows: input.tileRows,
      tileOverlapFraction: input.tileOverlapFraction,
      onApiCall: () => {
        apiCallCount += 1;
        input.onApiCall?.();
      },
      onUsage: input.onUsage,
    });
    planReferenceTrace = drainResult.trace;
    apiCallCount += drainResult.apiCallCount;
    if (drainResult.passes.length > 0) {
      passes.push(...drainResult.passes);
    }
  }

  const evidence = aggregateExtractionEvidencePasses({ passes });

  return {
    payload: { evidence },
    audit: {
      ...workPlan.audit,
      workUnits: enrichedWorkUnits,
    },
    apiCallCount,
    planReferenceTrace,
  };
}
