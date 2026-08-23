import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  auditSummarySchema,
  automationCoverageSchema,
  ocrWarningAuditSchema,
  scopeCoverageSchema,
  semanticsSummarySchema,
} from "../../src/scopes/framing/audit/auditMetrics.schema.js";
import { buildOcrWarningAudit } from "../../src/scopes/framing/audit/ocrWarningCapture.js";
import {
  checkLengthEvidenceAgainstP4Truth,
} from "../../src/scopes/framing/audit/groundTruthComparators.js";
import { runFramingTakeoffAudit } from "../../src/scopes/framing/audit/runFramingTakeoffAudit.js";

const WALL_PDF = path.join("tests", "fixtures", "wall-w001-text-layer.pdf");

describe("B2.2M audit metrics", () => {
  it("audit summary schema accepts capability inventory", () => {
    const parsed = auditSummarySchema.parse({
      generatedAt: new Date().toISOString(),
      fixturePdf: WALL_PDF,
      runMode: "A0",
      pipelineSuccess: true,
      stageCount: 16,
      failedStages: [],
      executionMode: "mock",
      envSnapshot: {},
      capabilityInventory: [
        { name: "planIndex", status: "production" },
        { name: "drawingCompiler", status: "flag_gated", envFlags: ["TAKEOFF_COMPILER=1"] },
      ],
      topBlocker: null,
    });
    assert.equal(parsed.runMode, "A0");
    assert.ok(parsed.capabilityInventory.length >= 2);
  });

  it("scope coverage and automation schemas parse minimal payloads", () => {
    scopeCoverageSchema.parse({
      runMode: "A",
      rows: [
        {
          category: "Wall geometry",
          class: "E",
          whatWorks: "none",
          whatBlocks: "compiler",
        },
      ],
    });
    automationCoverageSchema.parse({
      denominatorExplanation: "test",
      segmentsWithLength: 0,
      segmentsWithFullWallAssemblyForStuds: 0,
      segmentsCalculableStuds: 0,
      segmentsCalculablePlates: 0,
      materialCategoriesPresent: [],
      materialCategoriesAbsent: ["lumber"],
    });
    semanticsSummarySchema.parse({
      evidenceByPassId: {},
      scheduleDefinitionsOnCompile: 0,
      projectDictionaryBindings: 0,
      semanticBindingsEmit: 0,
      dereferenceEmit: 0,
      wallsWithSemanticTypeKey: 0,
      groundTruthChecks: [],
    });
  });

  it("ground truth comparators label p4 length correctly", () => {
    const expected = {
      pageNumber: 4,
      physicalRunKey: "physical-run:p4:56b410484f2d",
      exampleTextContains: "54",
      forbiddenFeetApprox: 240,
    };
    const good = checkLengthEvidenceAgainstP4Truth(
      [
        {
          subjectKey: expected.physicalRunKey,
          propertyPath: "lengthFeet",
          candidateValue: 54,
        },
      ],
      expected,
    );
    assert.equal(good[0]!.label, "VERIFIED_CORRECT");

    const bad = checkLengthEvidenceAgainstP4Truth(
      [
        {
          subjectKey: expected.physicalRunKey,
          propertyPath: "lengthFeet",
          candidateValue: 240,
        },
      ],
      expected,
    );
    assert.equal(bad[0]!.label, "KNOWN_INCORRECT");
  });

  it("OCR warning audit classifies harmless rejects when truth holds", () => {
    const audit = buildOcrWarningAudit(
      ["Image too small to scale!! (1x36 vs min width of 3)"],
      { TAKEOFF_SEMANTIC_DEFINITION_EXTRACTION: "1" },
      [],
    );
    ocrWarningAuditSchema.parse(audit);
    assert.equal(audit.samples[0]!.classification, "harmless_reject");
    assert.equal(audit.byConsumer["schedule-row-band"], 1);
  });

  it(
    "runs A0 audit on wall fixture quickly",
    { timeout: 120_000 },
    async () => {
      const repoRoot = process.cwd();
      const artifactRoot = await mkdtemp(path.join(tmpdir(), "b2.2m-test-"));
      const metricsDir = path.join(artifactRoot, "metrics");

      try {
        const { summaries } = await runFramingTakeoffAudit({
          repoRoot,
          pdfPath: WALL_PDF,
          modes: ["A0"],
          artifactRoot,
          metricsDir,
        });

        assert.equal(summaries.length, 1);
        assert.equal(summaries[0]!.runMode, "A0");

        const summaryRaw = await readFile(
          path.join(metricsDir, "audit-summary.json"),
          "utf8",
        );
        const summaryJson = JSON.parse(summaryRaw) as { summaries: unknown[] };
        assert.ok(summaryJson.summaries.length === 1);
      } finally {
        await rm(artifactRoot, { recursive: true, force: true });
      }
    },
  );
});
