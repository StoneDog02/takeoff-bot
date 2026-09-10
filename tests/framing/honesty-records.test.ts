import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { calculateFramingTakeoff } from "../../src/framing/calculate/calculateFramingTakeoff.js";
import { createMaterialLineItemId } from "../../src/framing/calculate/ids.js";
import { buildFloorFramingJoistCountEvidence } from "../../src/framing/demo/floorFramingJoistCountEvidence.js";
import { buildSheathingEvidenceForWall001 } from "../../src/framing/demo/multiObjectFramingEvidence.js";
import { buildRoofFramingCommonRafterEvidence } from "../../src/framing/demo/roofFramingCommonRafterEvidence.js";
import { buildFramingConstructionFromEvidence } from "../../src/framing/read/readFramingPlans.js";
import { emptyFramingConstruction } from "../../src/framing/schemas/framingConstruction.schema.js";
import type {
  OpeningsPayload,
  WallFramingPayload,
} from "../../src/framing/schemas/framing-artifacts.schema.js";
import type { Opening } from "../../src/framing/schemas/opening.schema.js";
import {
  HONESTY_RULE_IDS,
  OPENING_QUANTITY_KEYS,
  WALL_QUANTITY_KEYS,
} from "../../src/framing/validators/rule-ids.js";
import {
  BECKSTEAD_M5_CRAWL_JOIST_COUNT,
  BECKSTEAD_M5_CRAWL_JOIST_LF,
} from "../fixtures/becksteadM5FloorLayoutEvidence.js";
import {
  loadBecksteadW4cCharReplayDictionary,
  loadBecksteadW4cCharReplayEvidence,
} from "../fixtures/becksteadW4cCharReplay.js";

function resolvedTrace(
  propertyPath: string,
  method:
    | "explicit-project-value"
    | "approved-default"
    | "unresolved" = "explicit-project-value",
) {
  return {
    propertyPath,
    method,
    explanation: `${propertyPath} is resolved.`,
    assumptionIds: [],
  };
}

function buildWallFraming(): WallFramingPayload {
  return {
    walls: [
      {
        id: "W-001",
        objectType: "building-wall",
        resolutionTraces: [
          resolvedTrace("assembly.studSize"),
          resolvedTrace("assembly.heightFeet"),
          resolvedTrace("assembly.studSpacingInches"),
          resolvedTrace("assembly.plateCount"),
        ],
        name: "Exterior wall W-001",
        level: "Level 1",
        wallType: "exterior-wood-stud-wall",
        semanticTypeKey: null,
        bindingAuthorityGrade: null,
        location: "exterior",
        bearingStatus: "non-bearing",
        isShearOrBraced: false,
        fireRating: null,
        constructionPhase: "new",
        assembly: {
          material: "dimensional-lumber",
          studSize: "2x4",
          studSpacingInches: 16,
          heightFeet: 8,
          plateCount: 3,
          sheathing: null,
        },
        segmentIds: ["WS-001"],
      },
    ],
    segments: [
      {
        id: "WS-001",
        objectType: "wall-segment",
        resolutionTraces: [resolvedTrace("lengthFeet")],
        parentWallId: "W-001",
        lengthFeet: 20,
        openingIds: ["O-001"],
      },
    ],
  };
}

function buildOpening(overrides: Partial<Opening> = {}): Opening {
  return {
    id: "O-001",
    objectType: "opening",
    resolutionTraces: [
      resolvedTrace("quantity"),
      resolvedTrace("dimensions.nominalWidthFeet"),
      resolvedTrace("dimensions.nominalHeightFeet"),
      resolvedTrace("dimensions.roughWidthFeet"),
      resolvedTrace("dimensions.roughHeightFeet"),
    ],
    category: "window",
    identityRole: "occurrence",
    absorbedSubjectKeys: [],
    parentObjectId: "WS-001",
    parentWallId: "W-001",
    dimensions: {
      nominalWidthFeet: 3,
      nominalHeightFeet: 4,
      roughWidthFeet: 3.5,
      roughHeightFeet: 4.5,
    },
    quantity: 1,
    scheduleReference: null,
    detailReference: null,
    headerMemberId: "SM-HDR-001",
    fireRating: null,
    kingStudCount: null,
    jackStudCount: null,
    positionOffsetFeetFromSegmentStart: null,
    ...overrides,
  };
}

function buildOpenings(openings: Opening[] = [buildOpening()]): OpeningsPayload {
  return { openings };
}

function openingTakeoffConstruction() {
  const construction = emptyFramingConstruction();
  construction.walls = buildWallFraming();
  construction.openings = buildOpenings();
  return construction;
}

