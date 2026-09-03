import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditVectorGridFeasibility,
  reconstructTableGridFromSegments,
} from "../../src/compiler/semantic-definitions/reconstructTableGridFromSegments.js";
import type { Segment } from "../../src/compiler/sgg/extractSegments.js";

function seg(
  id: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  orientation: "H" | "V",
): Segment {
  const length = Math.hypot(x2 - x1, y2 - y1);
  return {
    id,
    x1,
    y1,
    x2,
    y2,
    length,
    angleDeg: 0,
    orientation,
    strokeWidth: 0.5,
  };
}

describe("reconstructTableGridFromSegments", () => {
  it("clusters H/V rules into a grid", () => {
    const segments: Segment[] = [
      seg(1, 0, 0, 200, 0, "H"),
      seg(2, 0, 50, 200, 50, "H"),
      seg(3, 0, 100, 200, 100, "H"),
      seg(4, 0, 0, 0, 120, "V"),
      seg(5, 100, 0, 100, 120, "V"),
    ];
    const grid = reconstructTableGridFromSegments({
      segments,
      region: { x0: -1, y0: -1, x1: 201, y1: 121 },
    });
    assert.ok(grid.horizontalLines.length >= 2);
    assert.ok(grid.verticalLines.length >= 2);
    const audit = auditVectorGridFeasibility(grid);
    assert.equal(typeof audit.feasible, "boolean");
  });
});
