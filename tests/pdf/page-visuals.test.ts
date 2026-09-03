import assert from "node:assert/strict";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { indexPlan } from "../../src/pdf/indexPlan.js";
import { pageNeedsVisual } from "../../src/pdf/pageNeedsVisual.js";
import { renderPlanPageVisuals } from "../../src/pdf/renderPlanPageVisuals.js";
import {
  buildExtractionUserContent,
  resolvePageVisualsForExtraction,
} from "../../src/framing/prompts/extractFramingEvidence.js";

const fixturesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures",
);
const becksteadPdf = path.join(fixturesDir, "beckstead-residence-plans.pdf");
const syntheticPdf = path.join(
  fixturesDir,
  "realistic-residential-framing-plan-text-layer.pdf",
);
const wallPdf = path.join(fixturesDir, "wall-w001-text-layer.pdf");

describe("renderPlanPageVisuals", () => {
  it("renders all 11 Beckstead pages deterministically with stable page mapping", async () => {
    const outputDir = path.resolve(
      "artifacts/beckstead-b1.1/test-renders-all-pages",
    );
    await rm(outputDir, { recursive: true, force: true });
    await mkdir(outputDir, { recursive: true });

    const pageNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    const rendered = await renderPlanPageVisuals({
      pdfPath: becksteadPdf,
      pageNumbers,
      outputDir,
      scale: 1,
    });

    assert.equal(rendered.pages.length, 11);
    assert.deepEqual(
      rendered.pages.map((page) => page.pageNumber),
      pageNumbers,
    );

    for (const visual of rendered.pages) {
      const fileStat = await stat(visual.imagePath);
      assert.ok(fileStat.size > 1000, `page ${visual.pageNumber} image too small`);
      assert.equal(visual.mediaType, "image/png");
      assert.ok(visual.widthPx > 100);
      assert.ok(visual.heightPx > 100);

      const bytes = await readFile(visual.imagePath);
      assert.equal(bytes.toString("ascii", 1, 4), "PNG");
      assert.equal(
        path.basename(visual.imagePath),
        `page-${String(visual.pageNumber).padStart(4, "0")}.png`,
      );
    }
  });

  it("preserves synthetic text-layer PDF indexing when visuals are not required", async () => {
    const planIndex = await indexPlan(syntheticPdf);
    assert.ok(planIndex.totalPages >= 1);
    assert.ok(planIndex.pages.every((page) => !pageNeedsVisual(page)));
    assert.ok(planIndex.pages.some((page) => /W1|WALL|FLOOR|ROOF/i.test(page.textContent)));
  });
});

describe("Stage 5 multimodal message construction", () => {
  it("includes image blocks for empty-text pages and text blocks when text exists", async () => {
    const outputDir = path.resolve(
      "artifacts/beckstead-b1.1/test-message-construction",
    );
    await rm(outputDir, { recursive: true, force: true });
    await mkdir(outputDir, { recursive: true });

    const emptyPage = {
      pageNumber: 1,
      sheetId: null,
      label: null,
      textContent: "",
    };
    const textPage = {
      pageNumber: 2,
      sheetId: null,
      label: null,
      textContent: "W-001\n2x4 @ 16 in O.C.",
    };

    const visuals = await renderPlanPageVisuals({
      pdfPath: becksteadPdf,
      pageNumbers: [1],
      outputDir,
      scale: 1,
    });

    const userContent = await buildExtractionUserContent({
      pages: [emptyPage, textPage],
      buildingAssemblies: {
        assemblyNames: ["exterior-wood-stud-wall"],
        notes: [],
      },
      visualsByPageNumber: new Map([
        [1, visuals.pages[0]!],
      ]),
    });

    const imageBlocks = userContent.filter((block) => block.type === "image");
    const textBlocks = userContent.filter((block) => block.type === "text");

    assert.equal(imageBlocks.length, 1);
    assert.ok(textBlocks.some((block) => block.type === "text" && block.text.includes("## Page 1")));
    assert.ok(textBlocks.some((block) => block.type === "text" && block.text.includes("pageNumber=1")));
    assert.ok(textBlocks.some((block) => block.type === "text" && block.text.includes("## Page 2")));
    assert.ok(textBlocks.some((block) => block.type === "text" && block.text.includes("W-001")));
    assert.ok(
      textBlocks.some(
        (block) =>
          block.type === "text" &&
          block.text.includes("empty — no usable machine-readable text layer"),
      ),
    );

    const image = imageBlocks[0];
    assert.equal(image?.type, "image");
    if (image?.type === "image" && image.source.type === "base64") {
      assert.equal(image.source.media_type, "image/png");
      assert.ok(image.source.data.length > 100);
    }
  });

  it("does not render visuals for text-rich pages during resolvePageVisualsForExtraction", async () => {
    const planIndex = await indexPlan(wallPdf);
    const pages = planIndex.pages;
    assert.equal(pages.length, 1);
    assert.equal(pageNeedsVisual(pages[0]!), false);

    const visuals = await resolvePageVisualsForExtraction({
      planIndex,
      pages,
      visualOutputDir: path.resolve("artifacts/beckstead-b1.1/should-not-render"),
    });

    assert.equal(visuals.size, 0);
  });
});
