import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { CompiledDrawingPage } from "../../src/compiler/schemas/compiledDrawingPage.schema.js";
import type { PhysicalWallRunRecord } from "../../src/compiler/schemas/physicalWallRun.schema.js";
import {
  applyParentRunMarkExclusivity,
  governOpeningMarkOwnership,
} from "../../src/framing/geometry/governOpeningMarkOwnership.js";
import type { OpeningGapCandidate } from "../../src/framing/geometry/openingGovernanceTypes.js";
import {
  buildOpeningEvidenceWithMarkOwnership,
  shouldPromoteOpeningToDomain,
} from "../../src/framing/geometry/buildOpeningEvidenceFromCompiledPages.js";
import { adoptOpeningSemanticEvidenceOntoGeometry } from "../../src/framing/geometry/adoptOpeningSemanticEvidenceOntoGeometry.js";
import {
  hasExplicitPrintedOpeningDimensions,
  isMarkDecodedOpeningDimensionEvidence,
  isOpeningTypeMarkText,
  literalOpeningCategoryFromText,
  openingMarkKeysCompatible,
} from "../../src/framing/geometry/openingMarkText.js";
import { evidenceSchema } from "../../src/core/schemas/evidence.schema.js";
import { resolveOpenings } from "../../src/framing/resolve/resolveOpenings.js";

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
      imperialCandidates: [],
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
  centerline: { x1: 0, y1: 200, x2: 720, y2: 200 },
  endpoints: [
    { x: 0, y: 200 },
    { x: 720, y: 200 },
  ],
  lengthPt: 720,
  mid: { x: 360, y: 200 },
  openingGapSuspects: [
    { along: "H", gapPt: 54, at: { x: 100, y: 200 } },
    { along: "H", gapPt: 54, at: { x: 400, y: 200 } },
  ],
  junctions: [],
  connectedRunIds: [],
  wallAuthority: "high",
  authorityScore: 10,
  authorityReasons: [],
};

function gapCandidate(gapIndex: number): OpeningGapCandidate {
  const gap = run.openingGapSuspects[gapIndex]!;
  return {
    openingSubjectKey: `opening:p4:${run.physicalRunKey}:gap${gapIndex}`,
    pageNumber: 4,
    physicalRunKey: run.physicalRunKey,
    gapIndex,
    gapAt: gap.at,
    gapPt: gap.gapPt,
    runOrientation: "H",
    runLengthPt: run.lengthPt,
    wallAuthority: "high",
  };
}

function textPrimitive(
  id: string,
  rawText: string,
  mid: { x: number; y: number },
): CompiledDrawingPage["text"]["primitives"][number] {
  return {
    id,
    pageNumber: 4,
    rawText,
    bbox: { x0: mid.x - 10, y0: mid.y - 5, x1: mid.x + 10, y1: mid.y + 5 },
    orientation: "H",
    sourceAuthority: "pdf-text-layer",
    confidence: 1,
    parseStatus: "unresolved",
    parsedFeet: null,
    provenance: {},
    mid,
  };
}

function openingEvidence(input: {
  id: string;
  subjectKey: string;
  propertyPath: string;
  candidateValue: string | number;
  originalText: string;
  type?: "callout" | "dimension" | "note";
}) {
  return evidenceSchema.parse({
    id: input.id,
    type: input.type ?? "callout",
    relationship: "supports",
    description: "test",
    source: {
      page: {
        documentId: null,
        pageNumber: 4,
        sheetId: null,
        sheetTitle: null,
        pageLabel: null,
        revision: null,
      },
      region: null,
      tileId: null,
      elementLabel: input.subjectKey,
      detailNumber: null,
      sectionNumber: null,
      scheduleName: null,
      noteReference: null,
    },
    originalText: input.originalText,
    references: [],
    subjectKind: "opening",
    subjectKey: input.subjectKey,
    propertyPath: input.propertyPath,
    candidateValue: input.candidateValue,
  });
}

