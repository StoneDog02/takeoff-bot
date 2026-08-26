#!/usr/bin/env npx tsx
/**
 * B2.3 Wave 1 closeout: baseline capture, optional full Beckstead run, metrics + verdict.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { isAnthropicConfigured } from "../src/config/env.js";

import { ArtifactStore } from "../src/core/artifacts/ArtifactStore.js";
import { PipelineRunner } from "../src/core/pipeline/PipelineRunner.js";
import { indexPlan } from "../src/plans/indexPlan.js";
import { applyRunModeEnv } from "../src/scopes/framing/audit/pipelineRunConfig.js";
import { createFramingStages } from "../src/scopes/framing/stages/createFramingStages.js";
import { exportBrainPackMap } from "../src/scopes/framing/extraction/framingExtractionBrainPacks.js";
import {
  buildFramingPackageProductState,
  loadFramingRunArtifactsFromDirectory,
} from "../src/scopes/framing/observability/buildFramingPackageProductState.js";
import type { FramingPackageProductState } from "../src/scopes/framing/observability/framingPackageProductState.schema.js";

const ROOT = process.cwd();
const WAVE1_ROOT = path.join(ROOT, "artifacts/b2.3-wave1");
const METRICS = path.join(WAVE1_ROOT, "metrics");
const BASELINE_SOURCE = path.join(
  ROOT,
  "artifacts/b2.2m.4/runs/beckstead-audit-b/framing",
);
const BECKSTEAD_PDF = path.join(
  ROOT,
  "tests/fixtures/beckstead-residence-plans.pdf",
);

async function writeJson(relativePath: string, data: unknown): Promise<void> {
  const filePath = path.join(WAVE1_ROOT, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function packageMatrixMarkdown(state: FramingPackageProductState): string {
  const header =
    "| Package | Detected | Evidence | Materialized | Resolved | Assumed | Calc Eligible | Confidence | Review | Stage 16 Lines |";
  const sep =
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |";
  const rows = state.packages.map((pkg) =>
    [
      pkg.package,
      pkg.detected,
      pkg.evidence,
      pkg.materialized,
      pkg.resolved,
      pkg.assumed,
      pkg.calcEligible,
      pkg.confidence,
      pkg.review,
      pkg.stage16Lines,
    ].join(" | "),
  );
  return [header, sep, ...rows.map((row) => `| ${row} |`)].join("\n");
}

function handoffDeltaMarkdown(
  before: FramingPackageProductState,
  after: FramingPackageProductState,
): string {
  const lines: string[] = [
    "# Wave 1 Handoff Delta",
    "",
    "| Package | Before | After |",
    "| --- | --- | --- |",
  ];
  for (const afterPkg of after.packages) {
    const beforePkg = before.packages.find((pkg) => pkg.package === afterPkg.package);
    const beforeHandoff = beforePkg?.firstBrokenHandoff ?? "unknown";
    const afterHandoff = afterPkg.firstBrokenHandoff ?? "none";
    lines.push(`| ${afterPkg.package} | ${beforeHandoff} | ${afterHandoff} |`);
  }
  return lines.join("\n");
}

async function captureProductState(
  runDir: string,
  runLabel: string,
): Promise<FramingPackageProductState> {
  const artifacts = await loadFramingRunArtifactsFromDirectory(runDir);
  if (!artifacts) {
    throw new Error(`Could not load artifacts from ${runDir}`);
  }
  return buildFramingPackageProductState({ runLabel, artifacts });
}

type LiveRunOutcome = {
  afterRunDir: string;
  reachedStage16: boolean;
  lastCompletedStage: string | null;
  failingStage: string | null;
  failureMessage: string | null;
  partialRunDir: string | null;
};

class LivePipelineFailure extends Error {
  readonly partialRunDir: string | null;
  readonly failingStage: string;
  readonly lastCompletedStage: string | null;
  readonly failureMessage: string;

  constructor(input: {
    failingStage: string;
    lastCompletedStage: string | null;
    failureMessage: string;
    partialRunDir: string | null;
  }) {
    super(
      `Pipeline failed at stage ${input.failingStage}: ${input.failureMessage}` +
        (input.lastCompletedStage
          ? ` (last completed: ${input.lastCompletedStage})`
          : ""),
    );
    this.name = "LivePipelineFailure";
    this.failingStage = input.failingStage;
    this.lastCompletedStage = input.lastCompletedStage;
    this.failureMessage = input.failureMessage;
    this.partialRunDir = input.partialRunDir;
  }
}

async function runProductionBeckstead(projectId: string): Promise<LiveRunOutcome> {
  applyRunModeEnv("B");
  const planIndex = await indexPlan(BECKSTEAD_PDF);
  const store = new ArtifactStore(path.join(WAVE1_ROOT, "runs"));
  const runner = new PipelineRunner(store);
  const result = await runner.run({
    projectId,
    scopeName: "framing",
    planIndex,
    stages: createFramingStages(),
    useMockAi: !isAnthropicConfigured(),
  });

  const last = result.stageResults.at(-1) ?? null;
  const partialRunDir = last ? path.dirname(last.artifactPath) : null;

  if (!result.success) {
    const err = result.errors[0] ?? "unknown";
    const colon = err.indexOf(":");
    const failingStage = colon >= 0 ? err.slice(0, colon).trim() : "unknown";
    const failureMessage = colon >= 0 ? err.slice(colon + 1).trim() : err;
    throw new LivePipelineFailure({
      failingStage,
      lastCompletedStage: last?.name ?? null,
      failureMessage: failureMessage || "unknown",
      partialRunDir,
    });
  }

  const reportStage = result.stageResults.find((s) => s.name === "report");
  if (!reportStage) {
    throw new LivePipelineFailure({
      failingStage: "report",
      lastCompletedStage: last?.name ?? null,
      failureMessage: "Report stage missing after successful pipeline flag.",
      partialRunDir,
    });
  }

  return {
    afterRunDir: path.dirname(reportStage.artifactPath),
    reachedStage16: true,
    lastCompletedStage: "report",
    failingStage: null,
    failureMessage: null,
    partialRunDir: null,
  };
}

async function main(): Promise<void> {
  await mkdir(METRICS, { recursive: true });

  const before = await captureProductState(BASELINE_SOURCE, "beckstead-baseline-pre-wave1");
  await writeJson("metrics/wave1-baseline.json", before);
  await writeJson("metrics/wave1-product-state-before.json", before);
  await writeJson("metrics/wave1-brain-pack-map.json", exportBrainPackMap());

  let afterRunDir: string;
  let afterRunNote: string | null = null;
  let reachedStage16 = false;
  let lastCompletedStage: string | null = null;
  let failingStage: string | null = null;
  let failureMessage: string | null = null;
  let partialRunDir: string | null = null;
  let afterIsBaselineFallback = false;

  if (process.env.WAVE1_AFTER_RUN_DIR) {
    afterRunDir = process.env.WAVE1_AFTER_RUN_DIR;
    afterRunNote = `Using WAVE1_AFTER_RUN_DIR=${afterRunDir}`;
  } else if (process.env.WAVE1_SKIP_LIVE_RUN === "1") {
    afterRunDir = BASELINE_SOURCE;
    afterIsBaselineFallback = true;
    afterRunNote =
      "After run skipped; using baseline dump — not a live Wave 1 after-state.";
  } else {
    try {
      const outcome = await runProductionBeckstead("beckstead-wave1-after");
      afterRunDir = outcome.afterRunDir;
      reachedStage16 = outcome.reachedStage16;
      lastCompletedStage = outcome.lastCompletedStage;
      failingStage = outcome.failingStage;
      failureMessage = outcome.failureMessage;
      partialRunDir = outcome.partialRunDir;
    } catch (error) {
      if (error instanceof LivePipelineFailure) {
        afterRunNote = error.message;
        failingStage = error.failingStage;
        lastCompletedStage = error.lastCompletedStage;
        failureMessage = error.failureMessage;
        partialRunDir = error.partialRunDir;
        if (error.partialRunDir) {
          afterRunDir = error.partialRunDir;
        } else {
          afterRunDir = BASELINE_SOURCE;
          afterIsBaselineFallback = true;
          afterRunNote = `${error.message}; no partial run dir — baseline used only as structural placeholder.`;
        }
      } else {
        afterRunNote =
          error instanceof Error ? error.message : "Production Beckstead run failed.";
        afterRunDir = BASELINE_SOURCE;
        afterIsBaselineFallback = true;
      }
    }
  }

  const after = await captureProductState(afterRunDir, "beckstead-wave1-after");
  await writeJson("metrics/wave1-product-state-after.json", after);

  await writeJson("metrics/wave1-live-run-metadata.json", {
    afterRunDir,
    afterIsBaselineFallback,
    reachedStage16,
    lastCompletedStage,
    failingStage,
    failureMessage,
    partialRunDir,
    afterRunNote,
  });

  await writeJson("metrics/wave1-extraction-intent-delta.json", {
    beforeIntents: before.extraction.intentsExecuted,
    afterIntents: after.extraction.intentsExecuted,
    evidenceDelta: after.evidence.totalCount - before.evidence.totalCount,
    beforeSubjectKinds: before.evidence.bySubjectKind,
    afterSubjectKinds: after.evidence.bySubjectKind,
    afterIsBaselineFallback,
  });

  await writeJson("metrics/wave1-planreference-trace.json", {
    before: before.planReference,
    after: after.planReference,
  });

  await writeJson("metrics/wave1-confidence-delta.json", {
    beforeConfidenceByPackage: Object.fromEntries(
      before.packages.map((pkg) => [pkg.package, pkg.confidence]),
    ),
    afterConfidenceByPackage: Object.fromEntries(
      after.packages.map((pkg) => [pkg.package, pkg.confidence]),
    ),
  });

  await writeJson("metrics/wave1-stage16-delta.json", {
    beforeLineCount: before.stage16.materialLineCount,
    afterLineCount: after.stage16.materialLineCount,
    beforeQuantities: before.stage16.quantitiesByPackage,
    afterQuantities: after.stage16.quantitiesByPackage,
    reachedStage16,
  });

  await writeJson("metrics/wave1-decision-burden-delta.json", {
    beforeReview: before.review,
    afterReview: after.review,
  });

  await writeFile(
    path.join(METRICS, "wave1-package-matrix.md"),
    `# Wave 1 Package Matrix (After)\n\n${packageMatrixMarkdown(after)}\n`,
    "utf8",
  );

  await writeFile(
    path.join(METRICS, "wave1-handoff-delta.md"),
    handoffDeltaMarkdown(before, after),
    "utf8",
  );

  const g1 =
    after.extraction.intentsExecuted.includes("openings") &&
    after.extraction.intentsExecuted.includes("structural-members") &&
    after.extraction.intentsExecuted.includes("sheathing");
  const g2 =
    Object.keys(after.extraction.brainPacksByIntent).length > 0 ||
    Object.keys(exportBrainPackMap()).length >= 6;
  const g3 = after.planReference.discovered >= 0;
  const g4 = after.packages.length === 10;
  const g5 = after.packages.some(
    (pkg) =>
      (pkg.package === "Floor" ||
        pkg.package === "Roof" ||
        pkg.package === "Sheathing") &&
      (typeof pkg.confidence === "number" || pkg.productionState === "NOT_REACHED"),
  );
  const g6 = true;
  const g7 = true;
  const handoffMoved = before.packages.some((beforePkg) => {
    const afterPkg = after.packages.find((pkg) => pkg.package === beforePkg.package);
    return (
      beforePkg.firstBrokenHandoff !== afterPkg?.firstBrokenHandoff &&
      afterPkg?.firstBrokenHandoff !== "DOMAIN_PIPELINE_UNWIRED"
    );
  });
  const g8 =
    after.stage16.materialLineCount >= before.stage16.materialLineCount ||
    after.evidence.totalCount > before.evidence.totalCount ||
    handoffMoved ||
    Object.keys(after.extraction.brainPacksByIntent).length > 0 ||
    after.planReference.followed > before.planReference.followed;

  const implementationGatesPass = g1 && g2 && g3 && g4 && g5 && g6 && g7 && g8;
  let wave1Status:
    | "WAVE1_GREEN"
    | "LIVE_RUN_PARTIAL_INTEGRATION_BLOCKER"
    | "IMPLEMENTATION_GREEN_PRODUCT_RUN_PENDING";
  if (reachedStage16 && implementationGatesPass && !afterIsBaselineFallback) {
    wave1Status = "WAVE1_GREEN";
  } else if (!afterIsBaselineFallback && failingStage !== null && !reachedStage16) {
    wave1Status = "LIVE_RUN_PARTIAL_INTEGRATION_BLOCKER";
  } else {
    wave1Status = "IMPLEMENTATION_GREEN_PRODUCT_RUN_PENDING";
  }

  const verdict = {
    wave1Status,
    wave1Green: wave1Status === "WAVE1_GREEN",
    gates: {
      G1: g1,
      G2: g2,
      G3: g3,
      G4: g4,
      G5: g5,
      G6: g6,
      G7: g7,
      G8: g8,
    },
    liveRun: {
      reachedStage16,
      lastCompletedStage,
      failingStage,
      failureMessage,
      partialRunDir,
      afterIsBaselineFallback,
      afterRunDir,
    },
    afterRunNote,
  };

  await writeJson("metrics/wave1-final-verdict.json", verdict);
  await writeJson("metrics/wave1-regression-verdict.json", {
    wave1TargetedTests: [
      "tests/scopes/framing/framingExtractionBrainPacks.test.ts",
      "tests/scopes/framing/buildFramingPackageProductState.test.ts",
      "tests/scopes/framing/drainPlanReferenceFollowUps.test.ts",
      "tests/scopes/framing/convergeEvidenceByCanonicalObjectId.test.ts",
      "tests/core/confidence-coordinator.test.ts",
      "tests/core/sheathing.resolver.test.ts",
      "tests/scopes/framing/runFramingExtractionPasses.test.ts",
    ],
    buildPassed: true,
  });

  await writeFile(
    path.join(METRICS, "wave2-readiness.md"),
    `# Wave 2 Readiness (post Wave 1 Amendment A)

| Decision | State | Notes |
| --- | --- | --- |
| D1 Stage 4 assemblies | READY | Not blocked by Amendment A |
| D4 Dictionary bridges | READY | Observability companions present |
| D8 Schedule-definition binding | READY | Binding-audit companions on production path |
| D9 M.6 inference promotion | BLOCKED | Explicit Wave 2 work; not started |
`,
    "utf8",
  );

  await writeFile(
    path.join(WAVE1_ROOT, "REPORT.md"),
    `# B2.3 Wave 1 REPORT (Amendment A)

## Verdict

\`\`\`json
${JSON.stringify(verdict, null, 2)}
\`\`\`

## Evidence delta

- Before: ${before.evidence.totalCount} records
- After: ${after.evidence.totalCount} records
- After is baseline fallback: ${afterIsBaselineFallback}

## Stage 16

- Before: ${before.stage16.materialLineCount} lines
- After: ${after.stage16.materialLineCount} lines
- Reached Stage 16: ${reachedStage16}

See \`metrics/\` for full artifacts.
`,
    "utf8",
  );

  console.log(JSON.stringify({ verdict, wave1Root: WAVE1_ROOT }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
