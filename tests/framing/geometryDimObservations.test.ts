import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { compiledDrawingPageSchema } from "../../src/compiler/schemas/compiledDrawingPage.schema.js";
import { buildGeometryDimObservationsFromCompiledPages } from "../../src/framing/geometry/buildGeometryDimObservations.js";
import {
  buildExtractionProjectContext,
  GEOMETRY_OBSERVATION_USAGE,
} from "../../src/framing/extract/buildExtractionProjectContext.js";
import {
  buildExtractionPreamble,
  buildSystemPrompt,
} from "../../src/framing/prompts/extractFramingEvidence.js";
import type { ExtractionPageBundle } from "../../src/pdf/ExtractionPageBundle.js";
import { emptySemanticMarkRecoveryBlock } from "../helpers/emptySemanticMarkRecoveryBlock.js";

function compiledPageWithFortyFootDim() {
  return compiledDrawingPageSchema.parse({
    pdfPath: "tests/fixtures/example.pdf",
    pageNumber: 3,
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
      rawItemCount: 1,
      primitives: [
        {
          id: "t-40",
          pageNumber: 3,
          rawText: "40'-0\"",
          bbox: { x0: 10, y0: 10, x1: 80, y1: 24 },
          orientation: "H",
          sourceAuthority: "localized-ocr",
          confidence: 0.9,
          parseStatus: "ok",
          parsedFeet: 40,
          provenance: {},
          mid: { x: 45, y: 17 },
        },
      ],
      imperialCandidates: [],
    },
    geometry: {
      segmentCount: 0,
      faceCount: 0,
      pairCount: 0,
      physicalRunCount: 0,
      pbgRuns: [],
      rejectedRunCount: 0,
      dims: [
        {
          id: "dim-40",
          candidateSource: "detected",
          orientation: "H",
          length: 480,
        },
      ],
      dimSourceCounts: { detected: 1, "near-high-seed": 0, "virtual-text": 0 },
    },
    transcriptions: [
      {
        dimId: "dim-40",
        authority: "localized-ocr",
        rawText: "40'-0\"",
        parsedFeet: 40,
        parseStatus: "ok",
        textPrimitiveId: "t-40",
        confidence: 0.9,
        rotationDeg: 0,
        cropPath: null,
        association: {
          normalDist: 1,
          axialOverlap: 1,
          method: "test",
        },
      },
    ],
    ptPerFt: 12,
    ownership: {
      associatedUnique: 0,
      ambiguous: 0,
      weakLength: 0,
      overallUniqueAndLengthOk: 0,
      overallLengthOkRate: null,
      associations: [
        {
          dimId: "dim-40",
          roleGuess: null,
          status: "associated",
          physicalRunKey: "physical-run:p3:fd528cc6dd9f",
          orientation: "H",
          ocrText: "40'-0\"",
          parse: {
            status: "ok",
            originalText: "40'-0\"",
            feet: 40,
          },
        },
      ],
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
    semanticMarkRecovery: emptySemanticMarkRecoveryBlock,
    timingMs: { total: 1, transcription: 0 },
  });
}

function floorBundle(): ExtractionPageBundle {
  return {
    bundleId: "test:floor",
    scopeName: "framing",
    intent: "floor-framing",
    regionId: "region:sheet:p3",
    identifiedSystems: ["floor-framing"],
    requiredInputs: ["joistLayoutLengthFeet"],
    orderedPageNumbers: [3],
    members: [
      {
        pageNumber: 3,
        role: "primary",
        visualDetailLevel: "full-page",
        sheetId: "S2.2",
        label: "Crawl",
        reason: "crawl framing sheet",
      },
    ],
    routingNotes: [],
    imageBudget: {
      maxImages: 4,
      estimatedImages: 1,
      tilesPerDetailedPage: 0,
    },
  };
}

