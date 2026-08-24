import { aggregateExtractionEvidencePasses } from "../../../plans/aggregateExtractionEvidencePasses.js";
import type { PlanIndex } from "../../../plans/PlanIndex.js";
import type { FramingExtractionIntent } from "../../../plans/deriveRoleAssignmentsFromPageClassification.js";
import type { ClassifiedPlanPage } from "../../../plans/pageClassification.js";
import {
  extractFramingEvidenceViaClaude,
  type ExtractFramingEvidenceInput,
} from "../prompts/extractFramingEvidence.js";
import type { ExtractedFramingEvidencePayload } from "../schemas/framing-artifacts.schema.js";
import {
  buildFramingExtractionWorkPlan,
  type FramingExtractionWorkPlan,
} from "./buildFramingExtractionWorkPlan.js";
import type { ExtractionBudgetAudit } from "./extractionBudgetAudit.schema.js";

export interface RunFramingExtractionPassesInput {
  planIndex: PlanIndex;
  pages: readonly ClassifiedPlanPage[];
  pageClassification: ExtractFramingEvidenceInput["pageClassification"];
  planReadingOrder: ExtractFramingEvidenceInput["planReadingOrder"];
  buildingAssemblies: ExtractFramingEvidenceInput["buildingAssemblies"];
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
  /** Optional pre-built work plan (for tests / frozen probes). */
  workPlan?: FramingExtractionWorkPlan;
}

export interface RunFramingExtractionPassesResult {
  payload: ExtractedFramingEvidencePayload;
  audit: ExtractionBudgetAudit;
  apiCallCount: number;
}

/**
 * Runs scoped extraction page bundles sequentially, aggregates Evidence, and
 * returns one project-level extracted-framing-evidence payload.
 */
export async function runFramingExtractionPasses(
  input: RunFramingExtractionPassesInput,
): Promise<RunFramingExtractionPassesResult> {
  const scopeName = input.scopeName ?? "framing";
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

  for (const workUnit of workPlan.workUnits) {
    const passResult = await extractFramingEvidenceViaClaude({
      planIndex: input.planIndex,
      pageClassification: input.pageClassification,
      planReadingOrder: input.planReadingOrder,
      buildingAssemblies: input.buildingAssemblies,
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

  const evidence = aggregateExtractionEvidencePasses({ passes });

  return {
    payload: { evidence },
    audit: workPlan.audit,
    apiCallCount,
  };
}
