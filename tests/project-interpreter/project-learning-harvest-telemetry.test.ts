import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  harvestProjectLearning,
  odlDocumentHasStructuredContent,
} from "../../src/project-interpreter/projectLearning/harvestProjectLearning.js";
import {
  countStructuredOdlElements,
  projectLearningCandidateSchema,
} from "../../src/project-interpreter/projectLearning/projectLearningTypes.js";
import type { PlanIndex } from "../../src/plans/PlanIndex.js";

describe("project learning harvest Hybrid telemetry", () => {
  it("does not treat image-only ODL documents as structured Hybrid success", () => {
    const imageOnly = {
      kids: [
        {
          type: "image",
          "page number": 1,
          "bounding box": [0, 0, 1, 1],
        },
      ],
    };
    assert.equal(odlDocumentHasStructuredContent(imageOnly, new Set([1])), false);
    assert.equal(countStructuredOdlElements(imageOnly.kids, new Set([1])), 0);
  });

  it("counts tables/headings/paragraphs as structured", () => {
    const structured = {
      kids: [
        {
          type: "table",
          "page number": 1,
          "number of rows": 3,
          "number of columns": 2,
        },
        {
          type: "heading",
          "page number": 1,
          content: "SHEAR WALL SCHEDULE",
        },
      ],
    };
    assert.equal(odlDocumentHasStructuredContent(structured, new Set([1])), true);
    assert.ok(countStructuredOdlElements(structured.kids, new Set([1])) >= 2);
  });

  it("activates OCR fallback telemetry when Hybrid is requested but yield is empty", async () => {
    const planIndex = {
      pdfPath: "/tmp/fixture.pdf",
      pages: [{ pageNumber: 1, textContent: "" }],
    } as unknown as PlanIndex;

    const ocrFallback = [
      projectLearningCandidateSchema.parse({
        id: "pl-ocr-fallback",
        pageNumber: 1,
        sourceKind: "ocr-fullpage",
        elementType: "full-page-ocr",
        rawValue: "SHEAR WALL SCHEDULE SW2 OSB",
        validationStatus: "harvested",
        definitionKind: "shear-wall",
      }),
    ];

    const result = await harvestProjectLearning({
      pdfPath: planIndex.pdfPath,
      pageNumbers: [1],
      preferHybrid: true,
      outputDir: "/tmp/pl-harvest-telemetry-test",
      planIndex,
      allowLiveOdl: false,
      ocrFallbackCandidates: ocrFallback,
    });

    assert.equal(result.telemetry.hybridRequested, true);
    assert.equal(result.telemetry.hybridActuallyUsed, false);
    assert.equal(result.telemetry.hybridFallbackOccurred, true);
    assert.equal(result.telemetry.forceOcrRequested, true);
    assert.equal(result.telemetry.structuredElementsRecovered, 0);
    assert.equal(result.telemetry.ocrFallbackUsed, true);
    assert.equal(result.hybridUsed, false);
    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0]?.sourceKind, "ocr-fullpage");
  });

  it("seed harvest never claims Hybrid success", async () => {
    const planIndex = {
      pdfPath: "/tmp/fixture.pdf",
      pages: [{ pageNumber: 1, textContent: "" }],
    } as unknown as PlanIndex;
    const result = await harvestProjectLearning({
      pdfPath: planIndex.pdfPath,
      pageNumbers: [1],
      preferHybrid: true,
      outputDir: "/tmp/pl-seed",
      planIndex,
      seedCandidates: [
        projectLearningCandidateSchema.parse({
          id: "seed",
          pageNumber: 1,
          sourceKind: "fixture",
          elementType: "table",
          rawValue: "SW2",
          validationStatus: "harvested",
        }),
      ],
    });
    assert.equal(result.telemetry.hybridActuallyUsed, false);
    assert.equal(result.hybridUsed, false);
  });
});
