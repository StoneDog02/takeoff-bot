import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  sheathingAreaSchema,
  sheathingSystemSchema,
} from "../../src/scopes/framing/schemas/sheathing.schema.js";

const complete = {
  status: "complete",
  percentage: 100,
  completedItems: 1,
  totalItems: 1,
} as const;

describe("sheathing domain contracts", () => {
  it("accepts a sheathing system that references areas by ID only", () => {
    const system = sheathingSystemSchema.parse({
      id: "SHS-001",
      objectType: "sheathing-system",
      completion: complete,
      reviewStatus: "no-review-required",
      blockingStatus: "not-blocked",
      name: "Level 1 exterior wall sheathing",
      level: "Level 1",
      application: "wall",
      constructionPhase: "new",
      panelSpecification: {
        panelType: "OSB",
        thickness: "7/16\"",
        specificationReference: "S1.0 wall sheathing note",
      },
      areaIds: ["SHA-001"],
    });

    assert.deepEqual(system.areaIds, ["SHA-001"]);
    assert.equal("areas" in system, false);
    assert.equal(system.panelSpecification.grade, null);
  });

  it("accepts a sheathing area with unresolved layout and ID-only coverage", () => {
    const area = sheathingAreaSchema.parse({
      id: "SHA-001",
      objectType: "sheathing-area",
      completion: {
        status: "partial",
        percentage: 50,
        completedItems: 1,
        totalItems: 2,
      },
      reviewStatus: "review-required",
      blockingStatus: "not-blocked",
      parentSystemId: "SHS-001",
      coveredObjectIds: ["W-001"],
      openingIds: ["O-014"],
    });

    assert.equal(area.parentSystemId, "SHS-001");
    assert.equal(area.layout, null);
    assert.equal(area.areaSquareFeet, null);
    assert.deepEqual(area.coveredObjectIds, ["W-001"]);
    assert.equal("walls" in area, false);
  });

  it("rejects a sheathing area without a parent system", () => {
    const result = sheathingAreaSchema.safeParse({
      id: "SHA-002",
      objectType: "sheathing-area",
      completion: complete,
      reviewStatus: "no-review-required",
      blockingStatus: "not-blocked",
    });

    assert.equal(result.success, false);
  });
});
