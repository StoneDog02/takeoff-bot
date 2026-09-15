import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  computeNetStudDeduction,
  countDisplacedStudPositions,
  countRegularlySpacedStuds,
  enumerateStudLayoutPositionsInches,
} from "../../src/framing/calculate/netStudDeduction.js";

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

/**
 * S4-LY-1: Wall stud position-census fixture.
 *
 * Per V1 spec §16.2 / §19: purchased regularly spaced stud count = enumerated layout positions.
 * The formula `ceil((L*12)/spacing)+1` is a sanity check, not authority.
 */
describe("wall stud position-census (S4-LY-1)", () => {
  it("count equals position array length for 14 ft @ 16 in OC", () => {
    const positions = enumerateStudLayoutPositionsInches(14, 16);
    const count = countRegularlySpacedStuds(14, 16);
    assert.equal(count, positions.length, "count must equal enumerated positions");
    assert.equal(count, 12);
    assert.deepEqual(positions, [0, 16, 32, 48, 64, 80, 96, 112, 128, 144, 160, 168]);
  });

  it("count equals position array length for 37.31 ft @ 16 in OC (Beckstead-style)", () => {
    const positions = enumerateStudLayoutPositionsInches(37.31, 16);
    const count = countRegularlySpacedStuds(37.31, 16);
    assert.equal(count, positions.length, "count must equal enumerated positions");
    assert.equal(count, 29);
    assert.equal(positions[0], 0);
    assert.equal(positions[positions.length - 1], 37.31 * 12);
  });

  it("count equals position array length for 20 ft @ 16 in OC (exact spacing)", () => {
    const positions = enumerateStudLayoutPositionsInches(20, 16);
    const count = countRegularlySpacedStuds(20, 16);
    assert.equal(count, positions.length, "count must equal enumerated positions");
    assert.equal(count, 16);
    assert.equal(positions[0], 0);
    assert.equal(positions[positions.length - 1], 240);
  });

  it("count equals position array length for 12 ft @ 16 in OC (short final bay)", () => {
    const positions = enumerateStudLayoutPositionsInches(12, 16);
    const count = countRegularlySpacedStuds(12, 16);
    assert.equal(count, positions.length, "count must equal enumerated positions");
    assert.equal(count, 10);
    assert.equal(positions[0], 0);
    assert.equal(positions[positions.length - 1], 144);
  });

  it("count equals position array length for 19.5 ft @ 16 in OC (non-integer spaces)", () => {
    const positions = enumerateStudLayoutPositionsInches(19.5, 16);
    const count = countRegularlySpacedStuds(19.5, 16);
    assert.equal(count, positions.length, "count must equal enumerated positions");
    assert.equal(count, 16);
  });

  it("count equals position array length for 24 in OC spacing", () => {
    const positions = enumerateStudLayoutPositionsInches(20, 24);
    const count = countRegularlySpacedStuds(20, 24);
    assert.equal(count, positions.length, "count must equal enumerated positions");
    assert.equal(count, 11);
  });
});
