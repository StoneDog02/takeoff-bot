import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evidenceSchema, type Evidence } from "../../src/core/schemas/evidence.schema.js";
import { calculateFramingTakeoff } from "../../src/framing/calculate/calculateFramingTakeoff.js";
import {
  buildExtractionProjectContext,
  GEOMETRY_OBSERVATION_USAGE,
} from "../../src/framing/extract/buildExtractionProjectContext.js";
import {
  buildExtractionPreamble,
  buildSystemPrompt,
} from "../../src/framing/prompts/extractFramingEvidence.js";
import { resolveFloorFraming } from "../../src/framing/resolve/resolveFloorFraming.js";
import { emptyFramingConstruction } from "../../src/framing/schemas/framingConstruction.schema.js";
import type { ExtractionPageBundle } from "../../src/pdf/ExtractionPageBundle.js";
import type { GeometryDimObservation } from "../../src/framing/geometry/geometryDimObservation.js";
import {
  BECKSTEAD_M5_CRAWL_JOIST_COUNT,
  BECKSTEAD_M5_CRAWL_JOIST_LF,
  buildBecksteadM5CrawlSpaceFloorEvidence,
} from "../fixtures/becksteadM5FloorLayoutEvidence.js";

const CRAWL_RUN_KEY = "physical-run:p3:fd528cc6dd9f";
const CRAWL_SPACING_AXIS_NOTES = [
  'CRAWL SPACE: 11.7/8" TJI 210 @ 16" O.C. MAX. SPAN = 17\'-0"',
  "FLOOR JOISTS SPAN N-S",
];