describe("geometry dim observations", () => {
  it("emits a 40' observation from a compiled page without minting layout length", () => {
    const observations = buildGeometryDimObservationsFromCompiledPages([
      compiledPageWithFortyFootDim(),
    ]);
    assert.equal(observations.length, 1);
    assert.equal(observations[0]?.parsedFeet, 40);
    assert.equal(observations[0]?.orientation, "H");
    assert.equal(observations[0]?.pageNumber, 3);
    assert.equal(
      observations[0]?.associatedRunKey,
      "physical-run:p3:fd528cc6dd9f",
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(observations[0], "joistLayoutLengthFeet"),
      false,
    );
  });

  it("slices observations into floor extraction context as location hints, not layout Evidence", () => {
    const observations = buildGeometryDimObservationsFromCompiledPages([
      compiledPageWithFortyFootDim(),
    ]);
    const bundle = floorBundle();
    const context = buildExtractionProjectContext({
      intent: "floor-framing",
      bundle,
      dictionary: null,
      compiledPages: [],
      buildingAssemblies: { assemblyNames: [], notes: [] },
      geometryObservations: observations,
    });
    assert.equal(context.geometryObservations.length, 1);
    assert.equal(context.geometryObservations[0]?.parsedFeet, 40);
    assert.equal(
      context.geometryObservations[0]?.associatedRunKey,
      "physical-run:p3:fd528cc6dd9f",
    );
    assert.equal(context.geometryObservationUsage, GEOMETRY_OBSERVATION_USAGE);
    assert.match(GEOMETRY_OBSERVATION_USAGE, /location hint/);
    assert.match(GEOMETRY_OBSERVATION_USAGE, /not exclusive wall ownership/);
    assert.equal(
      context.geometryObservations.some((entry) =>
        entry.id.toLowerCase().includes("joist"),
      ),
      false,
    );

    const preamble = buildExtractionPreamble(
      { assemblyNames: [], notes: [] },
      bundle,
      context,
    );
    assert.match(preamble, /associatedRunKey is a location hint/);
    assert.match(preamble, /not exclusive wall ownership/);
    assert.match(preamble, /physical-run:p3:fd528cc6dd9f/);
    assert.equal(preamble.includes("joistLayoutLengthFeet=40"), false);
  });

  it("keeps competing 40 and 50.67 observations without minting a layout winner", () => {
    const forty = compiledPageWithFortyFootDim();
    const competing = compiledDrawingPageSchema.parse({
      ...forty,
      geometry: {
        ...forty.geometry,
        dims: [
          ...forty.geometry.dims,
          {
            id: "dim-50",
            candidateSource: "detected",
            orientation: "H",
            length: 608,
          },
        ],
        dimSourceCounts: { detected: 2, "near-high-seed": 0, "virtual-text": 0 },
      },
      text: {
        ...forty.text,
        primitives: [
          ...forty.text.primitives,
          {
            id: "t-50",
            pageNumber: 3,
            rawText: "50'-8\"",
            bbox: { x0: 200, y0: 10, x1: 280, y1: 24 },
            orientation: "H",
            sourceAuthority: "localized-ocr",
            confidence: 0.9,
            parseStatus: "ok",
            parsedFeet: 50.6667,
            provenance: {},
            mid: { x: 240, y: 17 },
          },
        ],
      },
      transcriptions: [
        ...forty.transcriptions,
        {
          dimId: "dim-50",
          authority: "localized-ocr",
          rawText: "50'-8\"",
          parsedFeet: 50.6667,
          parseStatus: "ok",
          textPrimitiveId: "t-50",
          confidence: 0.9,
          rotationDeg: 0,
          cropPath: null,
          association: {
            normalDist: 1,
            axialOverlap: 1,
            method: "test",
          },
        },
      ],
      ownership: {
        ...forty.ownership,
        associations: [
          ...forty.ownership.associations,
          {
            dimId: "dim-50",
            roleGuess: null,
            status: "associated",
            physicalRunKey: "physical-run:p3:other-run",
            orientation: "H",
            ocrText: "50'-8\"",
            parse: {
              status: "ok",
              originalText: "50'-8\"",
              feet: 50.6667,
            },
          },
        ],
      },
    });

    const observations = buildGeometryDimObservationsFromCompiledPages([
      competing,
    ]);
    assert.equal(observations.length, 2);
    const feet = observations.map((entry) => entry.parsedFeet).sort((a, b) => a - b);
    assert.equal(feet[0], 40);
    assert.ok(Math.abs((feet[1] ?? 0) - 50.6667) < 0.01);
    assert.equal(
      observations.some((entry) =>
        Object.prototype.hasOwnProperty.call(entry, "joistLayoutLengthFeet"),
      ),
      false,
    );
  });

  it("system prompt forbids unique-dim layout copy and exclusive-run ownership", () => {
    const system = buildSystemPrompt("");
    assert.match(system, /associatedRunKey is a location hint/);
    assert.match(system, /not exclusive wall ownership/);
    assert.match(system, /40'-0" vs 50'-8"/);
    assert.match(system, /only remaining dim/);
  });
});
