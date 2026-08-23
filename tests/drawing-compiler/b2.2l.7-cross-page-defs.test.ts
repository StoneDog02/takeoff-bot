import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { compileDrawingPage } from "../../src/drawing-compiler/compileDrawingPage.js";
import { buildOrientationDictionary } from "../../src/project-interpreter/buildOrientationDictionary.js";
import { CompilerInvestigationFacade } from "../../src/project-interpreter/compilerInvestigationFacade.js";
import { recoverGraphicConventionReferences } from "../../src/drawing-compiler/plan-annotations/recoverGraphicConventionReferences.js";
import { extractSegments } from "../../src/drawing-compiler/sgg/extractSegments.js";

const PDF = "tests/fixtures/beckstead-residence-plans.pdf";

describe("B2.2L.7 cross-page definitions + orientation compile", () => {
  it("p1 definitions reach p4 compile options via orientation build", async () => {
    const facade = await CompilerInvestigationFacade.create(PDF);
    const built = await buildOrientationDictionary({
      projectId: "beckstead",
      pdfPath: PDF,
      facade,
    });

    assert.ok(built.orientationContext.definitions.length >= 1);
    assert.ok(
      built.orientationContext.definitions.every((d) =>
        /^SW\d/i.test(d.semanticTypeKey),
      ),
    );

    const prevProof = process.env.TAKEOFF_B2_2L3_PROOF;
    process.env.TAKEOFF_B2_2L3_PROOF = "1";
    try {
      const p4 = await compileDrawingPage({
        pdfPath: PDF,
        pageNumber: 4,
        options: {
          smoke: true,
          maxOcr: 4,
          orientationContext: built.orientationContext,
          crossPageDefinitions: built.orientationContext.definitions,
          referenceMechanism: "GRAPHIC_CONVENTION",
        },
      });

      const defsAvailable =
        p4.semanticDereference?.metrics.definitionsAvailable ?? 0;
      assert.ok(defsAvailable >= built.orientationContext.definitions.length);

      const seg = await extractSegments(PDF, 4);
      const compiled = await facade.ensurePageCompiled(4);
      const graphic = recoverGraphicConventionReferences({
        segments: seg.segments,
        pbgRuns: compiled.geometry.pbgRuns,
        pageNumber: 4,
        pageWidth: seg.pageWidth,
        pageHeight: seg.pageHeight,
        orientationContext: built.orientationContext,
        referenceMechanism: "GRAPHIC_CONVENTION",
      });

      if (built.orientationContext.graphicConventionAuthorized) {
        assert.ok(graphic.metrics.referencesEmitted > 0);
        assert.ok(
          graphic.references.every((r) => r.referenceKey === "shear-wall"),
        );
      }
    } finally {
      if (prevProof === undefined) delete process.env.TAKEOFF_B2_2L3_PROOF;
      else process.env.TAKEOFF_B2_2L3_PROOF = prevProof;
    }
  });
});
