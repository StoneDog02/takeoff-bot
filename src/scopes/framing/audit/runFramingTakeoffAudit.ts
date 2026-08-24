import { cp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { ArtifactStore } from "../../../core/artifacts/ArtifactStore.js";
import { PipelineRunner } from "../../../core/pipeline/PipelineRunner.js";
import type { PipelineRunResult } from "../../../core/pipeline/types.js";
import { indexPlan } from "../../../plans/indexPlan.js";
import { collectOpeningCoverage } from "./collectOpeningCoverage.js";
import {
  auditSummarySchema,
  automationCoverageSchema,
  CAPABILITY_INVENTORY,
  failureTaxonomySchema,
  geometrySummarySchema,
  materialOutputSummarySchema,
  ocrWarningAuditSchema,
  openingCoverageSchema,
  resolutionCoverageSchema,
  runtimeCostSchema,
  scopeCoverageSchema,
  semanticsSummarySchema,
  type AuditRunMode,
  type AuditSummary,
} from "./auditMetrics.schema.js";
import { buildFailureTaxonomy, pickTopBlocker } from "./buildFailureTaxonomy.js";
import { buildScopeCoverage } from "./buildScopeCoverage.js";
import { createFramingStagesForAudit, type ClaudeUsageHolder } from "./createFramingStagesForAudit.js";
import {
  collectAutomationCoverage,
  collectGeometrySummary,
  collectMaterialOutputSummary,
  collectResolutionCoverage,
  collectRuntimeCost,
  collectSemanticsSummary,
  countReviewWorkspace,
  loadAuditArtifactsFromRun,
} from "./collectFramingAuditMetrics.js";
import { collectAllGroundTruthChecks } from "./groundTruthComparators.js";
import { generateAuditReportMarkdown } from "./generateAuditReport.js";
import {
  buildOcrWarningAudit,
  startOcrWarningCapture,
} from "./ocrWarningCapture.js";
import {
  applyRunModeEnv,
  evidenceStageVariant,
  shouldUseMockAi,
  snapshotEnv,
  TRACKED_ENV_KEYS,
} from "./pipelineRunConfig.js";

export type RunFramingAuditOptions = {
  repoRoot: string;
  pdfPath: string;
  modes: AuditRunMode[];
  artifactRoot: string;
  metricsDir: string;
  maxCompilePages?: number;
};

export type RunFramingAuditResult = {
  summaries: AuditSummary[];
  reportMarkdown: string;
};

async function copyReportArtifact(
  result: PipelineRunResult,
  destFile: string,
): Promise<void> {
  const reportStage = result.stageResults.find((s) => s.name === "report");
  if (!reportStage) return;
  if (path.resolve(reportStage.artifactPath) === path.resolve(destFile)) {
    return;
  }
  await cp(reportStage.artifactPath, destFile);
}

export async function runSingleAuditMode(
  options: RunFramingAuditOptions,
  mode: AuditRunMode,
): Promise<{
  result: PipelineRunResult;
  durationMs: number;
  envSnapshot: Record<string, string>;
  ocrWarnings: string[];
  claudeUsage?: ClaudeUsageHolder;
}> {
  const envSnapshot = applyRunModeEnv(mode, {
    maxPages: options.maxCompilePages,
  });
  const variant = evidenceStageVariant(mode);
  const ocrCapture = startOcrWarningCapture(envSnapshot);
  const claudeUsage: ClaudeUsageHolder | undefined =
    mode === "B" ? { calls: 0, inputTokens: 0, outputTokens: 0 } : undefined;

  const t0 = performance.now();
  const planIndex = await indexPlan(options.pdfPath);
  const projectId = `beckstead-audit-${mode.toLowerCase().replace("+", "plus")}`;
  const store = new ArtifactStore(path.join(options.artifactRoot, "runs"));
  const runner = new PipelineRunner(store);

  let result: PipelineRunResult;
  try {
    result = await runner.run({
      projectId,
      pdfPath: options.pdfPath,
      scopeName: "framing",
      planIndex,
      useMockAi: shouldUseMockAi(mode),
      stages: createFramingStagesForAudit(variant, claudeUsage),
    });
  } finally {
    ocrCapture.restore();
  }

  const durationMs = performance.now() - t0;
  const runDest = path.join(options.artifactRoot, "runs", projectId, "framing");
  if (result.success) {
    await copyReportArtifact(
      result,
      path.join(options.artifactRoot, "runs", `preserved-${mode.toLowerCase().replace("+", "plus")}-takeoff.json`),
    );
  }

  return {
    result,
    durationMs,
    envSnapshot,
    ocrWarnings: ocrCapture.warnings,
    claudeUsage,
  };
}

export async function runFramingTakeoffAudit(
  options: RunFramingAuditOptions,
): Promise<RunFramingAuditResult> {
  await mkdir(options.metricsDir, { recursive: true });

  const summaries: AuditSummary[] = [];
  let primaryArtifacts: Awaited<ReturnType<typeof loadAuditArtifactsFromRun>> = null;
  let primaryGeometry: Awaited<ReturnType<typeof collectGeometrySummary>> | null = null;
  let primaryMaterials: ReturnType<typeof collectMaterialOutputSummary> | null = null;
  let primaryAutomation: ReturnType<typeof collectAutomationCoverage> | null = null;
  let primarySemantics: ReturnType<typeof collectSemanticsSummary> | null = null;
  let allOcrWarnings: string[] = [];
  const scopeByMode: ReturnType<typeof buildScopeCoverage>[] = [];

  let primaryReview: ReturnType<typeof countReviewWorkspace> | null = null;

  for (const mode of options.modes) {
    const { result, durationMs, envSnapshot, ocrWarnings, claudeUsage } =
      await runSingleAuditMode(options, mode);
    allOcrWarnings.push(...ocrWarnings);

    const artifacts = await loadAuditArtifactsFromRun(result);
    const failedStages = result.errors.map((e) => e.split(":")[0] ?? "unknown");

    if (artifacts) {
      const groundTruthChecks = await collectAllGroundTruthChecks(
        options.repoRoot,
        artifacts,
      );
      const automation = collectAutomationCoverage(artifacts);
      const materials = collectMaterialOutputSummary(artifacts);
      const semantics = collectSemanticsSummary(artifacts, groundTruthChecks);
      const scope = buildScopeCoverage(mode, artifacts, automation, materials, semantics);
      scopeByMode.push(scope);

      if (mode === "A" || (mode === "A+" && !primaryArtifacts)) {
        primaryArtifacts = artifacts;
        primaryAutomation = automation;
        primaryMaterials = materials;
        primarySemantics = semantics;
        primaryGeometry = await collectGeometrySummary(
          artifacts,
          options.repoRoot,
          groundTruthChecks,
        );
        primaryReview = countReviewWorkspace(artifacts);
      }

      const resolution = collectResolutionCoverage(artifacts);
      const runtime = collectRuntimeCost(
        result,
        durationMs,
        artifacts,
        mode,
        claudeUsage,
      );
      const failure = buildFailureTaxonomy(mode, artifacts, automation, semantics);
      const topBlocker = pickTopBlocker(failure, automation);

      const summary = auditSummarySchema.parse({
        generatedAt: new Date().toISOString(),
        fixturePdf: options.pdfPath,
        runMode: mode,
        pipelineSuccess: result.success,
        stageCount: result.stageResults.length,
        failedStages,
        executionMode: artifacts.takeoff?.executionMode ?? null,
        envSnapshot,
        capabilityInventory: CAPABILITY_INVENTORY,
        topBlocker: topBlocker
          ? {
              failureClass: topBlocker.failureClass,
              summary: topBlocker.summary,
              productImpact: topBlocker.productImpact,
              rankingMethod: topBlocker.rankingMethod,
              rankedEntryId: topBlocker.rankedEntryId,
            }
          : null,
      });

      summaries.push(summary);

      await writeFile(
        path.join(options.metricsDir, `resolution-coverage-${mode}.json`),
        JSON.stringify(resolution, null, 2),
      );
      await writeFile(
        path.join(options.metricsDir, `runtime-cost-${mode}.json`),
        JSON.stringify(runtimeCostSchema.parse(runtime), null, 2),
      );
      await writeFile(
        path.join(options.metricsDir, `scope-coverage-${mode}.json`),
        JSON.stringify(scopeCoverageSchema.parse(scope), null, 2),
      );
      await writeFile(
        path.join(options.metricsDir, `failure-taxonomy-${mode}.json`),
        JSON.stringify(failureTaxonomySchema.parse(failure), null, 2),
      );
      await writeFile(
        path.join(options.metricsDir, `material-output-${mode}.json`),
        JSON.stringify(materialOutputSummarySchema.parse(materials), null, 2),
      );
      await writeFile(
        path.join(options.metricsDir, `automation-coverage-${mode}.json`),
        JSON.stringify(automationCoverageSchema.parse(automation), null, 2),
      );
      await writeFile(
        path.join(options.metricsDir, `semantics-summary-${mode}.json`),
        JSON.stringify(semanticsSummarySchema.parse(semantics), null, 2),
      );
      if (mode === "A" && primaryGeometry) {
        await writeFile(
          path.join(options.metricsDir, "geometry-summary.json"),
          JSON.stringify(geometrySummarySchema.parse(primaryGeometry), null, 2),
        );
      }
      if (mode === "A" && artifacts) {
        const openingCoverage = collectOpeningCoverage(artifacts);
        await writeFile(
          path.join(options.metricsDir, `opening-coverage-${mode}.json`),
          JSON.stringify(openingCoverageSchema.parse(openingCoverage), null, 2),
        );
      }
    } else {
      summaries.push(
        auditSummarySchema.parse({
          generatedAt: new Date().toISOString(),
          fixturePdf: options.pdfPath,
          runMode: mode,
          pipelineSuccess: false,
          stageCount: result.stageResults.length,
          failedStages: ["pipeline"],
          executionMode: null,
          envSnapshot,
          capabilityInventory: CAPABILITY_INVENTORY,
          topBlocker: {
            failureClass: "VALIDATION_FAILURE",
            summary: "Pipeline did not complete",
            productImpact: "Fix stage failure before takeoff audit",
          },
        }),
      );
    }
  }

  const correlatedMisses =
    primaryGeometry?.groundTruthChecks
      .filter(
        (c) =>
          c.label === "KNOWN_INCORRECT" ||
          c.label === "NOT_ATTEMPTED" ||
          c.label === "UNRESOLVED",
      )
      .map((c) => c.checkId) ?? [];

  const ocrAudit = buildOcrWarningAudit(
    allOcrWarnings,
    snapshotEnv(TRACKED_ENV_KEYS),
    correlatedMisses,
  );
  await writeFile(
    path.join(options.metricsDir, "ocr-warning-audit.json"),
    JSON.stringify(ocrWarningAuditSchema.parse(ocrAudit), null, 2),
  );

  const primaryFailure = primaryArtifacts
    ? buildFailureTaxonomy(
        "A",
        primaryArtifacts,
        primaryAutomation!,
        primarySemantics!,
      )
    : { entries: [] };

  await writeFile(
    path.join(options.metricsDir, "audit-summary.json"),
    JSON.stringify({ summaries }, null, 2),
  );
  await writeFile(
    path.join(options.metricsDir, "failure-taxonomy.json"),
    JSON.stringify(failureTaxonomySchema.parse(primaryFailure), null, 2),
  );

  const primaryScope = scopeByMode.find((s) => s.runMode === "A") ?? scopeByMode[0];
  if (primaryScope) {
    await writeFile(
      path.join(options.metricsDir, "scope-coverage.json"),
      JSON.stringify(scopeCoverageSchema.parse(primaryScope), null, 2),
    );
  }

  const reportMarkdown = generateAuditReportMarkdown({
    summaries,
    scopeByMode,
    failureTaxonomy: primaryFailure,
    geometry: primaryGeometry,
    materials: primaryMaterials,
    automation: primaryAutomation,
    semantics: primarySemantics,
    reviewWorkspace: primaryReview,
  });

  return { summaries, reportMarkdown };
}
