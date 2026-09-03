import assert from "node:assert/strict";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { sourceLocationSchema } from "../../src/core/schemas/source.schema.js";
import {
  computeTileGrid,
  tileGridCoversPage,
  tileIdForCell,
} from "../../src/pdf/computeTileGrid.js";
import { indexPlan } from "../../src/pdf/indexPlan.js";
import { pageNeedsVisual } from "../../src/pdf/pageNeedsVisual.js";
import { renderPlanPageVisuals } from "../../src/pdf/renderPlanPageVisuals.js";
import {
  DEFAULT_PAGE_TILE_GRID,
  DEFAULT_PAGE_TILE_SOURCE_SCALE,
} from "../../src/pdf/PlanPageVisualTile.js";
import { tilePlanPageVisual } from "../../src/pdf/tilePlanPageVisual.js";
import {
  buildExtractionUserContent,
  MAX_VISUAL_IMAGES_PER_EXTRACTION_REQUEST,
  resolvePageTilesForExtraction,
} from "../../src/framing/prompts/extractFramingEvidence.js";
import { countVisualImageBlocks } from "../../src/pdf/buildPlanPagesUserContent.js";

const fixturesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures",
);
const becksteadPdf = path.join(fixturesDir, "beckstead-residence-plans.pdf");
const wallPdf = path.join(fixturesDir, "wall-w001-text-layer.pdf");

describe("computeTileGrid", () => {
  it("covers every sampled page pixel with deterministic overlapping cells", () => {
    const grid = computeTileGrid({
      widthPx: 2592,
      heightPx: 1728,
      columns: DEFAULT_PAGE_TILE_GRID.columns,
      rows: DEFAULT_PAGE_TILE_GRID.rows,
      overlapFraction: DEFAULT_PAGE_TILE_GRID.overlapFraction,
    });

    assert.equal(grid.cells.length, 12);
    assert.equal(tileIdForCell(0, 0), "t-r0-c0");
    assert.equal(tileIdForCell(2, 3), "t-r2-c3");
    assert.ok(
      tileGridCoversPage({
        widthPx: 2592,
        heightPx: 1728,
        cells: grid.cells,
      }),
    );

    // Adjacent tiles overlap in x for non-edge pairs.
    const a = grid.cells.find((cell) => cell.row === 0 && cell.col === 0);
    const b = grid.cells.find((cell) => cell.row === 0 && cell.col === 1);
    assert.ok(a && b);
    assert.ok(a.x + a.width > b.x);
  });

  it("pins final row/column to the page edge", () => {
    const grid = computeTileGrid({
      widthPx: 1000,
      heightPx: 800,
      columns: 3,
      rows: 2,
      overlapFraction: 0.2,
    });
    const last = grid.cells.at(-1);
    assert.ok(last);
    assert.equal(last.x + last.width, 1000);
    assert.equal(last.y + last.height, 800);
  });
});

