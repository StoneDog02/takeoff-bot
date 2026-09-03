import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { PbgRun } from "../../src/compiler/pbg/consolidatePhysicalRuns.js";
import { rankTypeMarkOwnership } from "../../src/compiler/type-marks/rankTypeMarkOwnership.js";
import type { TypeIdentifierPrimitive } from "../../src/compiler/type-marks/detectTypeIdentifierPrimitives.js";

function mockRun(
  id: string,
  physicalRunKey: string,
  orientation: "H" | "V",
  centerline: { x1: number; y1: number; x2: number; y2: number },
): PbgRun {
  const mid = {
    x: (centerline.x1 + centerline.x2) / 2,
    y: (centerline.y1 + centerline.y2) / 2,
  };
  return {
    id,
    physicalRunKey,
    pageNumber: 1,
    orientation,
    sourceCandidateIds: [id],
    faceSegmentIds: [1],
    thicknessPt: 6,
    centerline,
    endpoints: [
      { x: centerline.x1, y: centerline.y1 },
      { x: centerline.x2, y: centerline.y2 },
    ],
    lengthPt: 200,
    mid,
    openingGapSuspects: [],
    junctions: [],
    connectedRunIds: [],
    wallAuthority: "high",
    authorityScore: 90,
    authorityReasons: ["test"],
  };
}

function mockMark(
  id: string,
  rawText: string,
  mid: { x: number; y: number },
  orientation: "H" | "V",
): TypeIdentifierPrimitive {
  return {
    id,
    rawText,
    semanticSubjectKey: rawText.toUpperCase(),
    semanticTextCategory: "type-or-assembly-identifier",
    mid,
    orientation,
    sourceAuthority: "pdf-text-layer",
  };
}

describe("rankTypeMarkOwnership", () => {
  it("associates a mark with a unique nearby run", () => {
    const run = mockRun("r1", "physical-run:p1:a", "H", {
      x1: 100,
      y1: 200,
      x2: 400,
      y2: 200,
    });
    const farRun = mockRun("r2", "physical-run:p1:b", "H", {
      x1: 100,
      y1: 500,
      x2: 400,
      y2: 500,
    });

    const { associations, assignedUnique } = rankTypeMarkOwnership({
      marks: [mockMark("m1", "SW2", { x: 250, y: 210 }, "H")],
      pbgRuns: [run, farRun],
    });

    assert.equal(assignedUnique, 1);
    assert.equal(associations[0]?.status, "associated");
    assert.equal(associations[0]?.physicalRunKey, run.physicalRunKey);
    assert.ok((associations[0]?.uniquenessMargin ?? 0) >= 1.5);
  });

  it("marks ambiguous ownership when two runs score similarly", () => {
    const runA = mockRun("r1", "physical-run:p1:a", "H", {
      x1: 100,
      y1: 200,
      x2: 400,
      y2: 200,
    });
    const runB = mockRun("r2", "physical-run:p1:b", "H", {
      x1: 100,
      y1: 210,
      x2: 400,
      y2: 210,
    });

    const { associations, ambiguous } = rankTypeMarkOwnership({
      marks: [mockMark("m1", "SW2", { x: 250, y: 205 }, "H")],
      pbgRuns: [runA, runB],
    });

    assert.equal(ambiguous, 1);
    assert.equal(associations[0]?.status, "ambiguous");
  });

  it("rejects non-identifier categories", () => {
    const run = mockRun("r1", "physical-run:p1:a", "H", {
      x1: 100,
      y1: 200,
      x2: 400,
      y2: 200,
    });

    const { associations, rejectedCategory } = rankTypeMarkOwnership({
      marks: [
        {
          ...mockMark("m1", "BEARING WALL", { x: 250, y: 210 }, "H"),
          semanticTextCategory: "wall-property-or-classification",
        },
      ],
      pbgRuns: [run],
    });

    assert.equal(rejectedCategory, 1);
    assert.equal(associations[0]?.status, "rejected-category");
  });
});
