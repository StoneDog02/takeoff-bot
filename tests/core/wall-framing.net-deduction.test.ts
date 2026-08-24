import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  computeNetStudDeduction,
  countDisplacedStudPositions,
  countRegularlySpacedStuds,
  enumerateStudLayoutPositionsInches,
} from "../../src/scopes/framing/calculators/netStudDeduction.js";

describe("netStudDeduction", () => {
  it("counts baseline studs per ch.13 formula", () => {
    assert.equal(countRegularlySpacedStuds(37.31, 16), 29);
    assert.equal(countRegularlySpacedStuds(14, 16), 12);
  });

  it("enumerates layout positions including endpoints", () => {
    const positions = enumerateStudLayoutPositionsInches(14, 16);
    assert.deepEqual(positions, [0, 16, 32, 48, 64, 80, 96, 112, 128, 144, 160, 168]);
  });

  it("deducts positions strictly inside rough opening zone", () => {
    const deduct = countDisplacedStudPositions(37.31, 16, 96, 96 + 224.04);
    assert.ok(deduct > 0);
  });

  it("reports full before/after math for representative garage opening", () => {
    const result = computeNetStudDeduction({
      lengthFeet: 37.31,
      spacingInches: 16,
      positionOffsetFeetFromSegmentStart: 9.315,
      roughWidthFeet: 18.67,
    });

    assert.equal(result.baselineCount, 29);
    assert.ok(result.deductCount > 0);
    assert.equal(
      result.adjustedCount,
      result.baselineCount - result.deductCount,
    );
    assert.ok(result.displacedPositionsInches.length > 0);
  });
});
