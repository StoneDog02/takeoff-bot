import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { governPhysicalRunSemanticBindings } from "../../src/compiler/governance/governPhysicalRunSemanticBindings.js";
import type { PbgRun } from "../../src/compiler/pbg/consolidatePhysicalRuns.js";

function mockRun(physicalRunKey: string, authority: PbgRun["wallAuthority"]): PbgRun {
  return {
    id: physicalRunKey,
    physicalRunKey,
    pageNumber: 4,
    orientation: "H",
    sourceCandidateIds: ["c1"],
    faceSegmentIds: [1],
    thicknessPt: 6,
    centerline: { x1: 0, y1: 0, x2: 200, y2: 0 },
    endpoints: [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
    ],
    lengthPt: 200,
    mid: { x: 100, y: 0 },
    openingGapSuspects: [],
    junctions: [],
    connectedRunIds: [],
    wallAuthority: authority,
    authorityScore: authority === "high" ? 90 : 10,
    authorityReasons: ["test"],
  };
}

const pageRole = {
  role: "plan" as const,
  allowsWallPlanLengthEvidence: true,
  planHits: [] as string[],
  elevationHits: [] as string[],
  sectionHits: [] as string[],
  detailHits: [] as string[],
  rawItemCount: 0,
  method: "test",
};

describe("governPhysicalRunSemanticBindings", () => {
  it("emits a direct governed binding when ownership is unique", () => {
    const result = governPhysicalRunSemanticBindings({
      pageNumber: 4,
      pageRole,
      pbgRuns: [mockRun("physical-run:p4:a", "high")],
      associations: [
        {
          textPrimitiveId: "t1",
          semanticSubjectKey: "SW2",
          semanticTextCategory: "type-or-assembly-identifier",
          status: "associated",
          physicalRunKey: "physical-run:p4:a",
          runId: "physical-run:p4:a",
          orientation: "H",
          uniquenessMargin: 2.5,
          spatialScore: 100,
          rawText: "SW2",
        },
      ],
    });

    assert.equal(result.emitBindingIds.length, 1);
    assert.equal(result.bindings[0]?.emit, true);
    assert.equal(result.bindings[0]?.status, "assigned");
    assert.equal(result.bindings[0]?.relationship, "direct-mark");
  });

  it("fails closed on competing identifiers for the same run", () => {
    const result = governPhysicalRunSemanticBindings({
      pageNumber: 4,
      pageRole,
      pbgRuns: [mockRun("physical-run:p4:a", "high")],
      associations: [
        {
          textPrimitiveId: "t1",
          semanticSubjectKey: "SW2",
          semanticTextCategory: "type-or-assembly-identifier",
          status: "associated",
          physicalRunKey: "physical-run:p4:a",
          runId: "physical-run:p4:a",
          orientation: "H",
          uniquenessMargin: 2.5,
          spatialScore: 100,
          rawText: "SW2",
        },
        {
          textPrimitiveId: "t2",
          semanticSubjectKey: "SW3",
          semanticTextCategory: "type-or-assembly-identifier",
          status: "associated",
          physicalRunKey: "physical-run:p4:a",
          runId: "physical-run:p4:a",
          orientation: "H",
          uniquenessMargin: 2.1,
          spatialScore: 90,
          rawText: "SW3",
        },
      ],
    });

    assert.equal(result.emitBindingIds.length, 0);
    assert.equal(result.conflictCount, 1);
    assert.ok(result.bindings.every((binding) => !binding.emit));
  });

  it("does not emit when uniqueness margin is below floor", () => {
    const result = governPhysicalRunSemanticBindings({
      pageNumber: 4,
      pageRole,
      pbgRuns: [mockRun("physical-run:p4:a", "high")],
      associations: [
        {
          textPrimitiveId: "t1",
          semanticSubjectKey: "SW2",
          semanticTextCategory: "type-or-assembly-identifier",
          status: "associated",
          physicalRunKey: "physical-run:p4:a",
          runId: "physical-run:p4:a",
          orientation: "H",
          uniquenessMargin: 1.2,
          spatialScore: 100,
          rawText: "SW2",
        },
      ],
    });

    assert.equal(result.emitBindingIds.length, 0);
    assert.equal(result.bindings[0]?.status, "ambiguous");
  });
});
