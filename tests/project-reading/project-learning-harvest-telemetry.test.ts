import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  harvestProjectLearning,
  odlDocumentHasStructuredContent,
} from "../../src/project-reading/projectLearning/harvestProjectLearning.js";
import {
  countStructuredOdlElements,
  projectLearningCandidateSchema,
} from "../../src/project-reading/projectLearning/projectLearningTypes.js";
import type { PlanIndex } from "../../src/pdf/PlanIndex.js";

function fixturePlanIndex(odlDocument?: unknown): PlanIndex {
  return {
    pdfPath: "/tmp/fixture.pdf",
    totalPages: 1,
    indexedAt: "2026-01-01T00:00:00.000Z",
    sourceContentHash: "a".repeat(64),
    pages: [
      {
        pageNumber: 1,
        sheetId: "S1.1",
        label: "S1.1",
        textContent: "",
      },
    ],
    odlDocument,
  };
}

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
    const planIndex = fixturePlanIndex();

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

  it("reuses structured ODL from indexPlan without a second convert", async () => {
    const odlDocument = {
      kids: [
        {
          type: "table",
          "page number": 1,
          content: "WOOD BEAM / HEADER SCHEDULE WB2",
          "number of rows": 4,
          "number of columns": 3,
        },
      ],
    };
    const planIndex = fixturePlanIndex(odlDocument);
    const outputDir = await mkdtemp(path.join(tmpdir(), "pl-indexed-odl-reuse-"));
    let convertCalls = 0;

    const result = await harvestProjectLearning({
      pdfPath: planIndex.pdfPath,
      pageNumbers: [1],
      preferHybrid: true,
      outputDir,
      planIndex,
      allowLiveOdl: true,
      skipHybridServerEnsure: true,
      convertDocument: async () => {
        convertCalls += 1;
        throw new Error("convert must not run when indexed ODL is reused");
      },
    });

    assert.equal(result.telemetry.indexedOdlReused, true);
    assert.equal(convertCalls, 0);
    assert.ok(result.telemetry.structuredElementsRecovered > 0);
    assert.ok(result.candidates.length > 0);
    assert.equal(result.hybridUsed, false);
    assert.equal(result.rawArtifactPaths.length, 1);
    const persisted = JSON.parse(
      await readFile(path.join(outputDir, "indexed-odl.json"), "utf8"),
    ) as unknown;
    assert.deepEqual(persisted, odlDocument);
  });

  it("skips indexed ODL reuse for image-only documents so Hybrid/OCR harvest can run", async () => {
    const planIndex = fixturePlanIndex({
      kids: [
        {
          type: "image",
          "page number": 1,
          "bounding box": [0, 0, 1, 1],
        },
      ],
    });

    const result = await harvestProjectLearning({
      pdfPath: planIndex.pdfPath,
      pageNumbers: [1],
      preferHybrid: true,
      outputDir: "/tmp/pl-indexed-odl-image-only",
      planIndex,
      allowLiveOdl: false,
      ocrFallbackCandidates: ocrFallback,
    });

    assert.equal(result.telemetry.indexedOdlReused, false);
    assert.equal(result.telemetry.ocrFallbackUsed, true);
    assert.equal(result.telemetry.hybridFallbackOccurred, true);
    assert.equal(result.candidates[0]?.sourceKind, "ocr-fullpage");
  });

  it("skips indexed ODL reuse when structured kids are empty", async () => {
    const planIndex = fixturePlanIndex({ kids: [] });

    const result = await harvestProjectLearning({
      pdfPath: planIndex.pdfPath,
      pageNumbers: [1],
      preferHybrid: true,
      outputDir: "/tmp/pl-indexed-odl-empty",
      planIndex,
      allowLiveOdl: false,
      ocrFallbackCandidates: ocrFallback,
    });

    assert.equal(result.telemetry.indexedOdlReused, false);
    assert.equal(result.telemetry.ocrFallbackUsed, true);
    assert.equal(result.candidates[0]?.sourceKind, "ocr-fullpage");
  });

  it("seed harvest never claims Hybrid success", async () => {
    const planIndex = fixturePlanIndex();
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
