import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  roofFramingSystemSchema,
  roofPlaneSchema,
} from "../../src/scopes/framing/schemas/roof-framing.schema.js";

const complete = {
  status: "complete",
  percentage: 100,
  completedItems: 1,
  totalItems: 1,
} as const;

describe("roof framing domain contracts", () => {
  it("accepts a roof framing system that references planes by ID only", () => {
    const system = roofFramingSystemSchema.parse({
      id: "RFS-001",
      objectType: "roof-framing-system",
      completion: complete,
      reviewStatus: "no-review-required",
      blockingStatus: "not-blocked",
      name: "Main roof framing",
      level: "Roof",
      constructionPhase: "new",
      assembly: {
        framingType: "rafter",
        memberSize: "2x8",
        memberSpacingInches: 24,
      },
      planeIds: ["RP-001"],
    });

    assert.deepEqual(system.planeIds, ["RP-001"]);
    assert.equal("planes" in system, false);
  });

  it("accepts a roof plane with unresolved pitch and ID-only relationships", () => {
    const plane = roofPlaneSchema.parse({
      id: "RP-001",
      objectType: "roof-plane",
      completion: {
        status: "partial",
        percentage: 50,
        completedItems: 1,
        totalItems: 2,
      },
      reviewStatus: "review-required",
      blockingStatus: "not-blocked",
      parentSystemId: "RFS-001",
      boundingWallIds: ["W-001"],
      openingIds: ["O-021"],
      structuralMemberIds: ["SM-014"],
    });

    assert.equal(plane.parentSystemId, "RFS-001");
    assert.equal(plane.pitch, null);
    assert.equal(plane.spanDirection, null);
    assert.equal(plane.framingDirection, null);
    assert.equal(plane.layout, null);
    assert.equal(plane.areaSquareFeet, null);
    assert.deepEqual(plane.structuralMemberIds, ["SM-014"]);
  });

  it("rejects a roof plane without a parent system", () => {
    const result = roofPlaneSchema.safeParse({
      id: "RP-002",
      objectType: "roof-plane",
      completion: complete,
      reviewStatus: "no-review-required",
      blockingStatus: "not-blocked",
    });

    assert.equal(result.success, false);
  });
});
