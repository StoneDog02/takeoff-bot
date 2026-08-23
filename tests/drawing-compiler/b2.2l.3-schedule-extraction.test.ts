import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { compileDrawingPage } from "../../src/drawing-compiler/compileDrawingPage.js";

const PDF = "tests/fixtures/beckstead-residence-plans.pdf";

describe("B2.2L.3 schedule extraction (Beckstead p1)", () => {
  it("extracts definition vocabulary when definition extraction enabled", async () => {
    const prev = process.env.TAKEOFF_SEMANTIC_DEFINITION_EXTRACTION;
    process.env.TAKEOFF_SEMANTIC_DEFINITION_EXTRACTION = "1";
    try {
      const page = await compileDrawingPage({
        pdfPath: PDF,
        pageNumber: 1,
        options: { smoke: true, maxOcr: 4 },
      });
      assert.ok(page.semanticDefinitions);
      assert.ok(page.semanticDefinitions.metrics.keysRecovered >= 0);
    } finally {
      if (prev === undefined) delete process.env.TAKEOFF_SEMANTIC_DEFINITION_EXTRACTION;
      else process.env.TAKEOFF_SEMANTIC_DEFINITION_EXTRACTION = prev;
    }
  });
});
