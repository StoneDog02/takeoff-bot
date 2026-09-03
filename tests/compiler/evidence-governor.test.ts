import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  governWallPlanLengthObservations,
  type GovernableAssoc,
} from "../../src/compiler/governance/governWallPlanLengthObservations.js";

function assoc(partial: Partial<GovernableAssoc> & Pick<GovernableAssoc, "dimId">): GovernableAssoc {
  return {
    roleGuess: "overall-candidate",
    status: "associated",
    uniquenessMargin: 2,
    lengthOk: true,
    runLengthPt: 1200,
    dimLengthPt: 1100,
    orientation: "H",
    physicalRunKey: "physical-run:p1:abc",
    runId: "run-1",
    ocrText: "24'-0\"",
    parse: { status: "ok", feet: 24, originalText: "24'-0\"" },
    candidateSource: "detected",
    transcriptionAuthority: "pdf-text-layer",
    ...partial,
  };
}

describe("governWallPlanLengthObservations", () => {
  const planRole = {
    role: "plan" as const,
    allowsWallPlanLengthEvidence: true,
    planHits: ["PLAN"],
    elevationHits: [],
    sectionHits: [],
    detailHits: [],
    rawItemCount: 1,
    method: "plan-token",
  };

  const elevationRole = {
    ...planRole,
    role: "elevation" as const,
    allowsWallPlanLengthEvidence: false,
    method: "elevation-token",
  };

  it("blocks virtual-text candidate source", () => {
    const result = governWallPlanLengthObservations({
      pageRole: planRole,
      associations: [
        assoc({ dimId: "v1", candidateSource: "virtual-text" }),
      ],
    });
    assert.equal(result.emitDimIds.length, 0);
    assert.ok(result.decisions.some((d) => d.reasons.includes("virtual-text-no-evidence")));
  });

  it("blocks elevation page role", () => {
    const result = governWallPlanLengthObservations({
      pageRole: elevationRole,
      associations: [assoc({ dimId: "d1" })],
    });
    assert.equal(result.emitDimIds.length, 0);
    assert.ok(result.counts.rejectPageRole >= 1);
  });

  it("blocks parsed feet below evidence floor", () => {
    const result = governWallPlanLengthObservations({
      pageRole: planRole,
      associations: [
        assoc({
          dimId: "short",
          parse: { status: "ok", feet: 6, originalText: "6'-0\"" },
          ocrText: "6'-0\"",
        }),
      ],
    });
    assert.equal(result.emitDimIds.length, 0);
    assert.ok(result.counts.rejectOwnership >= 1);
  });
});
