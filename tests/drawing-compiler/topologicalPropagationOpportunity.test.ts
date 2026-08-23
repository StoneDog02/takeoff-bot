import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { recordTopologicalPropagationOpportunities } from "../../src/drawing-compiler/governance/recordTopologicalPropagationOpportunities.js";
import type { PbgRun } from "../../src/drawing-compiler/pbg/consolidatePhysicalRuns.js";
import type { PhysicalRunSemanticBinding } from "../../src/drawing-compiler/schemas/semanticBinding.schema.js";

function mockRun(
  id: string,
  physicalRunKey: string,
  connectedRunIds: string[],
): PbgRun {
  return {
    id,
    physicalRunKey,
    pageNumber: 1,
    orientation: "H",
    sourceCandidateIds: [id],
    faceSegmentIds: [1],
    thicknessPt: 6,
    centerline: { x1: 0, y: 0, x2: 200, y2: 0 },
    endpoints: [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
    ],
    lengthPt: 200,
    mid: { x: 100, y: 0 },
    openingGapSuspects: [],
    junctions: [{ kind: "corner", at: { x: 200, y: 0 }, otherRunId: connectedRunIds[0] }],
    connectedRunIds,
    wallAuthority: "high",
    authorityScore: 90,
    authorityReasons: ["test"],
  };
}

function seedBinding(physicalRunKey: string): PhysicalRunSemanticBinding {
  return {
    bindingId: `bind-${physicalRunKey}`,
    physicalRunKey,
    semanticSubjectKey: "SW2",
    semanticTextCategory: "type-or-assembly-identifier",
    relationship: "direct-mark",
    authorityMethod: "mark-spatial-ownership",
    authorityGrade: "A",
    status: "assigned",
    emit: true,
    sourcePageNumber: 1,
    sourceTextPrimitiveId: "t1",
    spatialScore: 100,
    uniquenessMargin: 2,
    competingCandidates: [],
    notes: [],
  };
}

describe("recordTopologicalPropagationOpportunities", () => {
  it("records audit opportunities without emitting bindings", () => {
    const seeded = mockRun("r1", "physical-run:p1:seed", ["r2"]);
    const neighbor = mockRun("r2", "physical-run:p1:neighbor", ["r1"]);

    const opportunities = recordTopologicalPropagationOpportunities({
      pbgRuns: [seeded, neighbor],
      emitBindings: [seedBinding("physical-run:p1:seed")],
    });

    assert.equal(opportunities.length, 1);
    assert.equal(opportunities[0]?.physicalRunKey, "physical-run:p1:neighbor");
    assert.equal(opportunities[0]?.reasonNotEmitted, "propagation-deferred-to-L.1");
    assert.ok(opportunities.every((item) => item.reasonNotEmitted.length > 0));
  });
});
