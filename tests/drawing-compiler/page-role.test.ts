import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { classifyCompilerPageRole } from "../../src/drawing-compiler/page-role/classifyCompilerPageRole.js";
import type { TextPrimitive } from "../../src/drawing-compiler/text/extractTextPrimitives.js";

function primitive(rawText: string): TextPrimitive {
  return {
    id: "t1",
    pageNumber: 1,
    rawText,
    bbox: { x0: 0, y0: 0, x1: 10, y1: 10 },
    orientation: "H",
    sourceAuthority: "pdf-text-layer",
    confidence: null,
    parseStatus: "unresolved",
    parsedFeet: null,
    provenance: {},
    mid: { x: 5, y: 5 },
  };
}

describe("classifyCompilerPageRole", () => {
  it("empty text layer → unknown (Evidence-eligible)", () => {
    const r = classifyCompilerPageRole([], { rawItemCount: 0 });
    assert.equal(r.role, "unknown");
    assert.equal(r.allowsWallPlanLengthEvidence, true);
  });

  it("elevation token beats plan token", () => {
    const r = classifyCompilerPageRole([
      primitive("FIRST FLOOR PLAN"),
      primitive("NORTH ELEVATION"),
    ]);
    assert.equal(r.role, "elevation");
    assert.equal(r.allowsWallPlanLengthEvidence, false);
  });

  it("plan token → plan", () => {
    const r = classifyCompilerPageRole([primitive("FIRST FLOOR FRAMING PLAN")]);
    assert.equal(r.role, "plan");
    assert.equal(r.allowsWallPlanLengthEvidence, true);
  });
});