describe("openingMarkText", () => {
  it("classifies literal labels and type marks without size decode", () => {
    assert.equal(literalOpeningCategoryFromText("DOOR"), "door");
    assert.equal(literalOpeningCategoryFromText("WINDOW"), "window");
    assert.equal(literalOpeningCategoryFromText("GARAGE DOOR"), "garage-door");
    assert.equal(literalOpeningCategoryFromText("3068"), null);
    assert.equal(isOpeningTypeMarkText("3068"), true);
    assert.equal(isOpeningTypeMarkText("#5050 S.V."), true);
    assert.equal(isOpeningTypeMarkText("30/8"), true);
    assert.equal(isOpeningTypeMarkText(`18'x8' GARAGE DOOR`), false);
    assert.equal(hasExplicitPrintedOpeningDimensions(`18'x8' GARAGE DOOR`), true);
    assert.equal(openingMarkKeysCompatible("3068", "3068-DINING"), true);
    assert.equal(openingMarkKeysCompatible("3068", "2668-CLOSET"), false);
  });

  it("flags mark-decoded dimension Evidence", () => {
    assert.equal(
      isMarkDecodedOpeningDimensionEvidence({
        propertyPath: "dimensions.nominalWidthFeet",
        originalText: "3068",
        candidateValue: 3,
      }),
      true,
    );
    assert.equal(
      isMarkDecodedOpeningDimensionEvidence({
        propertyPath: "dimensions.nominalWidthFeet",
        originalText: "30/8 door mark at Dining",
        candidateValue: 3,
      }),
      true,
    );
    assert.equal(
      isMarkDecodedOpeningDimensionEvidence({
        propertyPath: "dimensions.nominalWidthFeet",
        originalText: `18'x8' GARAGE DOOR`,
        candidateValue: 18,
      }),
      false,
    );
    assert.equal(
      isMarkDecodedOpeningDimensionEvidence({
        propertyPath: "dimensions.roughWidthFeet",
        originalText: `2'-1"`,
        candidateValue: 2.0833,
      }),
      false,
    );
  });
});

describe("governOpeningMarkOwnership", () => {
  it("ESTABLISHES unique DOOR label near gap and emits category on geometry", () => {
    const page = basePage(run, [
      textPrimitive("t-door", "DOOR", { x: 105, y: 220 }),
    ]);
    const ownership = governOpeningMarkOwnership(page, run, gapCandidate(0));
    assert.equal(ownership.status, "ESTABLISHED");
    assert.equal(ownership.literalCategory, "door");
    assert.equal(ownership.markText, "DOOR");

    const build = buildOpeningEvidenceWithMarkOwnership([page]);
    // Need AMBIGUOUS dim or material-authoritative to promote — add a dim for promotion.
    // Without dims, UNRESOLVED won't promote. Seed AMBIGUOUS via two dims in a sibling test page
    // that still has the DOOR label — use shouldPromote after discover by adding fake AMBIGUOUS path:
    // Promote by placing an imperial dim co-located so ESTABLISHED material path works.
    const pageWithDim = basePage(
      {
        ...run,
        openingGapSuspects: [run.openingGapSuspects[0]!],
      },
      [
        textPrimitive("t-door", "DOOR", { x: 105, y: 220 }),
        {
          ...textPrimitive("t-dim", `3'-0"`, { x: 100, y: 240 }),
          parseStatus: "ok" as const,
          parsedFeet: 3,
        },
      ],
    );
    const withDim = buildOpeningEvidenceWithMarkOwnership([pageWithDim]);
    const category = withDim.evidence.find(
      (e) =>
        e.propertyPath === "category" &&
        e.subjectKey.includes("gap0") &&
        e.candidateValue === "door",
    );
    assert.ok(category, "expected non-unknown category on geometry subject");
    assert.match(category.description, /ESTABLISHED mark\/label ownership/);
    assert.equal(withDim.ownedMarks.length, 1);
    assert.equal(withDim.ownedMarks[0]?.markText, "DOOR");
  });

  it("marks AMBIGUOUS when two labels compete for one gap", () => {
    const page = basePage(run, [
      textPrimitive("t-door", "DOOR", { x: 100, y: 220 }),
      textPrimitive("t-win", "WINDOW", { x: 110, y: 230 }),
    ]);
    const ownership = governOpeningMarkOwnership(page, run, gapCandidate(0));
    assert.equal(ownership.status, "AMBIGUOUS");
    assert.equal(ownership.literalCategory, null);
  });

  it("applies per-run exclusivity so one mark owns at most one gap", () => {
    const page = basePage(run, [
      textPrimitive("t-shared", "DOOR", { x: 250, y: 220 }),
    ]);
    // Place mark axially between gaps so both could claim within 200pt
    const entries = [0, 1].map((gapIndex) => ({
      candidate: gapCandidate(gapIndex),
      ownership: governOpeningMarkOwnership(page, run, gapCandidate(gapIndex)),
    }));
    // Force both ESTABLISHED before exclusivity by using marks near each gap with same primitive id pattern
    const nearBoth = [
      {
        candidate: gapCandidate(0),
        ownership: governOpeningMarkOwnership(
          basePage(run, [textPrimitive("t-shared", "DOOR", { x: 100, y: 220 })]),
          run,
          gapCandidate(0),
        ),
      },
      {
        candidate: gapCandidate(1),
        ownership: governOpeningMarkOwnership(
          basePage(run, [textPrimitive("t-shared", "DOOR", { x: 400, y: 220 })]),
          run,
          gapCandidate(1),
        ),
      },
    ];
    // Same textPrimitiveId across entries → exclusivity demotes one
    nearBoth[1]!.ownership = {
      ...nearBoth[1]!.ownership,
      textPrimitiveId: nearBoth[0]!.ownership.textPrimitiveId,
      status: "ESTABLISHED",
      markText: "DOOR",
      literalCategory: "door",
      matchScore: (nearBoth[0]!.ownership.matchScore ?? 0) + 10,
    };
    const exclusive = applyParentRunMarkExclusivity(nearBoth);
    const established = exclusive.filter((o) => o.status === "ESTABLISHED");
    const ambiguous = exclusive.filter((o) => o.status === "AMBIGUOUS");
    assert.equal(established.length, 1);
    assert.equal(ambiguous.length, 1);
    void entries;
  });
});

