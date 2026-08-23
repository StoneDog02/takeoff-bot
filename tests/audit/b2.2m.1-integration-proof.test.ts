import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { ArtifactStore } from "../../src/core/artifacts/ArtifactStore.js";
import { PipelineRunner } from "../../src/core/pipeline/PipelineRunner.js";
import { indexPlan } from "../../src/plans/indexPlan.js";
import {
  PROJECT_DICTIONARY_BINDING_PASS_ID,
} from "../../src/scopes/framing/geometry/buildProjectDictionaryBindingEvidence.js";
import { applyRunModeEnv } from "../../src/scopes/framing/audit/pipelineRunConfig.js";
import { createFramingStagesForAudit } from "../../src/scopes/framing/audit/createFramingStagesForAudit.js";
import { loadOwnershipTruth } from "../../src/scopes/framing/audit/groundTruthComparators.js";

const BECKSTEAD_PDF = path.join(
  "tests",
  "fixtures",
  "beckstead-residence-plans.pdf",
);

describe("B2.2M.1 Beckstead semantic evidence integration", () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of [
      "TAKEOFF_COMPILER",
      "TAKEOFF_COMPILER_OCR",
      "TAKEOFF_COMPILER_MAX_PAGES",
      "TAKEOFF_PROJECT_ORIENTATION",
      "TAKEOFF_SEMANTIC_BINDING",
      "TAKEOFF_SEMANTIC_DEFINITION_EXTRACTION",
      "TAKEOFF_B2_2L3_PROOF",
      "TAKEOFF_SCHEDULE_PAGE_NUMBERS",
    ]) {
      originalEnv[key] = process.env[key];
    }
  });

  afterEach(() => {
    for (const [key, val] of Object.entries(originalEnv)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  });

  it(
    "p1-p4 pipeline emits definition and class dictionary Evidence without SW4 subtype on O4 run",
    { timeout: 600_000 },
    async () => {
      applyRunModeEnv("A", { maxPages: 4 });

      const planIndex = await indexPlan(BECKSTEAD_PDF);
      const artifactRoot = await mkdtemp(path.join(tmpdir(), "b2.2m1-int-"));
      const store = new ArtifactStore(path.join(artifactRoot, "runs"));
      const runner = new PipelineRunner(store);

      try {
        const result = await runner.run({
          projectId: "beckstead-m1-test",
          pdfPath: BECKSTEAD_PDF,
          scopeName: "framing",
          planIndex,
          useMockAi: true,
          stages: createFramingStagesForAudit("compiler_only"),
        });

        assert.equal(result.success, true);

        const evidenceStage = result.stageResults.find(
          (s) => s.name === "extractedEvidence",
        );
        assert.ok(evidenceStage);

        const raw = JSON.parse(
          await (await import("node:fs/promises")).readFile(
            evidenceStage.artifactPath,
            "utf8",
          ),
        );
        const evidence = raw.payload.evidence as Array<{
          extractionPassId?: string | null;
          subjectKey: string;
          propertyPath: string;
          candidateValue: unknown;
        }>;

        const definitionCount = evidence.filter(
          (e) => e.extractionPassId === "b2.2l.3-definition",
        ).length;
        const dictionaryCount = evidence.filter(
          (e) => e.extractionPassId === PROJECT_DICTIONARY_BINDING_PASS_ID,
        ).length;

        assert.ok(definitionCount > 0, "expected schedule definition evidence");
        assert.ok(dictionaryCount > 0, "expected dictionary binding evidence");

        const ownership = await loadOwnershipTruth(process.cwd());
        if (ownership) {
          const o4Evidence = evidence.filter(
            (e) => e.subjectKey === ownership.physicalRunKey,
          );
          assert.ok(
            o4Evidence.some(
              (e) =>
                e.propertyPath === "wallType" &&
                String(e.candidateValue).includes("shear"),
            ),
            "expected class wallType on O4 run",
          );
          assert.ok(
            !o4Evidence.some(
              (e) =>
                e.propertyPath === "semanticTypeKey" &&
                e.candidateValue === "SW4",
            ),
            "SW4 subtype must not bind to O4 run",
          );
        }
      } finally {
        await rm(artifactRoot, { recursive: true, force: true });
      }
    },
  );
});
