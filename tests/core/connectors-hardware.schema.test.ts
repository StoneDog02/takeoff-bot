import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  connectorSchema,
  fastenerSchema,
  hardwareSchema,
} from "../../src/scopes/framing/schemas/connectors-hardware.schema.js";

describe("connector domain contracts", () => {
  it("accepts a connector that references members, hardware, and fasteners by ID only", () => {
    const connector = connectorSchema.parse({
      id: "CN-001",
      objectType: "connector",
      connectorType: "joist hanger",
      model: "HUS26",
      associatedObjectIds: ["SM-008"],
      hardwareIds: ["HW-001"],
      fastenerIds: ["FS-001"],
    });

    assert.deepEqual(connector.associatedObjectIds, ["SM-008"]);
    assert.deepEqual(connector.hardwareIds, ["HW-001"]);
    assert.deepEqual(connector.fastenerIds, ["FS-001"]);
    assert.equal("members" in connector, false);
    assert.equal("hardware" in connector, false);
    assert.equal("fasteners" in connector, false);
  });

  it("accepts unresolved connector type and model", () => {
    const connector = connectorSchema.parse({
      id: "CN-002",
      objectType: "connector",
    });

    assert.equal(connector.connectorType, null);
    assert.equal(connector.model, null);
    assert.deepEqual(connector.associatedObjectIds, []);
    assert.deepEqual(connector.hardwareIds, []);
    assert.deepEqual(connector.fastenerIds, []);
  });
});

describe("fastener domain contracts", () => {
  it("accepts a fastener with specified extract properties", () => {
    const fastener = fastenerSchema.parse({
      id: "FS-001",
      objectType: "fastener",
      fastenerType: "nail",
      diameter: "0.148\"",
      length: "3-1/2\"",
      coating: "hot-dip galvanized",
      quantity: 40,
      associatedObjectIds: ["CN-001"],
    });

    assert.equal(fastener.quantity, 40);
    assert.deepEqual(fastener.associatedObjectIds, ["CN-001"]);
  });

  it("accepts a fastener without inferred schedule or specified quantity", () => {
    const fastener = fastenerSchema.parse({
      id: "FS-002",
      objectType: "fastener",
    });

    assert.equal(fastener.fastenerType, null);
    assert.equal(fastener.diameter, null);
    assert.equal(fastener.length, null);
    assert.equal(fastener.coating, null);
    assert.equal(fastener.quantity, null);
    assert.equal("schedule" in fastener, false);
    assert.equal("nailingPattern" in fastener, false);
  });
});

describe("hardware domain contracts", () => {
  it("accepts hardware that references associated objects by ID only", () => {
    const hardware = hardwareSchema.parse({
      id: "HW-001",
      objectType: "hardware",
      hardwareType: "bearing plate",
      associatedObjectIds: ["SM-014", "CN-001"],
    });

    assert.equal(hardware.hardwareType, "bearing plate");
    assert.deepEqual(hardware.associatedObjectIds, ["SM-014", "CN-001"]);
    assert.equal("associatedObjects" in hardware, false);
  });

  it("accepts unresolved hardware type", () => {
    const hardware = hardwareSchema.parse({
      id: "HW-002",
      objectType: "hardware",
    });

    assert.equal(hardware.hardwareType, null);
    assert.deepEqual(hardware.associatedObjectIds, []);
  });
});
