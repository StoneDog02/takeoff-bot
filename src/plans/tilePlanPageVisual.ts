import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PNG } from "pngjs";

import {
  computeTileGrid,
  geometryForCell,
  tileGridCoversPage,
  tileIdForCell,
} from "./computeTileGrid.js";
import type { PlanPageVisual } from "./PlanPageVisual.js";
import type {
  PlanPageTileSet,
  PlanPageVisualTile,
} from "./PlanPageVisualTile.js";
import {
  DEFAULT_PAGE_TILE_GRID,
  DEFAULT_PAGE_TILE_SOURCE_SCALE,
} from "./PlanPageVisualTile.js";
import { renderPlanPageVisuals } from "./renderPlanPageVisuals.js";

export interface TilePlanPageVisualInput {
  /** High-resolution full-page visual used as the crop source. */
  sourcePageVisual: PlanPageVisual;
  outputDir: string;
  columns?: number;
  rows?: number;
  overlapFraction?: number;
}

function cropPng(input: {
  source: PNG;
  x: number;
  y: number;
  width: number;
  height: number;
}): Buffer {
  const { source, x, y, width, height } = input;
  if (
    x < 0 ||
    y < 0 ||
    width < 1 ||
    height < 1 ||
    x + width > source.width ||
    y + height > source.height
  ) {
    throw new Error(
      `tile crop out of bounds: x=${x} y=${y} w=${width} h=${height} on ${source.width}x${source.height}.`,
    );
  }

  const cropped = new PNG({ width, height });
  for (let row = 0; row < height; row += 1) {
    const sourceStart = ((y + row) * source.width + x) * 4;
    const destStart = row * width * 4;
    source.data.copy(
      cropped.data,
      destStart,
      sourceStart,
      sourceStart + width * 4,
    );
  }

  return PNG.sync.write(cropped);
}

/**
 * Crops a deterministic overlapping tile grid from a rendered page visual.
 */
export async function tilePlanPageVisual(
  input: TilePlanPageVisualInput,
): Promise<PlanPageTileSet> {
  const source = input.sourcePageVisual;
  const columns = input.columns ?? DEFAULT_PAGE_TILE_GRID.columns;
  const rows = input.rows ?? DEFAULT_PAGE_TILE_GRID.rows;
  const overlapFraction =
    input.overlapFraction ?? DEFAULT_PAGE_TILE_GRID.overlapFraction;

  const bytes = await readFile(source.imagePath);
  if (bytes.byteLength === 0) {
    throw new Error(
      `tilePlanPageVisual: empty source image at '${source.imagePath}'.`,
    );
  }

  const png = PNG.sync.read(bytes);
  if (png.width !== source.widthPx || png.height !== source.heightPx) {
    throw new Error(
      `tilePlanPageVisual: source metadata ${source.widthPx}x${source.heightPx} does not match PNG ${png.width}x${png.height}.`,
    );
  }

  const grid = computeTileGrid({
    widthPx: png.width,
    heightPx: png.height,
    columns,
    rows,
    overlapFraction,
  });

  if (
    !tileGridCoversPage({
      widthPx: png.width,
      heightPx: png.height,
      cells: grid.cells,
    })
  ) {
    throw new Error(
      `tilePlanPageVisual: computed grid does not cover page ${source.pageNumber}.`,
    );
  }

  const outputDir = path.resolve(input.outputDir);
  await mkdir(outputDir, { recursive: true });

  const renderedAt = new Date().toISOString();
  const tiles: PlanPageVisualTile[] = [];

  for (const cell of grid.cells) {
    const tileId = tileIdForCell(cell.row, cell.col);
    const imagePath = path.join(
      outputDir,
      `page-${String(source.pageNumber).padStart(4, "0")}-${tileId}.png`,
    );
    const cropped = cropPng({
      source: png,
      x: cell.x,
      y: cell.y,
      width: cell.width,
      height: cell.height,
    });
    if (cropped.byteLength === 0) {
      throw new Error(
        `tilePlanPageVisual: empty crop for page ${source.pageNumber} ${tileId}.`,
      );
    }
    await writeFile(imagePath, cropped);

    tiles.push({
      pageNumber: source.pageNumber,
      tileId,
      sourcePdfPath: source.sourcePdfPath,
      sourcePageImagePath: source.imagePath,
      imagePath,
      mediaType: "image/png",
      widthPx: cell.width,
      heightPx: cell.height,
      geometry: geometryForCell({
        cell,
        pageWidthPx: png.width,
        pageHeightPx: png.height,
        overlapFraction: grid.overlapFraction,
        columns: grid.columns,
        rows: grid.rows,
      }),
      renderedAt,
    });
  }

  return {
    pageNumber: source.pageNumber,
    sourcePdfPath: source.sourcePdfPath,
    sourcePageImagePath: source.imagePath,
    sourceWidthPx: png.width,
    sourceHeightPx: png.height,
    tiles,
    renderedAt,
  };
}

export interface RenderAndTilePlanPagesInput {
  pdfPath: string;
  pageNumbers: readonly number[];
  /** Directory for scale-1 (or contextScale) full-page context renders. */
  fullPageOutputDir: string;
  /** Directory for high-res tile-source renders. */
  tileSourceOutputDir: string;
  /** Directory for cropped tile PNGs. */
  tileOutputDir: string;
  contextScale?: number;
  tileSourceScale?: number;
  columns?: number;
  rows?: number;
  overlapFraction?: number;
}

export interface RenderAndTilePlanPagesResult {
  fullPages: PlanPageVisual[];
  tileSets: PlanPageTileSet[];
}

/**
 * Renders full-page context visuals plus higher-resolution overlapping tiles
 * for the requested pages.
 */
export async function renderAndTilePlanPages(
  input: RenderAndTilePlanPagesInput,
): Promise<RenderAndTilePlanPagesResult> {
  const contextScale = input.contextScale ?? 1;
  const tileSourceScale =
    input.tileSourceScale ?? DEFAULT_PAGE_TILE_SOURCE_SCALE;

  const fullPageSet = await renderPlanPageVisuals({
    pdfPath: input.pdfPath,
    pageNumbers: input.pageNumbers,
    outputDir: input.fullPageOutputDir,
    scale: contextScale,
  });

  const tileSourceSet = await renderPlanPageVisuals({
    pdfPath: input.pdfPath,
    pageNumbers: input.pageNumbers,
    outputDir: input.tileSourceOutputDir,
    scale: tileSourceScale,
  });

  const tileSets: PlanPageTileSet[] = [];
  for (const sourcePageVisual of tileSourceSet.pages) {
    const pageTileDir = path.join(
      input.tileOutputDir,
      `page-${String(sourcePageVisual.pageNumber).padStart(4, "0")}`,
    );
    tileSets.push(
      await tilePlanPageVisual({
        sourcePageVisual,
        outputDir: pageTileDir,
        columns: input.columns,
        rows: input.rows,
        overlapFraction: input.overlapFraction,
      }),
    );
  }

  return {
    fullPages: fullPageSet.pages,
    tileSets,
  };
}
