import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { calculateWallFraming } from "../../src/framing/calculate/calculateWallFraming.js";
import { computeNetStudDeduction } from "../../src/framing/calculate/netStudDeduction.js";
import type { Opening } from "../../src/framing/schemas/opening.schema.js";
import type { WallFramingPayload } from "../../src/framing/schemas/framing-artifacts.schema.js";

function buildPayload(lengthFeet = 20): WallFramingPayload {
  return {
    walls: [
      {
        id: "W-001",
        objectType: "building-wall",
        resolutionTraces: [],
        name: "W-001",
        level: null,
        wallType: "wood-stud-wall",
        semanticTypeKey: null,
        bindingAuthorityGrade: null,
        location: "unknown",
        bearingStatus: "unknown",
        isShearOrBraced: null,
        fireRating: null,
        constructionPhase: "unknown",
        assembly: {
          material: "dimensional-lumber",
          studSize: "2x4",
          studSpacingInches: 16,
          heightFeet: null,
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
        resolutionTraces: [
          {
            propertyPath: "lengthFeet",
            method: "explicit-project-value",
            explanation: "length",
            assumptionIds: [],
          },
        ],
        parentWallId: "W-001",
        lengthFeet,
        openingIds: [],
      },
    ],
  };
}

function buildOpening(overrides: Partial<Opening> = {}): Opening {
  return {
    id: "O-001",
    objectType: "opening",
    resolutionTraces: [],
    category: "door",
    identityRole: "occurrence",
    absorbedSubjectKeys: [],
    parentObjectId: "WS-001",
    parentWallId: "W-001",
    dimensions: {
      nominalWidthFeet: 3,
      nominalHeightFeet: 7,
      roughWidthFeet: 3.5,
      roughHeightFeet: 7.5,
    },
    quantity: 1,
    scheduleReference: null,
    detailReference: null,
    headerMemberId: null,
    fireRating: null,
    kingStudCount: null,
    jackStudCount: null,
    positionOffsetFeetFromSegmentStart: 6,
    ...overrides,
  };
}

describe("calculateWallFraming net deductions with openings", () => {
  it("reduces regular stud count when governed opening is on segment", () => {
    const wallPayload = buildPayload(20);
    const baselineMaterials = calculateWallFraming(wallPayload);
    const baselineStuds = baselineMaterials.find((m) => m.unit === "each");
    assert.ok(baselineStuds);

    const opening = buildOpening();
    const math = computeNetStudDeduction({
      lengthFeet: 20,
      spacingInches: 16,
      positionOffsetFeetFromSegmentStart: opening.positionOffsetFeetFromSegmentStart!,
      roughWidthFeet: opening.dimensions.roughWidthFeet!,
    });

    const adjustedMaterials = calculateWallFraming(wallPayload, {
      openings: [opening],
    });
    const adjustedStuds = adjustedMaterials.find((m) => m.unit === "each");
    assert.ok(adjustedStuds);
    assert.equal(adjustedStuds.quantity, math.adjustedCount);
    assert.ok(adjustedStuds.quantity < baselineStuds.quantity);
  });

  it("leaves baseline unchanged when opening lacks position and width", () => {
    const wallPayload = buildPayload();
    const baseline = calculateWallFraming(wallPayload);
    const withEmptyOpenings = calculateWallFraming(wallPayload, {
      openings: [],
    });
    assert.equal(
      baseline.find((m) => m.unit === "each")?.quantity,
      withEmptyOpenings.find((m) => m.unit === "each")?.quantity,
    );
  });
});