describe("tilePlanPageVisual", () => {
  it("tiles a Beckstead page with stable ids, dimensions, and coverage", async () => {
    const root = path.resolve("artifacts/beckstead-b1.2/test-tile-page");
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });

    const sourceSet = await renderPlanPageVisuals({
      pdfPath: becksteadPdf,
      pageNumbers: [1],
      outputDir: path.join(root, "source"),
      scale: DEFAULT_PAGE_TILE_SOURCE_SCALE,
    });
    const source = sourceSet.pages[0];
    assert.ok(source);

    const tileSet = await tilePlanPageVisual({
      sourcePageVisual: source,
      outputDir: path.join(root, "tiles"),
    });

    assert.equal(tileSet.tiles.length, 12);
    assert.deepEqual(
      tileSet.tiles.map((tile) => tile.tileId),
      [
        "t-r0-c0",
        "t-r0-c1",
        "t-r0-c2",
        "t-r0-c3",
        "t-r1-c0",
        "t-r1-c1",
        "t-r1-c2",
        "t-r1-c3",
        "t-r2-c0",
        "t-r2-c1",
        "t-r2-c2",
        "t-r2-c3",
      ],
    );

    for (const tile of tileSet.tiles) {
      assert.equal(tile.pageNumber, 1);
      assert.equal(tile.mediaType, "image/png");
      assert.ok(tile.widthPx > 100);
      assert.ok(tile.heightPx > 100);
      const fileStat = await stat(tile.imagePath);
      assert.ok(fileStat.size > 1000);
      const bytes = await readFile(tile.imagePath);
      assert.equal(bytes.toString("ascii", 1, 4), "PNG");
      assert.equal(tile.sourcePageImagePath, source.imagePath);
      assert.ok(tile.geometry.normalizedWidth > 0);
      assert.ok(tile.geometry.normalizedHeight > 0);
    }

    // Full-page visual remains available independently.
    assert.equal(source.pageNumber, 1);
    assert.ok((await stat(source.imagePath)).size > 1000);
  });
});

