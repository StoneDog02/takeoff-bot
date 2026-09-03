import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  evaluateScaleConsistency,
  type ScaleTrustInput,
} from "../../src/compiler/governance/evaluateScaleConsistency.js";

function input(partial: Partial<ScaleTrustInput> & Pick<ScaleTrustInput, "dimId">): ScaleTrustInput {
  return {
    orientation: "H",
    runLengthPt: 1200,
    parsedFeet: 54,
    uniquenessMargin: 2,
    lengthOk: true,
    ownershipStatus: "associated",
    candidateSource: "detected",
    ...partial,
  };
}

describe("evaluateScaleConsistency", () => {
  it("passes when leave-one-out peer agrees within band", () => {
    const inputs: ScaleTrustInput[] = [
      input({ dimId: "a", runLengthPt: 1296, parsedFeet: 54 }),
      input({ dimId: "b", runLengthPt: 1300, parsedFeet: 54.2 }),
      input({ dimId: "c", runLengthPt: 1288, parsedFeet: 53.8 }),
    ];
    const decisions = evaluateScaleConsistency(inputs);
    assert.equal(decisions.get("a")?.status, "pass");
  });

  it("rejects outlier when opposing cluster exists", () => {
    const ptPerFt = 18;
    const clusterRunPt = 24 * ptPerFt;
    const outlierRunPt = 54 * ptPerFt;
    const inputs: ScaleTrustInput[] = [
      input({ dimId: "outlier", runLengthPt: outlierRunPt, parsedFeet: 240 }),
      input({ dimId: "p1", runLengthPt: clusterRunPt, parsedFeet: 24 }),
      input({ dimId: "p2", runLengthPt: clusterRunPt + 5, parsedFeet: 24.1 }),
      input({ dimId: "p3", runLengthPt: clusterRunPt - 5, parsedFeet: 23.9 }),
    ];
    const decisions = evaluateScaleConsistency(inputs);
    assert.equal(decisions.get("outlier")?.status, "reject");
  });
});
