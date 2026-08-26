#!/usr/bin/env npx tsx
/**
 * B2.3 Wave 5 closeout: Beckstead CS-FLOOR authority + relationship handoff metrics.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { isAnthropicConfigured } from "../src/config/env.js";
import { ArtifactStore } from "../src/core/artifacts/ArtifactStore.js";
import { PipelineRunner } from "../src/core/pipeline/PipelineRunner.js";
import { indexPlan } from "../src/plans/indexPlan.js";
import { applyRunModeEnv } from "../src/scopes/framing/audit/pipelineRunConfig.js";
import type { ExtractionBudgetAudit } from "../src/scopes/framing/extraction/extractionBudgetAudit.schema.js";
import type { RelationshipEmissionAuditPayload } from "../src/scopes/framing/extraction/relationshipEmissionAudit.schema.js";
import {
  buildFramingPackageProductState,
  loadFramingRunArtifactsFromDirectory,
} from "../src/scopes/framing/observability/buildFramingPackageProductState.js";
import type { FramingPackageProductState } from "../src/scopes/framing/observability/framingPackageProductState.schema.js";
import type { FloorFramingPayload } from "../src/scopes/framing/schemas/framing-artifacts.schema.js";
import { buildConstructionSemanticRelationshipEvidence } from "../src/scopes/framing/geometry/buildConstructionSemanticRelationshipEvidence.js";
import { resolveFloorFraming } from "../src/scopes/framing/resolvers/resolveFloorFraming.js";
import { createFramingStages } from "../src/scopes/framing/stages/createFramingStages.js";

const ROOT = process.cwd();
const WAVE5_ROOT = path.join(ROOT, "artifacts/b2.3-wave5");
const METRICS = path.join(WAVE5_ROOT, "metrics");
const WAVE4_AFTER = path.join(
  ROOT,
  "artifacts/b2.3-wave4/runs/beckstead-wave4-after/framing",
);
const BECKSTEAD_PDF = path.join(
  ROOT,
  "tests/fixtures/beckstead-residence-plans.pdf",
);

async function writeJson(relativePath: string, data: unknown): Promise<void> {
  const filePath = path.join(WAVE5_ROOT, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function countParentLinks(payload: FloorFramingPayload | null): {
  linked: number;
  total: number;
} {
  if (!payload) {
    return { linked: 0, total: 0 };
  }
  const areas = payload.areas ?? [];
  return {
    total: areas.length,
    linked: areas.filter((area) => !area.parentSystemId.endsWith("UNRESOLVED")).length,
  };
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

async function main(): Promise<void> {
  await mkdir(METRICS, { recursive: true });

  const wave4Baseline = await captureProductState(WAVE4_AFTER, "beckstead-wave4-after");
  await writeJson("metrics/wave4-reference-product-state.json", wave4Baseline);

  let afterRunDir = WAVE4_AFTER;
  let reachedStage16 = false;
  let afterIsReplayFallback = true;
  let afterRunNote =
    "Live run skipped — wave4 artifacts used as replay baseline (set WAVE5_AFTER_RUN_DIR or unset WAVE5_SKIP_LIVE_RUN).";

  if (process.env.WAVE5_AFTER_RUN_DIR) {
    afterRunDir = process.env.WAVE5_AFTER_RUN_DIR;
    afterIsReplayFallback = false;
    reachedStage16 = true;
    afterRunNote = `Using WAVE5_AFTER_RUN_DIR=${afterRunDir}`;
  } else if (process.env.WAVE5_SKIP_LIVE_RUN !== "1") {
    applyRunModeEnv("B");
    const planIndex = await indexPlan(BECKSTEAD_PDF);
    const store = new ArtifactStore(path.join(WAVE5_ROOT, "runs"));
    const runner = new PipelineRunner(store);
    const result = await runner.run({
      projectId: "beckstead-wave5-after",
      scopeName: "framing",
      planIndex,
      stages: createFramingStages(),
      useMockAi: !isAnthropicConfigured(),
    });

    const reportStage = result.stageResults.find((stage) => stage.name === "report");
    if (result.success && reportStage) {
      afterRunDir = path.dirname(reportStage.artifactPath);
      reachedStage16 = true;
      afterIsReplayFallback = false;
      afterRunNote = isAnthropicConfigured()
        ? "Live Anthropic Beckstead Wave 5 run completed."
        : "Mock-AI Beckstead Wave 5 run completed (no Anthropic key).";
    } else {
      afterRunNote = result.errors.join("; ") || "Pipeline failed.";
      const last = result.stageResults.at(-1);
      if (last) {
        afterRunDir = path.dirname(last.artifactPath);
      }
    }
  }

  const after = await captureProductState(afterRunDir, "beckstead-wave5-after");
  await writeJson("metrics/wave5-after-product-state.json", after);

  const extractedEnvelope = await readJson<{
    payload: { evidence: Array<{ id: string; propertyPath: string; description?: string }> };
  }>(path.join(afterRunDir, "06-extractedEvidence.json"));
  const pageClassificationEnvelope = await readJson<{
    payload: { pages: Parameters<typeof buildConstructionSemanticRelationshipEvidence>[0]["classifiedPages"] };
  }>(path.join(afterRunDir, "02-pageClassification.json"));
  const relationshipEnvelope = await readJson<{ payload: RelationshipEmissionAuditPayload }>(
    path.join(afterRunDir, "06-extractedEvidence.relationship-emission-audit.json"),
  );
  const extractionEnvelope = await readJson<{ payload: ExtractionBudgetAudit }>(
    path.join(afterRunDir, "06-extractedEvidence.extraction-work-units.json"),
  );
  const floorEnvelope = await readJson<{ payload: FloorFramingPayload }>(
    path.join(afterRunDir, "11-floorFraming.json"),
  );

  const parentSystemTagRecords =
    extractedEnvelope?.payload.evidence.filter(
      (record) => record.propertyPath === "parentSystemTag",
    ) ?? [];

  const csRecords = parentSystemTagRecords.filter((record) =>
    record.description?.includes("Authority[CONSTRUCTION_SEMANTIC:CS-FLOOR]"),
  );

  const contextWorkUnits =
    extractionEnvelope?.payload.workUnits.filter(
      (unit) =>
        (unit.intent === "floor-framing" ||
          unit.intent === "sheathing" ||
          unit.intent === "roof-framing") &&
        unit.contextSliceHash,
    ) ?? [];
  const contextInjectedCount = contextWorkUnits.filter(
    (unit) => unit.contextInjected === true,
  ).length;

  const floorLinks = countParentLinks(floorEnvelope?.payload ?? null);

  let replayAudit: ReturnType<typeof buildConstructionSemanticRelationshipEvidence>["audit"] | null =
    null;
  let replayFloorLinked = floorLinks.linked;

  if (
    afterIsReplayFallback &&
    extractedEnvelope &&
    pageClassificationEnvelope &&
    relationshipEnvelope?.payload.semanticAuthorityAccepted == null
  ) {
    const replay = buildConstructionSemanticRelationshipEvidence({
      evidence: extractedEnvelope.payload.evidence as never,
      classifiedPages: pageClassificationEnvelope.payload.pages,
    });
    replayAudit = replay.audit;
    const replayPayload = resolveFloorFraming([
      ...(extractedEnvelope.payload.evidence as never[]),
      ...replay.evidence,
    ]);
    replayFloorLinked = replayPayload.areas.filter(
      (area) => !area.parentSystemId.endsWith("UNRESOLVED"),
    ).length;
  }

  const rel = relationshipEnvelope?.payload;
  const effectiveRel = rel ?? replayAudit;

  const csAudit = relationshipEnvelope?.payload ?? replayAudit;
  const semanticAuthorityAccepted =
    csAudit?.semanticAuthorityAccepted ?? replayAudit?.semanticAuthorityAccepted ?? 0;

  const wave5Green = semanticAuthorityAccepted >= 1 && replayFloorLinked >= 1;

  const verdict = {
    wave5Status: reachedStage16 && wave5Green ? "WAVE5_GREEN" : "WAVE5_PARTIAL",
    nextStopGate:
      "joistLayoutLengthFeet authority — crawl areas may remain calculator-starved until layout length is established from plan dimensions.",
    metrics: {
      totalEvidence: after.evidence.totalCount,
      parentSystemTagCount: parentSystemTagRecords.length,
      relationshipsEmitted: parentSystemTagRecords.length,
      constructionSemanticEmissionCount:
        effectiveRel?.constructionSemanticEmissionCount ??
        replayAudit?.semanticAuthorityAccepted ??
        csRecords.length,
      semanticAuthorityCandidates:
        effectiveRel?.semanticAuthorityCandidates ??
        replayAudit?.semanticAuthorityCandidates ??
        0,
      semanticAuthorityAccepted,
      semanticAuthorityRejected:
        effectiveRel?.semanticAuthorityRejected ?? replayAudit?.semanticAuthorityRejected ?? {},
      ambiguousAuthorityCount:
        effectiveRel?.ambiguousAuthorityCount ?? replayAudit?.ambiguousAuthorityCount ?? 0,
      conflictCandidatesPreserved:
        effectiveRel?.conflictCandidatesPreserved ??
        replayAudit?.conflictCandidatesPreserved ??
        [],
      relationshipsByAuthorityClass: effectiveRel?.relationshipsByAuthorityClass ?? {},
      floorLinked: replayFloorLinked,
      floorTotal: floorLinks.total,
      stage14TotalLines: after.stage16.materialLineCount,
      wallsStage16Lines:
        after.packages.find((pkg) => pkg.package === "Walls")?.stage16Lines ?? 0,
      contextWorkUnitCount: contextWorkUnits.length,
      contextInjectedCount,
      relationshipEvidenceIds: parentSystemTagRecords.map((record) => record.id),
    },
    liveRun: {
      reachedStage16,
      afterIsReplayFallback,
      afterRunDir,
      afterRunNote,
      anthropicConfigured: isAnthropicConfigured(),
    },
  };

  await writeJson("metrics/wave5-final-verdict.json", verdict);
  await writeFile(
    path.join(WAVE5_ROOT, "REPORT.md"),
    `# B2.3 Wave 5 REPORT

## Verdict

\`\`\`json
${JSON.stringify(verdict, null, 2)}
\`\`\`

## Wave 4 reference vs Wave 5 after

| Metric | Wave 4 ref | Wave 5 after |
| --- | ---: | ---: |
| Evidence | ${wave4Baseline.evidence.totalCount} | ${after.evidence.totalCount} |
| parentSystemTag | — | ${parentSystemTagRecords.length} |
| CS accepted | — | ${rel?.semanticAuthorityAccepted ?? 0} |
| Floor linked | — | ${floorLinks.linked}/${floorLinks.total} |
| Stage 14 lines | ${wave4Baseline.stage16.materialLineCount} | ${after.stage16.materialLineCount} |

## Next STOP gate

${verdict.nextStopGate}

See \`metrics/\` for artifacts.
`,
    "utf8",
  );

  console.log(JSON.stringify({ verdict, wave5Root: WAVE5_ROOT }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
