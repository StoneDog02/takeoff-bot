import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { CompiledDrawingPage } from "../../src/compiler/schemas/compiledDrawingPage.schema.js";
import type { PhysicalWallRunRecord } from "../../src/compiler/schemas/physicalWallRun.schema.js";
import { evidenceSchema } from "../../src/core/schemas/evidence.schema.js";
import { mergeIdentifiedOpeningParentsFromCompiledPages } from "../../src/framing/geometry/mergeIdentifiedOpeningParentsFromCompiledPages.js";
import { buildFramingConstructionFromEvidence } from "../../src/framing/read/readFramingPlans.js";

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

function makeRun(
  gaps: PhysicalWallRunRecord["openingGapSuspects"],
): PhysicalWallRunRecord {
  return {
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
    openingGapSuspects: gaps,
    junctions: [],
    connectedRunIds: [],
    wallAuthority: "high",
    authorityScore: 10,
    authorityReasons: [],
  };
}

function textPrimitive(
  id: string,
  rawText: string,
  mid: { x: number; y: number },
  parsedFeet: number | null = null,
): CompiledDrawingPage["text"]["primitives"][number] {
  return {
    id,
    pageNumber: 4,
    rawText,
    bbox: { x0: mid.x - 10, y0: mid.y - 5, x1: mid.x + 10, y1: mid.y + 5 },
    orientation: "H",
    sourceAuthority: "pdf-text-layer",
    confidence: 1,
    parseStatus: parsedFeet == null ? "unresolved" : "ok",
    parsedFeet,
    provenance: {},
    mid,
  };
}

function openingCategoryEvidence(
  subjectKey: string,
  originalText: string,
  id = `E-${subjectKey.replace(/[^A-Za-z0-9._:-]/g, "-")}-CATEGORY`,
) {
  return evidenceSchema.parse({
    id,
    type: "callout",
    relationship: "supports",
    description: "Identified opening category",
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
      elementLabel: originalText,
      detailNumber: null,
      sectionNumber: null,
      scheduleName: null,
      noteReference: null,
    },
    originalText,
    references: [],
    subjectKind: "opening",
    subjectKey,
    propertyPath: "category",
    candidateValue: "door",
  });
}

describe("mergeIdentifiedOpeningParentsFromCompiledPages", () => {
  it("attaches ESTABLISHED unique mark ownership onto one identified opening without inventing quantity", () => {
    const run = makeRun([{ along: "H", gapPt: 54, at: { x: 100, y: 200 } }]);
    const page = basePage(run, [
      textPrimitive("t-3068", "3068", { x: 100, y: 220 }),
      textPrimitive("t-dim", `3'-0"`, { x: 100, y: 240 }, 3),
    ]);
    const identified = openingCategoryEvidence("3068 DOOR - DINING", "3068");

    const merged = mergeIdentifiedOpeningParentsFromCompiledPages({
      evidence: [identified],
      pages: [page],
    });

    assert.equal(merged.audit.uniqueAttachments, 1);
    assert.equal(merged.attachments[0]?.identifiedSubjectKey, "3068 DOOR - DINING");
    assert.equal(
      merged.attachments[0]?.parentPhysicalRunKey,
      "physical-run:p4:test",
    );
    assert.equal(merged.attachments[0]?.roughWidthFeet, 3);
    assert.equal(
      merged.evidence.some((record) => record.propertyPath === "quantity"),
      false,
    );

    const construction = buildFramingConstructionFromEvidence(merged.evidence);
    const opening = construction.openings.openings.find(
      (entry) => entry.id === "O-3068-DOOR---DINING",
    );
    assert.ok(opening);
    assert.equal(opening.parentWallId, "physical-run:p4:test");
    assert.equal(opening.parentObjectId, "WS-physical-run:p4:test");
    assert.equal(opening.quantity, null);
    assert.equal(opening.dimensions.roughWidthFeet, 3);
    assert.equal(opening.dimensions.nominalWidthFeet, null);
  });

  it("fails closed when one mark matches two identified openings", () => {
    const run = makeRun([{ along: "H", gapPt: 54, at: { x: 100, y: 200 } }]);
    const page = basePage(run, [
      textPrimitive("t-3068", "3068", { x: 100, y: 220 }),
    ]);

    const merged = mergeIdentifiedOpeningParentsFromCompiledPages({
      evidence: [
        openingCategoryEvidence("3068 DOOR - DINING", "3068", "E-DINING"),
        openingCategoryEvidence("3068 DOOR - FOYER", "3068", "E-FOYER"),
      ],
      pages: [page],
    });

    assert.equal(merged.audit.uniqueAttachments, 0);
    assert.equal(merged.attachments.length, 0);
    const construction = buildFramingConstructionFromEvidence(merged.evidence);
    assert.equal(
      construction.openings.openings.every((opening) => opening.parentWallId === null),
      true,
    );
  });
});
