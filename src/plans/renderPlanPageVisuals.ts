import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { pdf } from "pdf-to-img";

import type { PlanPageVisual, PlanVisualSet } from "./PlanPageVisual.js";

export interface RenderPlanPageVisualsInput {
  pdfPath: string;
  /** 1-based page numbers to render. Order is preserved in the result. */
  pageNumbers: readonly number[];
  outputDir: string;
  /**
   * pdf.js render scale. 1 ≈ 72 DPI CSS pixels.
   * Default 1 keeps full Beckstead sheets under typical multimodal payload budgets.
   */
  scale?: number;
}

function readPngDimensions(png: Buffer): { widthPx: number; heightPx: number } {
  if (png.length < 24 || png.toString("ascii", 1, 4) !== "PNG") {
    throw new Error("Rendered page is not a valid PNG.");
  }

  return {
    widthPx: png.readUInt32BE(16),
    heightPx: png.readUInt32BE(20),
  };
}

function imageFileName(pageNumber: number): string {
  return `page-${String(pageNumber).padStart(4, "0")}.png`;
}

/**
 * Deterministically renders selected PDF pages to PNG files.
 *
 * Uses pdf.js via pdf-to-img (not OpenDataLoader image extraction). Full page
 * vector content is rasterized; embedded-image extraction alone is insufficient
 * for construction CAD sheets.
 */
export async function renderPlanPageVisuals(
  input: RenderPlanPageVisualsInput,
): Promise<PlanVisualSet> {
  const scale = input.scale ?? 1;
  if (!(scale > 0)) {
    throw new Error(`renderPlanPageVisuals: scale must be positive, got ${scale}.`);
  }

  if (input.pageNumbers.length === 0) {
    throw new Error("renderPlanPageVisuals: pageNumbers must not be empty.");
  }

  const sourcePdfPath = path.resolve(input.pdfPath);
  const outputDir = path.resolve(input.outputDir);
  await mkdir(outputDir, { recursive: true });

  const document = await pdf(sourcePdfPath, { scale });
  const renderedAt = new Date().toISOString();
  const pages: PlanPageVisual[] = [];

  for (const pageNumber of input.pageNumbers) {
    if (!Number.isInteger(pageNumber) || pageNumber < 1) {
      throw new Error(
        `renderPlanPageVisuals: invalid pageNumber ${pageNumber}.`,
      );
    }

    if (pageNumber > document.length) {
      throw new Error(
        `renderPlanPageVisuals: page ${pageNumber} is out of range for '${sourcePdfPath}' (${document.length} pages).`,
      );
    }

    const png = await document.getPage(pageNumber);
    if (!png || png.byteLength === 0) {
      throw new Error(
        `renderPlanPageVisuals: empty render for page ${pageNumber} of '${sourcePdfPath}'.`,
      );
    }

    const buffer = Buffer.from(png);
    const { widthPx, heightPx } = readPngDimensions(buffer);
    if (widthPx < 1 || heightPx < 1) {
      throw new Error(
        `renderPlanPageVisuals: invalid dimensions for page ${pageNumber}.`,
      );
    }

    const imagePath = path.join(outputDir, imageFileName(pageNumber));
    await writeFile(imagePath, buffer);

    pages.push({
      pageNumber,
      sourcePdfPath,
      imagePath,
      mediaType: "image/png",
      widthPx,
      heightPx,
      scale,
      renderedAt,
    });
  }

  return {
    sourcePdfPath,
    pages,
    renderedAt,
  };
}