describe("S3-UN-1 honesty records", () => {
  it("emits jackStudCount Unresolved without inventing a width-derived jack quantity", () => {
    const construction = openingTakeoffConstruction();
    const calculated = calculateFramingTakeoff(construction);

    const jackLines = calculated.materials.filter(
      (item) => item.quantityKey === OPENING_QUANTITY_KEYS.jackStuds,
    );
    const jackUnresolved = calculated.unresolved.filter(
      (record) => record.propertyPath === "jackStudCount",
    );

    assert.equal(jackLines.length, 0);
    assert.equal(jackUnresolved.length, 1);
    assert.equal(
      jackUnresolved[0]?.reasonCode,
      HONESTY_RULE_IDS.jackStudCountUnresolved,
    );
    assert.equal(jackUnresolved[0]?.physicalId, "O-001");
    assert.match(
      jackUnresolved[0]?.explanation ?? "",
      /no quantity is invented from opening width/i,
    );
    assert.equal(
      calculated.materials.some((item) => item.quantity === 2 && item.quantityKey === OPENING_QUANTITY_KEYS.jackStuds),
      false,
    );
  });

  it("keeps king/sill/cripple quantities while surfacing reviewRequired Reviews", () => {
    const construction = openingTakeoffConstruction();
    const calculated = calculateFramingTakeoff(construction);

    const kings = calculated.materials.find(
      (item) =>
        item.id ===
        createMaterialLineItemId(OPENING_QUANTITY_KEYS.kingStuds, "O-001"),
    );
    const sill = calculated.materials.find(
      (item) =>
        item.id ===
        createMaterialLineItemId(OPENING_QUANTITY_KEYS.roughSill, "O-001"),
    );
    const cripplesAbove = calculated.materials.find(
      (item) =>
        item.id ===
        createMaterialLineItemId(OPENING_QUANTITY_KEYS.cripplesAbove, "O-001"),
    );
    const cripplesBelow = calculated.materials.find(
      (item) =>
        item.id ===
        createMaterialLineItemId(OPENING_QUANTITY_KEYS.cripplesBelow, "O-001"),
    );

    assert.equal(kings?.quantity, 2);
    assert.equal(sill?.quantity, 3.5);
    assert.equal(cripplesAbove?.quantity, 2);
    assert.equal(cripplesBelow?.quantity, 2);

    const reviewPaths = calculated.reviews.map((review) => review.propertyPath).sort();
    assert.deepEqual(reviewPaths, [
      "crippleStudLayout",
      "kingStudCount",
      "roughSillSize",
    ]);
    assert.equal(
      calculated.reviews.every((review) => review.status === "open"),
      true,
    );
    assert.equal(
      calculated.assumptions.every((assumption) => assumption.reviewRequired),
      true,
    );
    assert.equal(
      calculated.reviews.find((review) => review.propertyPath === "kingStudCount")
        ?.assumedValue,
      2,
    );
  });

  it("still calculates unrelated wall stud lines", () => {
    const construction = openingTakeoffConstruction();
    const calculated = calculateFramingTakeoff(construction);

    const studs = calculated.materials.find(
      (item) =>
        item.id === createMaterialLineItemId(WALL_QUANTITY_KEYS.studs, "WS-001"),
    );
    const plates = calculated.materials.find(
      (item) =>
        item.id === createMaterialLineItemId(WALL_QUANTITY_KEYS.plates, "WS-001"),
    );

    assert.equal(studs?.quantity, 16);
    assert.equal(plates?.quantity, 60);
  });

  it("does not store level === Unresolved on new floor/roof/sheathing objects", () => {
    const evidence = [
      ...buildFloorFramingJoistCountEvidence(),
      ...buildRoofFramingCommonRafterEvidence(),
      ...buildSheathingEvidenceForWall001(),
    ].filter((record) => record.propertyPath !== "level");

    const construction = buildFramingConstructionFromEvidence(evidence);
    const systems = [
      ...construction.floorFraming.systems,
      ...construction.roofFraming.systems,
      ...construction.sheathing.systems,
    ];

    assert.ok(systems.length >= 5);
    assert.equal(
      systems.every((system) => system.level === null),
      true,
    );
    assert.equal(
      systems.some((system) => system.level === "Unresolved"),
      false,
    );

    const levelUnresolved = construction.unresolved.filter(
      (record) => record.propertyPath === "level",
    );
    assert.equal(levelUnresolved.length, systems.length);
    assert.equal(
      levelUnresolved.every((record) => record.diagnosticFamily === "READ_GAP"),
      true,
    );
    assert.equal(
      construction.unresolved.some(
        (record) =>
          record.reasonCode === HONESTY_RULE_IDS.floorSystemLevelUnresolved,
      ),
      true,
    );
    assert.equal(
      construction.unresolved.some(
        (record) =>
          record.reasonCode === HONESTY_RULE_IDS.roofSystemLevelUnresolved,
      ),
      true,
    );
    assert.equal(
      construction.unresolved.some(
        (record) =>
          record.reasonCode === HONESTY_RULE_IDS.sheathingSystemLevelUnresolved,
      ),
      true,
    );

    const calculated = calculateFramingTakeoff(construction);
    assert.equal(calculated.unresolved.length, construction.unresolved.length);
  });

  it("keeps W4-C 31/527 and leaves king quantities unchanged", () => {
    const evidence = loadBecksteadW4cCharReplayEvidence();
    const dictionary = loadBecksteadW4cCharReplayDictionary();
    const construction = buildFramingConstructionFromEvidence(evidence, {
      projectDictionary: dictionary,
    });
    const calculated = calculateFramingTakeoff(construction);

    const joists = calculated.materials.find(
      (line) => line.quantityKey === "floor.joists",
    );
    const lf = calculated.materials.find(
      (line) => line.quantityKey === "floor.joist-linear-feet",
    );
    const kings = calculated.materials.filter(
      (line) => line.quantityKey === OPENING_QUANTITY_KEYS.kingStuds,
    );

    assert.equal(joists?.quantity, BECKSTEAD_M5_CRAWL_JOIST_COUNT);
    assert.equal(lf?.quantity, BECKSTEAD_M5_CRAWL_JOIST_LF);
    assert.equal(kings.length, 0);
    assert.equal(
      kings.reduce((sum, line) => sum + line.quantity, 0),
      0,
    );
    assert.equal(
      [
        ...construction.floorFraming.systems,
        ...construction.roofFraming.systems,
        ...construction.sheathing.systems,
      ].some((system) => system.level === "Unresolved"),
      false,
    );
  });
});
