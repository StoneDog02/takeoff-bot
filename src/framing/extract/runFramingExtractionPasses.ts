import { aggregateExtractionEvidencePasses } from "../../pdf/aggregateExtractionEvidencePasses.js";
import type { PlanIndex } from "../../pdf/PlanIndex.js";
import type { FramingExtractionIntent } from "../../pdf/deriveRoleAssignmentsFromPageClassification.js";
import type { ClassifiedPlanPage } from "../../pdf/pageClassification.js";
import type { CompiledDrawingPage } from "../../compiler/schemas/compiledDrawingPage.schema.js";
import type { GovernedProjectDictionary } from "../../project-reading/schemas/projectDictionary.schema.js";
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
import { selectGeometryDimObservationsForPages } from "../geometry/buildGeometryDimObservations.js";
import type { GeometryDimObservation } from "../geometry/geometryDimObservation.js";
import type { ExtractionProjectContext } from "./extractionProjectContext.schema.js";
import type { PlanReferenceTrace } from "./planReferenceTrace.schema.js";
import type { ExtractionPageBundle } from "../../pdf/ExtractionPageBundle.js";
import {
  detectMissingRequiredInputsForIdentifiedSystems,
  dropIdentityRestubsForKnownSubjects,
  REQUIRED_INPUT_FOLLOWUP_LEDGER_PURPOSE,
  shouldSkipSameBundleRequiredInputFollowUp,
} from "./detectMissingRequiredInputs.js";

/** Empty assemblies — Stage 4 stub removed from production (D4). */
export const EMPTY_BUILDING_ASSEMBLIES: ExtractFramingEvidenceInput["buildingAssemblies"] =
  {
    assemblyNames: [],
    notes: [],
  };

export type ExtractFramingEvidenceFn = (
  input: ExtractFramingEvidenceInput,
) => Promise<ExtractedFramingEvidencePayload>;

export { REQUIRED_INPUT_FOLLOWUP_LEDGER_PURPOSE };

/**
 * Claude call purposes used by this runner:
 * - `extract:{intent}` — primary region extract (one per work unit)
 * - `extract:required-input-followup` — at most one same-bundle pass, skipped
 *   when it cannot add calculator completeness (identity-only opening/member
 *   stubs). Schema repair is skipped with the extract — it is not invoked.
 * - `reference-followup` — PlanReference drain (unchanged)
 */

export interface RunFramingExtractionPassesInput {
  planIndex: PlanIndex;
  pages: readonly ClassifiedPlanPage[];
  pageClassification: ExtractFramingEvidenceInput["pageClassification"];
  planReadingOrder: ExtractFramingEvidenceInput["planReadingOrder"];
  /** Optional; defaults to empty. Production reader does not inject stub assemblies (D4). */
  buildingAssemblies?: ExtractFramingEvidenceInput["buildingAssemblies"];
  projectDictionary?: GovernedProjectDictionary | null;
  compiledPages?: readonly CompiledDrawingPage[];
  geometryObservations?: GeometryDimObservation[];
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
  bindClaudeCall?: (purpose: string) => {
    onApiCall: () => void;
    onUsage: ExtractFramingEvidenceInput["onUsage"];
  };
  /** Skip PlanReference follow-up drain (tests / frozen probes). */
  skipPlanReferenceDrain?: boolean;
  /** Optional pre-built work plan (for tests / frozen probes). */
  workPlan?: FramingExtractionWorkPlan;
  /**
   * Test seam. Production uses Claude. Must invoke onApiCall when provided
   * so ledger / apiCallCount stay accurate.
   */
  extractEvidence?: ExtractFramingEvidenceFn;
}

export interface RunFramingExtractionPassesResult {
  payload: ExtractedFramingEvidencePayload;
  audit: ExtractionBudgetAudit;
  apiCallCount: number;
  planReferenceTrace: PlanReferenceTrace | null;
}