function crawlFloorBundle(): ExtractionPageBundle {
  return {
    bundleId: "bundle:framing:floor-framing:p3-1",
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

function fortyFootObservation(): GeometryDimObservation {
  return {
    id: "geo-dim:p3:ds-2",
    pageNumber: 3,
    parsedFeet: 40,
    orientation: "H",
    bbox: null,
    associatedRunKey: CRAWL_RUN_KEY,
    nearbyText: ["CRAWL SPACE"],
    rawText: "40'-0\"",
  };
}

function fiftyEightObservation(): GeometryDimObservation {
  return {
    id: "geo-dim:p3:ds-50",
    pageNumber: 3,
    parsedFeet: 50.67,
    orientation: "H",
    bbox: null,
    associatedRunKey: "physical-run:p3:other-run",
    nearbyText: [],
    rawText: "50'-8\"",
  };
}

function crawlEvidenceWithoutLayout(): Evidence[] {
  return buildBecksteadM5CrawlSpaceFloorEvidence().filter(
    (record) => record.propertyPath !== "joistLayoutLengthFeet",
  );
}

function crawlLayoutFortyEvidence(): Evidence {
  const record = buildBecksteadM5CrawlSpaceFloorEvidence().find(
    (entry) => entry.propertyPath === "joistLayoutLengthFeet",
  );
  assert.ok(record);
  return record;
}

/**
 * Frozen extract stand-in for Claude following extractFramingEvidence layout
 * rules. Not unique-dim TypeScript: production never copies
 * observation.parsedFeet onto joistLayoutLengthFeet. This mock emits the
 * frozen 40' crawl layout Evidence only when notes establish the spacing
 * axis and a prepared 40' observation is present without a competing 50.67.
 */
function mockExtractCrawlLayoutFromPreparedGeometry(input: {
  notes: readonly string[];
  pageText: string;
  observations: readonly GeometryDimObservation[];
}): { evidence: Evidence[] } {
  const notes = input.notes.join("\n");
  const text = `${notes}\n${input.pageText}`;
  const hasForty = input.observations.some((entry) => entry.parsedFeet === 40);
  const hasCompetingFifty = input.observations.some(
    (entry) => Math.abs(entry.parsedFeet - 50.67) < 0.02,
  );
  const crawlNotesEstablishSpacingAxis =
    /TJI 210/i.test(text) && /16"\s*O\.C/i.test(text);

  const evidence = crawlEvidenceWithoutLayout();
  if (crawlNotesEstablishSpacingAxis && hasForty && !hasCompetingFifty) {
    evidence.push(crawlLayoutFortyEvidence());
  }
  return { evidence };
}

describe("extractFramingEvidence crawl layout from prepared geometry", () => {
  it("tells the region read that associatedRunKey is a location hint, not exclusive wall ownership", () => {
    const bundle = crawlFloorBundle();
    const context = buildExtractionProjectContext({
      intent: "floor-framing",
      bundle,
      dictionary: null,
      compiledPages: [],
      buildingAssemblies: { assemblyNames: [], notes: CRAWL_SPACING_AXIS_NOTES },
      geometryObservations: [fortyFootObservation()],
    });
    const preamble = buildExtractionPreamble(
      { assemblyNames: [], notes: CRAWL_SPACING_AXIS_NOTES },
      bundle,
      context,
    );
    const system = buildSystemPrompt("");

    assert.equal(context.geometryObservationUsage, GEOMETRY_OBSERVATION_USAGE);
    assert.match(preamble, /associatedRunKey is a location hint/);
    assert.match(preamble, /not exclusive wall ownership/);
    assert.match(preamble, /physical-run:p3:fd528cc6dd9f/);
    assert.match(preamble, /40'-0\\"/);
    assert.match(preamble, /"parsedFeet": 40/);
    assert.match(system, /associatedRunKey is a location hint/);
    assert.match(system, /even if associatedRunKey is a\s+physical wall run/);
    assert.match(system, /40'-0" vs 50'-8"/);
  });

  it("frozen extract emits crawl joistLayoutLengthFeet=40 from 40' observation + spacing-axis notes", () => {
    const bundle = crawlFloorBundle();
    const observations = [fortyFootObservation()];
    const context = buildExtractionProjectContext({
      intent: "floor-framing",
      bundle,
      dictionary: null,
      compiledPages: [],
      buildingAssemblies: { assemblyNames: [], notes: CRAWL_SPACING_AXIS_NOTES },
      geometryObservations: observations,
    });

    assert.equal(context.geometryObservations[0]?.parsedFeet, 40);
    assert.equal(context.geometryObservations[0]?.associatedRunKey, CRAWL_RUN_KEY);

    const payload = mockExtractCrawlLayoutFromPreparedGeometry({
      notes: CRAWL_SPACING_AXIS_NOTES,
      pageText: CRAWL_SPACING_AXIS_NOTES.join("\n"),
      observations: context.geometryObservations,
    });

    const layout = payload.evidence.filter(
      (record) => record.propertyPath === "joistLayoutLengthFeet",
    );
    assert.equal(layout.length, 1);
    assert.equal(layout[0]?.candidateValue, 40);
    assert.equal(layout[0]?.subjectKind, "floor-framing-area");
    assert.match(String(layout[0]?.subjectKey), /CRAWL/i);

    const wallLengths = payload.evidence.filter(
      (record) =>
        record.subjectKind === "wall" && record.propertyPath === "lengthFeet",
    );
    assert.equal(wallLengths.length, 0);

    const floor = resolveFloorFraming(payload.evidence);
    const crawl = floor.areas.find((area) =>
      /CRAWL/i.test(area.id),
    );
    assert.ok(crawl);
    assert.equal(crawl.joistLayoutLengthFeet, 40);

    const calculated = calculateFramingTakeoff({
      ...emptyFramingConstruction(),
      floorFraming: floor,
    });
    const joists = calculated.materials.find(
      (line) => line.quantityKey === "floor.joists",
    );
    const lf = calculated.materials.find(
      (line) => line.quantityKey === "floor.joist-linear-feet",
    );
    assert.equal(joists?.quantity, BECKSTEAD_M5_CRAWL_JOIST_COUNT);
    assert.equal(lf?.quantity, BECKSTEAD_M5_CRAWL_JOIST_LF);
  });

  it("frozen extract omits layout when 40 and 50.67 observations compete", () => {
    const bundle = crawlFloorBundle();
    const context = buildExtractionProjectContext({
      intent: "floor-framing",
      bundle,
      dictionary: null,
      compiledPages: [],
      buildingAssemblies: { assemblyNames: [], notes: CRAWL_SPACING_AXIS_NOTES },
      geometryObservations: [fortyFootObservation(), fiftyEightObservation()],
    });

    assert.equal(context.geometryObservations.length, 2);

    const payload = mockExtractCrawlLayoutFromPreparedGeometry({
      notes: CRAWL_SPACING_AXIS_NOTES,
      pageText: CRAWL_SPACING_AXIS_NOTES.join("\n"),
      observations: context.geometryObservations,
    });

    assert.equal(
      payload.evidence.some(
        (record) => record.propertyPath === "joistLayoutLengthFeet",
      ),
      false,
    );

    const floor = resolveFloorFraming(payload.evidence);
    const crawl = floor.areas.find((area) => /CRAWL/i.test(area.id));
    assert.ok(crawl);
    assert.equal(crawl.joistLayoutLengthFeet, null);
  });

  it("does not mint joistLayoutLengthFeet from observations-only TypeScript", () => {
    const observations = [fortyFootObservation()];
    const context = buildExtractionProjectContext({
      intent: "floor-framing",
      bundle: crawlFloorBundle(),
      dictionary: null,
      compiledPages: [],
      buildingAssemblies: { assemblyNames: [], notes: [] },
      geometryObservations: observations,
    });

    assert.equal(context.geometryObservations[0]?.parsedFeet, 40);
    const observationJson = JSON.stringify(context.geometryObservations);
    assert.equal(observationJson.includes("joistLayoutLengthFeet"), false);

    const floor = resolveFloorFraming(
      crawlEvidenceWithoutLayout().map((record) => evidenceSchema.parse(record)),
    );
    const crawl = floor.areas.find((area) => /CRAWL/i.test(area.id));
    assert.ok(crawl);
    assert.equal(crawl.joistLayoutLengthFeet, null);
  });
});
