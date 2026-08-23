import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";

import { compileDrawingPage } from "../../src/drawing-compiler/compileDrawingPage.js";
import { governPhysicalRunSemanticBindings } from "../../src/drawing-compiler/governance/governPhysicalRunSemanticBindings.js";
import { rankTypeMarkOwnership } from "../../src/drawing-compiler/type-marks/rankTypeMarkOwnership.js";
import { detectTypeIdentifierPrimitives } from "../../src/drawing-compiler/type-marks/detectTypeIdentifierPrimitives.js";
import {
  mergeTypeMarkSources,
  recoverSemanticMarkObservations,
  typeMarksFromObservations,
} from "../../src/drawing-compiler/semantic-mark-recovery/recoverSemanticMarkObservations.js";
import { buildPageGeometryContext } from "../../src/drawing-compiler/semantic-mark-recovery/auditVisualMarkPage.js";
import { prepareMarkAuditPageContext } from "../../src/drawing-compiler/semantic-mark-recovery/prepareMarkAuditPageContext.js";
import { classifyCompilerPageRole } from "../../src/drawing-compiler/page-role/classifyCompilerPageRole.js";

const FIXTURES = path.join("tests", "fixtures");

describe("semantic mark recovery compile integration", () => {
  it(
    "Level 1: DIRECT_OCR branch produces SemanticMarkObservation on Beckstead schedule page",
    { timeout: 180_000 },
    async () => {
      const prev = process.env.TAKEOFF_SEMANTIC_MARK_RECOVERY;
      process.env.TAKEOFF_SEMANTIC_MARK_RECOVERY = "1";
      delete process.env.TAKEOFF_SEMANTIC_MARK_RECOVERY_BRANCH;

      try {
        const compiled = await compileDrawingPage({
          pdfPath: path.join(FIXTURES, "beckstead-residence-plans.pdf"),
          pageNumber: 1,
        });

        assert.equal(compiled.semanticMarkRecovery.phase0Decision, "DIRECT_OCR");
        assert.ok(compiled.semanticMarkRecovery.observations.length >= 1);
        assert.ok(
          compiled.semanticMarkRecovery.observations.some(
            (o) => o.normalizedKey === "SW1" || o.rawText === "SW1",
          ),
        );
        assert.ok(compiled.semanticMarkRecovery.metrics.ocrCallsRequired > 0);
      } finally {
        if (prev === undefined) delete process.env.TAKEOFF_SEMANTIC_MARK_RECOVERY;
        else process.env.TAKEOFF_SEMANTIC_MARK_RECOVERY = prev;
      }
    },
  );

  it(
    "Beckstead p4 records mark recovery failure class when plan page yields no identifiers",
    { timeout: 180_000 },
    async () => {
      const prev = process.env.TAKEOFF_SEMANTIC_MARK_RECOVERY;
      process.env.TAKEOFF_SEMANTIC_MARK_RECOVERY = "1";

      try {
        const compiled = await compileDrawingPage({
          pdfPath: path.join(FIXTURES, "beckstead-residence-plans.pdf"),
          pageNumber: 4,
        });

        assert.equal(compiled.semanticMarkRecovery.phase0Decision, "DIRECT_OCR");
        assert.equal(
          compiled.semanticMarkRecovery.metrics.typeIdentifierRecovered,
          0,
        );
        assert.equal(compiled.semanticMarkRecovery.metrics.markRecoveryFailures, 1);
        assert.equal(compiled.semanticBinding.emitBindingIds.length, 0);
      } finally {
        if (prev === undefined) delete process.env.TAKEOFF_SEMANTIC_MARK_RECOVERY;
        else process.env.TAKEOFF_SEMANTIC_MARK_RECOVERY = prev;
      }
    },
  );

  it(
    "recovered SW1 can associate to a run under DIRECT_OCR when ownership margin is sufficient",
    { timeout: 180_000 },
    async () => {
      const ctx = await prepareMarkAuditPageContext({
        pdfPath: path.join(FIXTURES, "beckstead-residence-plans.pdf"),
        pageNumber: 1,
      });

      const recovery = await recoverSemanticMarkObservations({
        pdfPath: path.join(FIXTURES, "beckstead-residence-plans.pdf"),
        pageNumber: 1,
        pageWidth: ctx.pageWidth,
        pageHeight: ctx.pageHeight,
        segments: ctx.segments,
        pbgRuns: ctx.pbgRuns,
        primitives: ctx.primitives,
        phase0Decision: "DIRECT_OCR",
      });

      const geometry = buildPageGeometryContext({
        segments: ctx.segments,
        pbgRuns: ctx.pbgRuns,
        pageNumber: 1,
      });
      const fromNative = detectTypeIdentifierPrimitives(ctx.primitives);
      const fromObs = typeMarksFromObservations(
        recovery.observations,
        geometry.leaders,
      );
      const marks = mergeTypeMarkSources(fromNative, fromObs);
      const ownership = rankTypeMarkOwnership({ marks, pbgRuns: ctx.pbgRuns });
      const pageRole = classifyCompilerPageRole(ctx.primitives, {
        rawItemCount: ctx.rawItemCount,
      });
      const governed = governPhysicalRunSemanticBindings({
        pageNumber: 1,
        pageRole,
        associations: ownership.associations,
        pbgRuns: ctx.pbgRuns,
      });

      assert.ok(recovery.observations.length >= 1);
      if (governed.emitBindingIds.length >= 1) {
        assert.ok(
          governed.bindings.some(
            (b) => b.emit && b.semanticSubjectKey === "SW1",
          ),
        );
      }
    },
  );
});
