import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  geometrySummarySchema,
  scopeCoverageSchema,
} from "../../src/scopes/framing/audit/auditMetrics.schema.js";
import { runFramingTakeoffAudit } from "../../src/scopes/framing/audit/runFramingTakeoffAudit.js";

const BECKSTEAD_PDF = path.join(
  "tests",
  "fixtures",
  "beckstead-residence-plans.pdf",
);

describe("B2.2M Beckstead compile smoke", () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    originalEnv.TAKEOFF_COMPILER = process.env.TAKEOFF_COMPILER;
    originalEnv.TAKEOFF_COMPILER_OCR = process.env.TAKEOFF_COMPILER_OCR;
  });

  afterEach(() => {
    for (const [key, val] of Object.entries(originalEnv)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  });

  it(
    "RUN A with max 2 pages completes pipeline and emits metrics",
    { timeout: 600_000 },
    async () => {
      const repoRoot = process.cwd();
      const artifactRoot = await mkdtemp(path.join(tmpdir(), "b2.2m-beck-"));
      const metricsDir = path.join(artifactRoot, "metrics");

      try {
        const { summaries } = await runFramingTakeoffAudit({
          repoRoot,
          pdfPath: BECKSTEAD_PDF,
          modes: ["A"],
          artifactRoot,
          metricsDir,
          maxCompilePages: 2,
        });

        assert.equal(summaries.length, 1);
        assert.equal(summaries[0]!.runMode, "A");
        assert.equal(summaries[0]!.pipelineSuccess, true);

        const scopeRaw = await readFile(
          path.join(metricsDir, "scope-coverage-A.json"),
          "utf8",
        );
        scopeCoverageSchema.parse(JSON.parse(scopeRaw));

        const geometryRaw = await readFile(
          path.join(metricsDir, "geometry-summary.json"),
          "utf8",
        );
        const geometry = geometrySummarySchema.parse(JSON.parse(geometryRaw));
        assert.ok(geometry.groundTruthChecks.length >= 2);
      } finally {
        await rm(artifactRoot, { recursive: true, force: true });
      }
    },
  );
});
