import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { calculateWallFraming } from "../../src/scopes/framing/calculators/calculateWallFraming.js";
import { computeNetStudDeduction } from "../../src/scopes/framing/calculators/netStudDeduction.js";
import type { Opening } from "../../src/scopes/framing/schemas/opening.schema.js";
import type { WallFramingPayload } from "../../src/scopes/framing/schemas/framing-artifacts.schema.js";

const complete = {
  status: "complete" as const,
  percentage: 100,
  completedItems: 1,
  totalItems: 1,
};

function buildPayload(lengthFeet = 20): WallFramingPayload {
  return {
    walls: [
      {
        id: "W-001",
        objectType: "building-wall",
        completion: complete,
        reviewStatus: "no-review-required",
        blockingStatus: "not-blocked",
        evidenceIds: [],
        assumptionIds: [],
        validationIssueIds: [],
        reviewItemIds: [],
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
        completion: complete,
        reviewStatus: "no-review-required",
        blockingStatus: "not-blocked",
        evidenceIds: [],
        assumptionIds: [],
        validationIssueIds: [],
        reviewItemIds: [],
        resolutionTraces: [
          {
            propertyPath: "lengthFeet",
            method: "explicit-project-value",
            explanation: "length",
            evidenceIds: [],
            assumptionIds: [],
            validationIssueIds: [],
            reviewItemIds: [],
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
    completion: complete,
    reviewStatus: "no-review-required",
    blockingStatus: "not-blocked",
    evidenceIds: [],
    assumptionIds: [],
    validationIssueIds: [],
    reviewItemIds: [],
    resolutionTraces: [],
    category: "door",
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

    const adjustedMaterials = calculateWallFraming(wallPayload, undefined, {
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
    const withEmptyOpenings = calculateWallFraming(wallPayload, undefined, {
      openings: [],
    });
    assert.equal(
      baseline.find((m) => m.unit === "each")?.quantity,
      withEmptyOpenings.find((m) => m.unit === "each")?.quantity,
    );
  });
});
