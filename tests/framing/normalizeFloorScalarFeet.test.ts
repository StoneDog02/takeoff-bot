import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  evaluateFloorScalarFeetCandidate,
  normalizeFloorScalarFeetCandidate,
  splitImperialLengthAlternatives,
} from "../../src/framing/resolve/normalizeFloorScalarFeet.js";

describe("normalizeFloorScalarFeet", () => {
  it("parses a single imperial feet string", () => {
    assert.equal(normalizeFloorScalarFeetCandidate("40'-0\""), 40);
    assert.equal(normalizeFloorScalarFeetCandidate(17), 17);
  });

  it("fails closed on dual-value imperial strings", () => {
    const evaluation = evaluateFloorScalarFeetCandidate(`40'-0" / 50'-8"`);
    assert.equal(evaluation.kind, "multi-value");
    assert.equal(normalizeFloorScalarFeetCandidate(`40'-0" / 50'-8"`), undefined);
    assert.deepEqual(splitImperialLengthAlternatives(`40'-0" / 50'-8"`), [
      `40'-0"`,
      `50'-8"`,
    ]);
  });
});