export function collectKnownSubjects(
  evidence: ExtractedFramingEvidencePayload["evidence"],
): ExtractionProjectContext["knownSubjects"] {
  const byKey = new Map<
    string,
    { subjectKind: string; subjectKey: string; propertyPaths: Set<string> }
  >();
  for (const record of evidence) {
    const id = `${record.subjectKind}:${record.subjectKey}`;
    const existing = byKey.get(id);
    if (existing) {
      existing.propertyPaths.add(record.propertyPath);
      continue;
    }
    byKey.set(id, {
      subjectKind: record.subjectKind,
      subjectKey: record.subjectKey,
      propertyPaths: new Set([record.propertyPath]),
    });
  }
  return [...byKey.values()].map((entry) => ({
    subjectKind: entry.subjectKind,
    subjectKey: entry.subjectKey,
    propertyPaths: [...entry.propertyPaths].sort(),
  }));
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
  const geometryObservations = input.geometryObservations ?? [];
  const enrichedWorkUnits = [...workPlan.audit.workUnits];
  let knownSubjects: ExtractionProjectContext["knownSubjects"] = [];
  const extractEvidence = input.extractEvidence ?? extractFramingEvidenceViaClaude;

  for (const [index, workUnit] of workPlan.workUnits.entries()) {
    const bundlePages = workUnit.bundle.orderedPageNumbers;
    const extractionProjectContext = buildExtractionProjectContext({
      intent: workUnit.bundle.intent,
      bundle: workUnit.bundle,
      dictionary,
      compiledPages,
      buildingAssemblies,
      knownSubjects,
      geometryObservations: selectGeometryDimObservationsForPages(
        geometryObservations,
        bundlePages,
      ),
      requiredInputs: workUnit.requiredInputs ?? workUnit.bundle.requiredInputs,
    });
    const contextAudit = auditExtractionProjectContext(extractionProjectContext);
    enrichedWorkUnits[index] = {
      ...enrichedWorkUnits[index]!,
      ...contextAudit,
    };

    const ledgerHooks = input.bindClaudeCall?.(
      `extract:${workUnit.bundle.intent}`,
    );
    const passResult = await extractEvidence({
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
        ledgerHooks?.onApiCall();
        input.onApiCall?.();
      },
      onUsage: ledgerHooks?.onUsage ?? input.onUsage,
    });

    passes.push({
      stamp: {
        extractionPassId: workUnit.extractionPassId,
        bundleId: workUnit.bundle.bundleId,
      },
      evidence: passResult.evidence,
    });

    const missingRequired = detectMissingRequiredInputsForIdentifiedSystems({
      evidence: passResult.evidence,
      identifiedSystems: workUnit.identifiedSystems,
    });
    // Identity-only identified openings/members cannot gain parent/qty/rough
    // or size/length from a same-bundle re-read. Do not pay for
    // extract:required-input-followup or its schema repair.
    if (
      missingRequired &&
      !shouldSkipSameBundleRequiredInputFollowUp({
        evidence: passResult.evidence,
        identifiedSystems: workUnit.identifiedSystems,
      })
    ) {
      const followUpHooks = input.bindClaudeCall?.(
        REQUIRED_INPUT_FOLLOWUP_LEDGER_PURPOSE,
      );
      const followUpBundle: ExtractionPageBundle = {
        ...workUnit.bundle,
        identifiedSystems: missingRequired.systems,
        requiredInputs: missingRequired.missingPropertyPaths,
        routingNotes: [
          ...workUnit.bundle.routingNotes,
          `Required-input follow-up for ${missingRequired.systems.join(", ")} on the same region sheet (not a new primary).`,
        ],
      };
      const followUpContext = buildExtractionProjectContext({
        intent: workUnit.bundle.intent,
        bundle: followUpBundle,
        dictionary,
        compiledPages,
        buildingAssemblies,
        knownSubjects: collectKnownSubjects(
          aggregateExtractionEvidencePasses({ passes }),
        ),
        geometryObservations: selectGeometryDimObservationsForPages(
          geometryObservations,
          bundlePages,
        ),
        requiredInputs: missingRequired.missingPropertyPaths,
        identifiedSystems: missingRequired.systems,
        requiredInputFollowUp: missingRequired,
      });
      const followUpResult = await extractEvidence({
        planIndex: input.planIndex,
        pageClassification: input.pageClassification,
        planReadingOrder: input.planReadingOrder,
        buildingAssemblies,
        extractionProjectContext: followUpContext,
        extractionBundle: followUpBundle,
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
          followUpHooks?.onApiCall();
          input.onApiCall?.();
        },
        onUsage: followUpHooks?.onUsage ?? input.onUsage,
      });
      passes.push({
        stamp: {
          extractionPassId: `${workUnit.extractionPassId}:required-input-followup`,
          bundleId: workUnit.bundle.bundleId,
        },
        evidence: dropIdentityRestubsForKnownSubjects({
          followUpEvidence: followUpResult.evidence,
          primaryEvidence: passResult.evidence,
        }),
      });
    }

    knownSubjects = collectKnownSubjects(
      aggregateExtractionEvidencePasses({ passes }),
    );
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
    const followUpHooks = input.bindClaudeCall?.("reference-followup");
    const drainResult = await drainPlanReferenceFollowUps({
      planIndex: input.planIndex,
      pages: input.pages,
      primaryEvidence,
      alreadyCoveredPageNumbers,
      scopeName,
      pageClassification: input.pageClassification,
      planReadingOrder: input.planReadingOrder,
      buildingAssemblies,
      projectDictionary: dictionary,
      compiledPages,
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
        followUpHooks?.onApiCall();
        input.onApiCall?.();
      },
      onUsage: followUpHooks?.onUsage ?? input.onUsage,
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
