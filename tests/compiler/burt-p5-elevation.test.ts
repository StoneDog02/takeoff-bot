import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";

import { compileDrawingPage } from "../../src/compiler/compileDrawingPage.js";
import { buildGeometryEvidenceFromCompiledPages } from "../../src/framing/geometry/buildGeometryEvidenceFromCompiledPages.js";
import { mergeExtractedAndGeometryEvidence } from "../../src/framing/geometry/mergeExtractedAndGeometryEvidence.js";

describe("burt p5 elevation merge boundary", () => {
  it(
    "produces zero wall-plan length geometry Evidence after merge",
    { timeout: 120_000 },
    async () => {
      const compiled = await compileDrawingPage({
        pdfPath: path.join("tests", "fixtures", "burt-build-plans.pdf"),
        pageNumber: 5,
      });

      assert.equal(compiled.pageRole.role, "elevation");
      assert.equal(compiled.pageRole.allowsWallPlanLengthEvidence, false);

      const geometryEvidence = buildGeometryEvidenceFromCompiledPages([compiled]);
      assert.equal(geometryEvidence.length, 0);

      const merged = mergeExtractedAndGeometryEvidence({
        claudeEvidence: [],
        geometryEvidence,
      });
      assert.equal(merged.evidence.length, 0);
    },
  );
});