describe("Stage 5 tiled multimodal construction", () => {
  it("labels full sheet + tiles with pageNumber and tileId provenance", async () => {
    const root = path.resolve("artifacts/beckstead-b1.2/test-stage5-tiles");
    await rm(root, { recursive: true, force: true });

    const fullPages = await renderPlanPageVisuals({
      pdfPath: becksteadPdf,
      pageNumbers: [4],
      outputDir: path.join(root, "full"),
      scale: 1,
    });
    const tileSource = await renderPlanPageVisuals({
      pdfPath: becksteadPdf,
      pageNumbers: [4],
      outputDir: path.join(root, "tile-source"),
      scale: DEFAULT_PAGE_TILE_SOURCE_SCALE,
    });
    const tileSet = await tilePlanPageVisual({
      sourcePageVisual: tileSource.pages[0]!,
      outputDir: path.join(root, "tiles"),
    });

    const page = {
      pageNumber: 4,
      sheetId: null,
      label: null,
      textContent: "",
    };

    const userContent = await buildExtractionUserContent({
      pages: [page],
      buildingAssemblies: { assemblyNames: [], notes: [] },
      visualsByPageNumber: new Map([[4, fullPages.pages[0]!]]),
      tilesByPageNumber: new Map([[4, tileSet.tiles]]),
    });

    const imageCount = userContent.filter((block) => block.type === "image").length;
    assert.equal(imageCount, 1 + tileSet.tiles.length);
    assert.ok(
      userContent.some(
        (block) =>
          block.type === "text" &&
          block.text.includes("## Page 4 — Full Sheet") &&
          block.text.includes("source.tileId to null"),
      ),
    );
    assert.ok(
      userContent.some(
        (block) =>
          block.type === "text" &&
          block.text.includes("## Page 4 — Tile t-r0-c0") &&
          block.text.includes("tileId=t-r0-c0") &&
          block.text.includes('source.tileId to "t-r0-c0"') &&
          block.text.includes("Provenance label only"),
      ),
    );
    assert.ok(
      !userContent.some(
        (block) =>
          block.type === "text" &&
          /wall schedule|roof plan|header schedule/i.test(block.text),
      ),
    );
  });

  it("does not tile text-rich pages", async () => {
    const planIndex = await indexPlan(wallPdf);
    assert.equal(pageNeedsVisual(planIndex.pages[0]!), false);

    const tiles = await resolvePageTilesForExtraction({
      planIndex,
      pages: planIndex.pages,
      tileOutputDir: path.resolve("artifacts/beckstead-b1.2/should-not-tile"),
    });
    assert.equal(tiles.size, 0);
  });

  it("fails loudly when multimodal image budget would be exceeded", () => {
    const pages = Array.from({ length: 3 }, (_, index) => ({
      pageNumber: index + 1,
      sheetId: null,
      label: null,
      textContent: "",
    }));
    const visualsByPageNumber = new Map(
      pages.map((page) => [
        page.pageNumber,
        {
          pageNumber: page.pageNumber,
          sourcePdfPath: becksteadPdf,
          imagePath: "/tmp/missing-full.png",
          mediaType: "image/png" as const,
          widthPx: 100,
          heightPx: 100,
          scale: 1,
          renderedAt: new Date().toISOString(),
        },
      ]),
    );
    const tilesByPageNumber = new Map(
      pages.map((page) => [
        page.pageNumber,
        Array.from({ length: 12 }, (_, tileIndex) => ({
          pageNumber: page.pageNumber,
          tileId: `t-r${Math.floor(tileIndex / 4)}-c${tileIndex % 4}`,
          sourcePdfPath: becksteadPdf,
          sourcePageImagePath: "/tmp/missing-source.png",
          imagePath: `/tmp/missing-tile-${page.pageNumber}-${tileIndex}.png`,
          mediaType: "image/png" as const,
          widthPx: 100,
          heightPx: 100,
          geometry: {
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            normalizedX: 0,
            normalizedY: 0,
            normalizedWidth: 0.25,
            normalizedHeight: 0.33,
            row: Math.floor(tileIndex / 4),
            col: tileIndex % 4,
            overlapFraction: 0.2,
            gridColumns: 4,
            gridRows: 3,
          },
          renderedAt: new Date().toISOString(),
        })),
      ]),
    );

    const imageCount = countVisualImageBlocks({
      pages,
      visualsByPageNumber,
      tilesByPageNumber,
    });
    assert.ok(imageCount > MAX_VISUAL_IMAGES_PER_EXTRACTION_REQUEST);
  });

  it("fails loudly on missing tile image paths during content construction", async () => {
    await assert.rejects(
      () =>
        buildExtractionUserContent({
          pages: [
            {
              pageNumber: 1,
              sheetId: null,
              label: null,
              textContent: "",
            },
          ],
          buildingAssemblies: { assemblyNames: [], notes: [] },
          tilesByPageNumber: new Map([
            [
              1,
              [
                {
                  pageNumber: 1,
                  tileId: "t-r0-c0",
                  sourcePdfPath: becksteadPdf,
                  sourcePageImagePath: "/tmp/missing-source.png",
                  imagePath: "/tmp/definitely-missing-tile.png",
                  mediaType: "image/png",
                  widthPx: 10,
                  heightPx: 10,
                  geometry: {
                    x: 0,
                    y: 0,
                    width: 10,
                    height: 10,
                    normalizedX: 0,
                    normalizedY: 0,
                    normalizedWidth: 1,
                    normalizedHeight: 1,
                    row: 0,
                    col: 0,
                    overlapFraction: 0.2,
                    gridColumns: 1,
                    gridRows: 1,
                  },
                  renderedAt: new Date().toISOString(),
                },
              ],
            ],
          ]),
        }),
      /no such file|ENOENT|empty image/i,
    );
  });
});

describe("Evidence tile provenance contract", () => {
  it("accepts optional tileId while remaining backward compatible", () => {
    const withTile = sourceLocationSchema.parse({
      page: {
        documentId: null,
        pageNumber: 4,
        sheetId: null,
        sheetTitle: null,
        pageLabel: null,
        revision: null,
      },
      region: {
        coordinateSpace: "normalized",
        x: 0.25,
        y: 0.33,
        width: 0.3,
        height: 0.3,
      },
      tileId: "t-r1-c1",
    });
    assert.equal(withTile.tileId, "t-r1-c1");

    const legacy = sourceLocationSchema.parse({
      page: {
        documentId: null,
        pageNumber: 1,
        sheetId: "A2.01",
        sheetTitle: null,
        pageLabel: null,
        revision: null,
      },
      region: null,
    });
    assert.equal(legacy.tileId, null);
  });
});
