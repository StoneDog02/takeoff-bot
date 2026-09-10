import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assignLengthEvidenceFromGeometryObservation } from "../../src/framing/geometry/assignLengthEvidenceFromGeometryObservation.js";
import {
  wallGeometryObservationSchema,
  type WallGeometryObservation,
} from "../../src/framing/geometry/wallGeometryObservation.js";

function observation(
  overrides: Partial<WallGeometryObservation> = {},
): WallGeometryObservation {
  return wallGeometryObservationSchema.parse({
    id: "obs-1",
    rawDimensionText: "12'-0\"",
    lengthFeet: 12,
    authorityMethod: "explicit-dimension",
    targetKind: "physical-run",
    targetPhysicalRunKey: "physical-run:p2:abc123",
    observedWallTypeMark: null,
    sourcePageNumber: 2,
    sourceTileId: null,
    startAnchorDescription: null,
    endAnchorDescription: null,
    orientation: "horizontal",
    isChainSegment: false,
    chainSiblingTexts: [],
    confidenceLabel: "high",
    notes: [],
    ...overrides,
  });
}

describe("assignLengthEvidenceFromGeometryObservation", () => {
  it("assigns lengthFeet for a physical-run explicit-dimension even when confidence is low", () => {
    const result = assignLengthEvidenceFromGeometryObservation(
      observation({ confidenceLabel: "low" }),
    );
    assert.equal(result.status, "assigned");
    if (result.status !== "assigned") {
      return;
    }
    assert.equal(result.lengthFeet, 12);
    assert.equal(result.physicalRunKey, "physical-run:p2:abc123");
    assert.equal(result.evidence.propertyPath, "lengthFeet");
    assert.equal(result.evidence.candidateValue, 12);
  });

  it("rejects a non-physical-run target (construction fail-closed)", () => {
    const result = assignLengthEvidenceFromGeometryObservation(
      observation({
        confidenceLabel: "high",
        targetKind: "unknown",
      }),
    );
    assert.equal(result.status, "rejected");
    if (result.status !== "rejected") {
      return;
    }
    assert.match(result.reason, /targetKind=unknown/);
  });

  it("rejects a chain-segment observation (construction fail-closed)", () => {
    const result = assignLengthEvidenceFromGeometryObservation(
      observation({
        confidenceLabel: "high",
        isChainSegment: true,
        authorityMethod: "dimension-chain-segment",
      }),
    );
    assert.equal(result.status, "rejected");
    if (result.status !== "rejected") {
      return;
    }
    assert.match(result.reason, /chain segment/);
  });

  it("rejects a wall-type-mark target (construction fail-closed)", () => {
    const result = assignLengthEvidenceFromGeometryObservation(
      observation({
        confidenceLabel: "high",
        targetKind: "wall-type-mark",
        targetPhysicalRunKey: "SW2",
      }),
    );
    assert.equal(result.status, "rejected");
    if (result.status !== "rejected") {
      return;
    }
    assert.match(result.reason, /targetKind=wall-type-mark/);
  });

  it("rejects a physical-run key that looks like a wall-type mark", () => {
    const result = assignLengthEvidenceFromGeometryObservation(
      observation({
        confidenceLabel: "high",
        targetPhysicalRunKey: "SW5",
      }),
    );
    assert.equal(result.status, "rejected");
    if (result.status !== "rejected") {
      return;
    }
    assert.match(result.reason, /wall-type mark/);
  });

  it("rejects non-explicit authority even when confidence is high", () => {
    const result = assignLengthEvidenceFromGeometryObservation(
      observation({
        confidenceLabel: "high",
        authorityMethod: "geometry-derived",
      }),
    );
    assert.equal(result.status, "rejected");
    if (result.status !== "rejected") {
      return;
    }
    assert.match(result.reason, /authorityMethod=geometry-derived/);
  });

  it("rejects unparsable dimension text (construction fail-closed)", () => {
    const result = assignLengthEvidenceFromGeometryObservation(
      observation({
        confidenceLabel: "high",
        rawDimensionText: "12",
        lengthFeet: null,
      }),
    );
    assert.equal(result.status, "rejected");
    if (result.status !== "rejected") {
      return;
    }
    assert.match(result.reason, /parse failed/);
  });
});
