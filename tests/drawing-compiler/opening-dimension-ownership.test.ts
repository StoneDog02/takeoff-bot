import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyParentRunDimensionExclusivity,
  governOpeningDimensionOwnership,
} from "../../src/scopes/framing/geometry/governOpeningDimensionOwnership.js";
import type { OpeningGapCandidate } from "../../src/scopes/framing/geometry/openingGovernanceTypes.js";
import type { CompiledDrawingPage } from "../../src/drawing-compiler/schemas/compiledDrawingPage.schema.js";
import type { PhysicalWallRunRecord } from "../../src/drawing-compiler/schemas/physicalWallRun.schema.js";

function basePage(
  run: PhysicalWallRunRecord,
  textPrimitives: CompiledDrawingPage["text"]["primitives"] = [],
): CompiledDrawingPage {
  return {
    pdfPath: "test.pdf",
    pageNumber: 4,
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
      method: "test",
    },
    text: {
      rawItemCount: textPrimitives.length,
      primitives: textPrimitives,
      imperialCandidates: textPrimitives,
    },
    geometry: {
      segmentCount: 0,
      faceCount: 0,
      pairCount: 0,
      physicalRunCount: 1,
      pbgRuns: [run],
      rejectedRunCount: 0,
      dims: [],
      dimSourceCounts: { detected: 0, "near-high-seed": 0, "virtual-text": 0 },
    },
    transcriptions: [],
    ptPerFt: 18,
    ownership: {
      associatedUnique: 0,
      ambiguous: 0,
      weakLength: 0,
      overallUniqueAndLengthOk: 0,
      overallLengthOkRate: null,
      associations: [],
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
        method: "test",
      },
      decisions: [],
      emitDimIds: [],
      scaleByDim: {},
      counts: {
        emit: 0,
        rejectPageRole: 0,
        rejectOwnership: 0,
        rejectVirtual: 0,
        rejectScale: 0,
        unresolvedScale: 0,
        passScale: 0,
      },
    },
    semanticBinding: {
      emitBindingIds: [],
      bindings: [],
      propagationOpportunities: [],
      ownershipAssociations: [],
    },
    semanticMarkRecovery: {
      observations: [],
      metrics: {
        typeIdentifierRecovered: 0,
        markRecoveryFailures: 0,
      },
      emitBindingIds: [],
    },
    timingMs: { total: 0, transcription: 0 },
  };
}

const run: PhysicalWallRunRecord = {
  id: "run-1",
  physicalRunKey: "physical-run:p4:test",
  pageNumber: 4,
  orientation: "H",
  sourceCandidateIds: [],
  faceSegmentIds: [],
  thicknessPt: 4,
  centerline: { x1: 100, y1: 200, x2: 800, y2: 200 },
  endpoints: [{ x: 100, y: 200 }, { x: 800, y: 200 }],
  lengthPt: 700,
  mid: { x: 450, y: 200 },
  openingGapSuspects: [{ along: "H", gapPt: 48, at: { x: 450, y: 200 } }],
  junctions: [],
  connectedRunIds: [],
  wallAuthority: "high",
  authorityScore: 10,
  authorityReasons: [],
};

const candidate: OpeningGapCandidate = {
  openingSubjectKey: "opening:p4:physical-run:p4:test:gap0",
  pageNumber: 4,
  physicalRunKey: "physical-run:p4:test",
  gapIndex: 0,
  gapAt: { x: 450, y: 200 },
  gapPt: 48,
  runOrientation: "H",
  runLengthPt: 700,
  wallAuthority: "high",
};

describe("governOpeningDimensionOwnership", () => {
  it("establishes width when one co-located dimension text exists", () => {
    const page = basePage(run, [
      {
        id: "t-1",
        pageNumber: 4,
        rawText: "18'-8\"",
        bbox: { x0: 440, y0: 180, x1: 460, y1: 190 },
        orientation: "H",
        sourceAuthority: "localized-ocr",
        confidence: 0.9,
        parseStatus: "ok",
        parsedFeet: 18.6667,
        provenance: {},
        mid: { x: 450, y: 185 },
      },
    ]);

    const result = governOpeningDimensionOwnership(page, run, candidate);
    assert.equal(result.status, "ESTABLISHED");
    assert.ok(result.roughWidthFeet != null);
  });

  it("returns unresolved when no dimension is co-located", () => {
    const page = basePage(run, []);
    const result = governOpeningDimensionOwnership(page, run, candidate);
    assert.equal(result.status, "UNRESOLVED");
    assert.equal(result.roughWidthFeet, null);
  });

  it("returns ambiguous when multiple dimensions compete", () => {
    const page = basePage(run, [
      {
        id: "t-1",
        pageNumber: 4,
        rawText: "3'-0\"",
        bbox: { x0: 440, y0: 180, x1: 460, y1: 190 },
        orientation: "H",
        sourceAuthority: "localized-ocr",
        confidence: 0.9,
        parseStatus: "ok",
        parsedFeet: 3,
        provenance: {},
        mid: { x: 448, y: 185 },
      },
      {
        id: "t-2",
        pageNumber: 4,
        rawText: "5'-0\"",
        bbox: { x0: 452, y0: 180, x1: 472, y1: 190 },
        orientation: "H",
        sourceAuthority: "localized-ocr",
        confidence: 0.9,
        parseStatus: "ok",
        parsedFeet: 5,
        provenance: {},
        mid: { x: 451, y: 185 },
      },
    ]);

    const result = governOpeningDimensionOwnership(page, run, candidate);
    assert.equal(result.status, "AMBIGUOUS");
    assert.equal(result.roughWidthFeet, null);
  });

  it("enforces parent-run exclusivity when the same dim ESTABLISHES on two gaps", () => {
    const sharedDim = {
      id: "t-shared",
      pageNumber: 4,
      rawText: "2'-1\"",
      bbox: { x0: 440, y0: 180, x1: 460, y1: 190 },
      orientation: "H" as const,
      sourceAuthority: "localized-ocr" as const,
      confidence: 0.9,
      parseStatus: "ok" as const,
      parsedFeet: 2.0833,
      provenance: {},
      mid: { x: 450, y: 185 },
    };
    const page = basePage(run, [sharedDim]);
    const gap0: OpeningGapCandidate = {
      ...candidate,
      openingSubjectKey: "opening:p4:physical-run:p4:test:gap0",
      gapIndex: 0,
      gapAt: { x: 450, y: 200 },
      gapPt: 48,
    };
    const gap1: OpeningGapCandidate = {
      ...candidate,
      openingSubjectKey: "opening:p4:physical-run:p4:test:gap1",
      gapIndex: 1,
      gapAt: { x: 480, y: 200 },
      gapPt: 22,
    };

    const ownership0 = governOpeningDimensionOwnership(page, run, gap0);
    const ownership1 = governOpeningDimensionOwnership(page, run, gap1);
    assert.equal(ownership0.status, "ESTABLISHED");
    assert.equal(ownership1.status, "ESTABLISHED");

    const exclusive = applyParentRunDimensionExclusivity(
      [
        { candidate: gap0, ownership: ownership0 },
        { candidate: gap1, ownership: ownership1 },
      ],
      run,
      18,
    );

    const established = exclusive.filter((r) => r.status === "ESTABLISHED");
    const ambiguous = exclusive.filter((r) => r.status === "AMBIGUOUS");
    assert.equal(established.length, 1);
    assert.equal(ambiguous.length, 1);
    assert.ok(
      ambiguous[0]!.notes.some((n) => n.includes("Dimension exclusivity")),
    );
  });
});
