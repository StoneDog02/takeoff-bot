import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  sheathingAreaSchema,
  sheathingSystemSchema,
} from "../../src/scopes/framing/schemas/sheathing.schema.js";

describe("sheathing domain contracts", () => {
  it("accepts a sheathing system that references areas by ID only", () => {
    const system = sheathingSystemSchema.parse({
      id: "SHS-001",
      objectType: "sheathing-system",
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
    });

    assert.equal(result.success, false);
  });
});
