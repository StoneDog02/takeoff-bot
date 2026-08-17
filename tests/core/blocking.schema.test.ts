import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { blockingSchema } from "../../src/scopes/framing/schemas/blocking.schema.js";

const complete = {
  status: "complete",
  percentage: 100,
  completedItems: 1,
  totalItems: 1,
} as const;

describe("blocking domain contracts", () => {
  it("accepts blocking that references associated objects by ID only", () => {
    const blocking = blockingSchema.parse({
      id: "BLK-001",
      objectType: "blocking",
      completion: complete,
      reviewStatus: "no-review-required",
      blockingStatus: "not-blocked",
      blockingType: "solid blocking",
      purpose: "sheathing edge support",
      structuralRole: "structural",
      material: "dimensional-lumber",
      size: "2x10",
      spacingInches: 48,
      location: "Level 2 floor bay between W-001 and W-002",
      detailReference: "S3.1/3",
      associatedObjectIds: ["FFA-001", "SHA-001"],
    });

    assert.deepEqual(blocking.associatedObjectIds, ["FFA-001", "SHA-001"]);
    assert.equal("associatedObjects" in blocking, false);
  });

  it("accepts unresolved classification, location, and size", () => {
    const blocking = blockingSchema.parse({
      id: "BLK-002",
      objectType: "blocking",
      completion: {
        status: "partial",
        percentage: 25,
        completedItems: 1,
        totalItems: 4,
      },
      reviewStatus: "review-required",
      blockingStatus: "not-blocked",
      structuralRole: "unknown",
    });

    assert.equal(blocking.blockingType, null);
    assert.equal(blocking.purpose, null);
    assert.equal(blocking.material, null);
    assert.equal(blocking.size, null);
    assert.equal(blocking.spacingInches, null);
    assert.equal(blocking.location, null);
    assert.equal(blocking.detailReference, null);
    assert.deepEqual(blocking.associatedObjectIds, []);
  });
});