describe("adoptOpeningSemanticEvidenceOntoGeometry", () => {
  it("remints Claude category onto geometry when mark ownership ESTABLISHED", () => {
    const geometrySubject = "opening:p4:physical-run:p4:test:gap0";
    const claudeCategory = openingEvidence({
      id: "E-3068-DINING-CATEGORY",
      subjectKey: "3068-DINING",
      propertyPath: "category",
      candidateValue: "door",
      originalText: "3068",
    });
    const geometryHost = openingEvidence({
      id: "E-geo-host",
      subjectKey: geometrySubject,
      propertyPath: "parentPhysicalRunKey",
      candidateValue: "physical-run:p4:test",
      originalText: "gap",
      type: "note",
    });

    const result = adoptOpeningSemanticEvidenceOntoGeometry({
      evidence: [claudeCategory, geometryHost],
      ownedMarks: [
        {
          geometrySubjectKey: geometrySubject,
          pageNumber: 4,
          markText: "3068",
          textPrimitiveId: "t-3068",
          literalCategory: null,
        },
      ],
    });

    assert.equal(result.remintedCount, 1);
    assert.deepEqual(result.adoptedSemanticSubjectKeys, ["3068-DINING"]);
    const adopted = result.evidence.find(
      (e) =>
        e.subjectKey === geometrySubject &&
        e.propertyPath === "category" &&
        e.candidateValue === "door",
    );
    assert.ok(adopted);
    assert.match(adopted.description, /ESTABLISHED mark ownership/);
    assert.equal(
      result.evidence.some((e) => e.subjectKey === "3068-DINING"),
      false,
      "semantic duplicate cluster should be dropped after adopt",
    );
  });

  it("does not adopt via tile proximity without mark token match", () => {
    const geometrySubject = "opening:p4:physical-run:p4:test:gap0";
    const claudeCategory = openingEvidence({
      id: "E-OTHER",
      subjectKey: "2668-CLOSET",
      propertyPath: "category",
      candidateValue: "door",
      originalText: "2668",
    });
    const result = adoptOpeningSemanticEvidenceOntoGeometry({
      evidence: [claudeCategory],
      ownedMarks: [
        {
          geometrySubjectKey: geometrySubject,
          pageNumber: 4,
          markText: "3068",
          textPrimitiveId: "t-3068",
          literalCategory: null,
        },
      ],
    });
    assert.equal(result.remintedCount, 0);
    assert.equal(result.evidence[0]?.subjectKey, "2668-CLOSET");
  });
});

