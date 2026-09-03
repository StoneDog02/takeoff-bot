import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseImperialLengthToFeet } from "../../src/compiler/units/parseImperialLengthToFeet.js";
import { parseImperialLengthToFeet as framingReexport } from "../../src/framing/geometry/parseImperialLengthToFeet.js";

describe("drawing-compiler parseImperialLengthToFeet", () => {
  it("parses whole feet and fractional inches", () => {
    assert.equal(parseImperialLengthToFeet("24'-0\"").status, "ok");
    assert.equal(
      (parseImperialLengthToFeet("24'-0\"") as { feet: number }).feet,
      24,
    );
    const frac = parseImperialLengthToFeet("12'-6 1/2\"");
    assert.equal(frac.status, "ok");
    if (frac.status === "ok") {
      assert.ok(Math.abs(frac.feet - 12.5416666667) < 1e-9);
    }
  });

  it("rejects ambiguous unit-less numbers", () => {
    assert.equal(parseImperialLengthToFeet("24").status, "unresolved");
  });

  it("framing re-export matches drawing-compiler module", () => {
    const a = parseImperialLengthToFeet("19'-6\"");
    const b = framingReexport("19'-6\"");
    assert.deepEqual(a, b);
  });
});
