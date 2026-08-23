import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { CompiledDrawingPage } from "../../src/drawing-compiler/schemas/compiledDrawingPage.schema.js";
import {
  buildWallPlanLengthObservationsFromCompileResult,
  DIAGNOSTIC_OBSERVATION_CAP,
} from "../../src/scopes/framing/geometry/buildWallPlanLengthObservationsFromCompile.js";
import { emptySemanticMarkRecoveryBlock } from "../helpers/emptySemanticMarkRecoveryBlock.js";

function syntheticCompiledPage(emitCount: number): CompiledDrawingPage {
  const emitDimIds = Array.from({ length: emitCount }, (_, index) => `dim-${index}`);
  return {
    pdfPath: "tests/fixtures/synthetic.pdf",
    pageNumber: 1,
    pageWidth: 1000,
    pageHeight: 800,
    pageRole: {
      role: "plan",
      allowsWallPlanLengthEvidence: true,
      planHits: [],
      elevationHits: [],
      sectionHits: [],
      detailHits: [],
      rawItemCount: 0,
      method: "fixture",
    },
    text: { rawItemCount: 0, primitives: [], imperialCandidates: [] },
    geometry: {
      segmentCount: 0,
      faceCount: 0,
      pairCount: 0,
      physicalRunCount: emitCount,
      pbgRuns: [],
      rejectedRunCount: 0,
      dims: [],
      dimSourceCounts: { detected: 0, "near-high-seed": 0, "virtual-text": 0 },
    },
    transcriptions: [],
    ptPerFt: null,
    ownership: {
      associatedUnique: emitCount,
      ambiguous: 0,
      weakLength: 0,
      overallUniqueAndLengthOk: emitCount,
      overallLengthOkRate: 1,
      associations: emitDimIds.map((dimId, index) => ({
        dimId,
        roleGuess: "wall-plan-length",
        status: "assigned",
        runId: `run-${index}`,
        physicalRunKey: `physical-run:test:${index}`,
        orientation: "H" as const,
        uniquenessMargin: 1,
        parse: {
          status: "ok",
          originalText: "10'-0\"",
          feet: 10 + index,
        },
        candidateSource: "detected" as const,
      })),
    },
    governance: {
      pageRole: {
        role: "plan",
        allowsWallPlanLengthEvidence: true,
        planHits: [],
        elevationHits: [],
        sectionHits: [],
        detailHits: [],
        rawItemCount: 0,
        method: "fixture",
      },
      decisions: [],
      emitDimIds,
      scaleByDim: {},
      counts: {
        emit: emitCount,
        rejectPageRole: 0,
        rejectOwnership: 0,
        rejectVirtual: 0,
        rejectScale: 0,
        unresolvedScale: 0,
        passScale: emitCount,
      },
    },
    semanticBinding: {
      emitBindingIds: [],
      bindings: [],
      propagationOpportunities: [],
      ownershipAssociations: [],
    },
    semanticMarkRecovery: emptySemanticMarkRecoveryBlock,
    timingMs: { total: 1, transcription: 0 },
  };
}

describe("buildWallPlanLengthObservationsFromCompileResult", () => {
  it("emits all governed observations in production mode (no cap)", () => {
    const page = syntheticCompiledPage(10);
    const observations = buildWallPlanLengthObservationsFromCompileResult(page);
    assert.equal(observations.length, 10);
  });

  it("applies optional maxObservations for diagnostics only", () => {
    const page = syntheticCompiledPage(10);
    const observations = buildWallPlanLengthObservationsFromCompileResult(page, {
      maxObservations: DIAGNOSTIC_OBSERVATION_CAP,
    });
    assert.equal(observations.length, DIAGNOSTIC_OBSERVATION_CAP);
  });
});