describe("resolveOpenings mark-decode rejection", () => {
  it("does not resolve dimensions from bare type-mark Evidence", () => {
    const payload = resolveOpenings([
      openingEvidence({
        id: "E-CAT",
        subjectKey: "3068-DINING",
        propertyPath: "category",
        candidateValue: "door",
        originalText: "3068",
      }),
      openingEvidence({
        id: "E-W",
        subjectKey: "3068-DINING",
        propertyPath: "dimensions.nominalWidthFeet",
        candidateValue: 3,
        originalText: "3068",
        type: "dimension",
      }),
      openingEvidence({
        id: "E-H",
        subjectKey: "3068-DINING",
        propertyPath: "dimensions.nominalHeightFeet",
        candidateValue: 6.67,
        originalText: "30/8 door mark at Dining",
        type: "dimension",
      }),
    ]);

    const opening = payload.openings.find((o) => o.id === "O-3068-DINING");
    assert.ok(opening);
    assert.equal(opening.category, "door");
    assert.equal(opening.dimensions.nominalWidthFeet, null);
    assert.equal(opening.dimensions.nominalHeightFeet, null);
  });

  it("still resolves explicit printed W×H dimensions", () => {
    const payload = resolveOpenings([
      openingEvidence({
        id: "E-CAT",
        subjectKey: "18X8-GARAGE-DOOR",
        propertyPath: "category",
        candidateValue: "garage-door",
        originalText: `18'x8' GARAGE DOOR`,
      }),
      openingEvidence({
        id: "E-W",
        subjectKey: "18X8-GARAGE-DOOR",
        propertyPath: "dimensions.nominalWidthFeet",
        candidateValue: 18,
        originalText: `18'x8' GARAGE DOOR`,
        type: "dimension",
      }),
      openingEvidence({
        id: "E-H",
        subjectKey: "18X8-GARAGE-DOOR",
        propertyPath: "dimensions.nominalHeightFeet",
        candidateValue: 8,
        originalText: `18'x8' GARAGE DOOR`,
        type: "dimension",
      }),
    ]);

    const opening = payload.openings.find((o) => o.id === "O-18X8-GARAGE-DOOR");
    assert.ok(opening);
    assert.equal(opening.dimensions.nominalWidthFeet, 18);
    assert.equal(opening.dimensions.nominalHeightFeet, 8);
  });
});

describe("shouldPromoteOpeningToDomain still works with markOwnership", () => {
  it("keeps review-tier promotion", () => {
    assert.equal(
      shouldPromoteOpeningToDomain({
        openingSubjectKey: "opening:p4:physical-run:p4:test:gap0",
        pageNumber: 4,
        physicalRunKey: "physical-run:p4:test",
        gapIndex: 0,
        gapAt: { x: 100, y: 200 },
        gapPt: 48,
        runOrientation: "H",
        runLengthPt: 700,
        wallAuthority: "high",
        category: "unknown",
        physicalRunOwnership: {
          status: "ESTABLISHED",
          parentPhysicalRunKey: "physical-run:p4:test",
          positionOffsetFeetFromSegmentStart: 4,
          notes: [],
        },
        dimensionOwnership: {
          status: "AMBIGUOUS",
          roughWidthFeet: null,
          nominalWidthFeet: null,
          dimId: null,
          textPrimitiveId: null,
          originalText: null,
          matchScore: null,
          notes: [],
        },
        markOwnership: {
          status: "UNRESOLVED",
          markText: null,
          textPrimitiveId: null,
          literalCategory: null,
          matchScore: null,
          notes: [],
        },
        materialAuthoritative: false,
      }),
      true,
    );
  });
});
