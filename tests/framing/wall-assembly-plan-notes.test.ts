import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";

import {
  classifyStudSizeFromThicknessInches,
  extractWallAssemblyPlanNoteFacts,
} from "../../src/framing/geometry/extractWallAssemblyPlanNoteFacts.js";
import { buildWallAssemblyEvidenceFromPlanNotes } from "../../src/framing/geometry/buildWallAssemblyEvidenceFromPlanNotes.js";
import type { CompiledDrawingPage } from "../../src/compiler/schemas/compiledDrawingPage.schema.js";

describe("wall assembly plan note extraction", () => {
  it("extracts spacing, double top plates, and thickness legend from Beckstead OCR", async () => {
    const ocrDir = path.join(process.cwd(), "artifacts/b2.2m.2/ocr");
    const texts = await Promise.all(
      ["page-01.txt", "page-03.txt", "page-04.txt"].map((f) =>
        readFile(path.join(ocrDir, f), "utf8"),
      ),
    );
    const facts = extractWallAssemblyPlanNoteFacts(texts);
    assert.equal(facts.studSpacingInches, 16);
    assert.deepEqual(facts.studSpacingAppliesTo, ["bearing", "shear", "braced"]);
    assert.ok(facts.doubleTopPlatesFor.includes("bearing"));
    assert.ok(facts.doubleTopPlatesFor.includes("exterior"));
    assert.ok(facts.thicknessLegend);
    assert.equal(facts.thicknessLegend!.studSize2x4Inches, 3.5);
    assert.equal(facts.thicknessLegend!.studSize2x6Inches, 5.5);
  });

  it("classifies stud size from thickness inches", () => {
    const legend = { studSize2x4Inches: 3.5, studSize2x6Inches: 5.5 };
    assert.equal(classifyStudSizeFromThicknessInches(3.4, legend), "2x4");
    assert.equal(classifyStudSizeFromThicknessInches(5.6, legend), "2x6");
    assert.equal(classifyStudSizeFromThicknessInches(10, legend), null);
  });

  it("emits assembly Evidence for shear-bound run without inventing SW subtype", () => {
    const factsText = [
      'BEARING AND EXTERIOR WALLS SHALL BE CAPPED WITH DOUBLE TOP PLATES. ALL BEARING, SHEAR, AND BRACED WALLS SHALL HAVE STUDS PLACED AT 16" O.C. MAXIMUM, UNLESS NOTED OTHERWISE. 2x4 WALLS ARE SHOWN WITH A 3-1/2" THICKNESS AND 2x6 WALLS WITH A 5-1/2" THICKNESS.',
    ];
    const page = {
      pageNumber: 4,
      ptPerFt: 18,
      pageRole: {
        role: "plan",
        allowsWallPlanLengthEvidence: true,
        planHits: [],
        elevationHits: [],
        sectionHits: [],
        detailHits: [],
        rawItemCount: 0,
        method: "test",
      },
      geometry: {
        pbgRuns: [
          {
            id: "run-1",
            physicalRunKey: "physical-run:p4:test",
            pageNumber: 4,
            orientation: "H",
            sourceCandidateIds: [],
            faceSegmentIds: [],
            thicknessPt: 5.25,
            centerline: { x1: 0, y1: 0, x2: 180, y2: 0 },
            endpoints: [
              { x: 0, y: 0 },
              { x: 180, y: 0 },
            ],
            lengthPt: 180,
            mid: { x: 90, y: 0 },
            openingGapSuspects: [],
            junctions: [],
            connectedRunIds: [],
            wallAuthority: "high",
            authorityScore: 1,
            authorityReasons: [],
          },
        ],
      },
      governance: { emitDimIds: ["d1"], scaleByDim: {} },
      ownership: {
        associations: [
          {
            dimId: "d1",
            physicalRunKey: "physical-run:p4:test",
            parse: { status: "ok", feet: 10, originalText: "10'" },
          },
        ],
      },
      transcriptions: [],
    } as unknown as CompiledDrawingPage;

    const evidence = buildWallAssemblyEvidenceFromPlanNotes({
      pages: [page],
      noteTexts: factsText,
      dictionary: {
        bindings: [
          {
            status: "established_binding",
            physicalRunKey: "physical-run:p4:test",
            referenceKey: "shear-wall",
            mechanism: "graphic-convention",
            provenance: [],
          },
        ],
      } as never,
    });

    assert.ok(evidence.some((e) => e.propertyPath === "assembly.studSpacingInches"));
    assert.ok(evidence.some((e) => e.propertyPath === "assembly.plateCount"));
    assert.ok(evidence.some((e) => e.propertyPath === "assembly.studSize"));
    assert.ok(
      !evidence.some(
        (e) => e.propertyPath === "semanticTypeKey" && e.candidateValue === "SW4",
      ),
    );
    const stud = evidence.find((e) => e.propertyPath === "assembly.studSize");
    assert.equal(stud?.candidateValue, "2x4");
  });
});
