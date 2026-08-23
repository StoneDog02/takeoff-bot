import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { classifyEnclosureAnnotation } from "../../src/drawing-compiler/plan-annotations/classifyPlanAnnotation.js";
import type { EnclosureCandidate } from "../../src/drawing-compiler/semantic-mark-recovery/detectEnclosures.js";

function enc(
  id: string,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): EnclosureCandidate {
  return {
    id,
    bbox: { x0, y0, x1, y1 },
    mid: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 },
    segmentIds: [1],
    widthPt: x1 - x0,
    heightPt: y1 - y0,
  };
}

describe("classifyPlanAnnotation", () => {
  it("classifies large enclosures as room labels", () => {
    const sample = classifyEnclosureAnnotation({
      enc: enc("e1", 0, 0, 120, 90),
      pageNumber: 4,
      pbgRuns: [],
      pageWidth: 1800,
      pageHeight: 1400,
      isSchedulePage: false,
    });
    assert.equal(sample.conventionClass, "room-label");
  });

  it("classifies small square near run as wall-type-tag candidate", () => {
    const sample = classifyEnclosureAnnotation({
      enc: enc("e2", 0, 0, 30, 30),
      pageNumber: 4,
      pbgRuns: [
        {
          physicalRunKey: "physical-run:p4:test",
          wallAuthority: "high",
          centerline: { x1: 40, y1: 15, x2: 200, y2: 15 },
          mid: { x: 100, y: 15 },
        } as never,
      ],
      pageWidth: 1800,
      pageHeight: 1400,
      isSchedulePage: false,
    });
    assert.equal(sample.conventionClass, "wall-type-tag");
  });
});
