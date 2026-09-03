import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { governOpeningPhysicalRunOwnership } from "../../src/framing/geometry/governOpeningPhysicalRunOwnership.js";
import type { OpeningGapCandidate } from "../../src/framing/geometry/openingGovernanceTypes.js";
import type { PhysicalWallRunRecord } from "../../src/compiler/schemas/physicalWallRun.schema.js";

function makeRun(
  overrides: Partial<PhysicalWallRunRecord> = {},
): PhysicalWallRunRecord {
  return {
    id: "run-1",
    physicalRunKey: "physical-run:p4:test",
    pageNumber: 4,
    orientation: "H",
    sourceCandidateIds: [],
    faceSegmentIds: [],
    thicknessPt: 4,
    centerline: { x1: 100, y1: 200, x2: 800, y2: 200 },
    endpoints: [{ x: 100, y: 200 }, { x: 800, y: 200 }],
    lengthPt: 700,
    mid: { x: 450, y: 200 },
    openingGapSuspects: [],
    junctions: [],
    connectedRunIds: [],
    wallAuthority: "high",
    authorityScore: 10,
    authorityReasons: [],
    ...overrides,
  };
}

const candidate: OpeningGapCandidate = {
  openingSubjectKey: "opening:p4:physical-run:p4:test:gap0",
  pageNumber: 4,
  physicalRunKey: "physical-run:p4:test",
  gapIndex: 0,
  gapAt: { x: 450, y: 200 },
  gapPt: 48,
  runOrientation: "H",
  runLengthPt: 700,
  wallAuthority: "high",
};

describe("governOpeningPhysicalRunOwnership", () => {
  it("establishes parent run and position offset when width is known", () => {
    const run = makeRun();
    const result = governOpeningPhysicalRunOwnership(
      candidate,
      run,
      18,
      18.67,
    );

    assert.equal(result.status, "ESTABLISHED");
    assert.equal(result.parentPhysicalRunKey, "physical-run:p4:test");
    assert.ok(result.positionOffsetFeetFromSegmentStart != null);
  });

  it("fails closed for reject authority runs", () => {
    const run = makeRun({ wallAuthority: "reject" });
    const result = governOpeningPhysicalRunOwnership(
      candidate,
      run,
      18,
      10,
    );

    assert.equal(result.status, "UNRESOLVED");
    assert.equal(result.parentPhysicalRunKey, null);
  });
});
