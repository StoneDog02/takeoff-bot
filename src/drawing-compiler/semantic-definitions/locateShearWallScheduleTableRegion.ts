import type { Bbox } from "./reconstructTableGridFromSegments.js";
import { locateShearWallScheduleRegion } from "./locateShearWallScheduleRegion.js";
import { renderPagePng } from "../dimensions/dimOwnership.js";
import {
  createScheduleOcrWorker,
  cropBboxFromRaster,
  ocrMarkRegion,
} from "../semantic-mark-recovery/markOcr.js";

const HEADING_SCAN_SCALE = 4;

/** Beckstead S1.1-style sheets place the shear-wall table in the upper schedule band. */
export function locateShearWallTableFractional(input: {
  pageWidth: number;
  pageHeight: number;
}): Bbox {
  return {
    x0: input.pageWidth * 0.12,
    y0: input.pageHeight * 0.28,
    x1: input.pageWidth * 0.62,
    y1: input.pageHeight * 0.4,
  };
}

function isShearWallScheduleHeading(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (
    /SPANS\s+LESS\s+THAN|SUPPORT\s+STUD|COPYRIGHT|ADDITIONS\s+AND\s+REMODELS/i.test(
      t,
    )
  ) {
    return false;
  }
  if (/SHEAR\s*WALL\s*SCHEDULE/i.test(t)) return true;
  if (/SHEAR\s*WALL/i.test(t) && /WALL\s*MARK/i.test(t)) return true;
  if (/SHEAR\s*WALL/i.test(t) && /\bSW\d/i.test(t)) return true;
  return false;
}

/**
 * Content-aware shear-wall schedule table bounds.
 * Scans the upper schedule band for a heading anchor; falls back to fractional band.
 */
export async function locateShearWallScheduleTableRegion(input: {
  pdfPath: string;
  pageNumber: number;
  pageWidth: number;
  pageHeight: number;
}): Promise<{
  tableRegion: Bbox;
  headingRegion: Bbox | null;
  headingText: string | null;
}> {
  const tableDefault = locateShearWallTableFractional({
    pageWidth: input.pageWidth,
    pageHeight: input.pageHeight,
  });

  const scanRegion: Bbox = {
    x0: input.pageWidth * 0.12,
    y0: input.pageHeight * 0.26,
    x1: input.pageWidth * 0.55,
    y1: input.pageHeight * 0.42,
  };

  const rendered = await renderPagePng(
    input.pdfPath,
    input.pageNumber,
    HEADING_SCAN_SCALE,
  );
  const worker = await createScheduleOcrWorker();

  try {
    const bandCount = 20;
    const bandHeight = (scanRegion.y1 - scanRegion.y0) / bandCount;
    let headingY: number | null = null;
    let headingText: string | null = null;
    let headingBand: Bbox | null = null;

    for (let i = 0; i < bandCount; i++) {
      const band: Bbox = {
        x0: scanRegion.x0,
        y0: scanRegion.y0 + bandHeight * i,
        x1: scanRegion.x1,
        y1: scanRegion.y0 + bandHeight * (i + 1),
      };
      const crop = cropBboxFromRaster(
        rendered.png,
        input.pageWidth,
        input.pageHeight,
        band,
      );
      const ocr = await ocrMarkRegion(crop.png, worker);
      const text = ocr.text.replace(/\s+/g, " ").trim();
      if (!isShearWallScheduleHeading(text)) continue;
      if (headingBand == null || band.y0 > headingBand.y0) {
        headingY = band.y1;
        headingText = text;
        headingBand = band;
      }
    }

    const dataHeight = input.pageHeight * 0.11;
    const tableY0 =
      headingY != null
        ? headingY + input.pageHeight * 0.002
        : tableDefault.y0;
    const tableY1 = Math.min(
      tableY0 + dataHeight,
      locateShearWallScheduleRegion({
        pageWidth: input.pageWidth,
        pageHeight: input.pageHeight,
      }).y1,
    );

    return {
      tableRegion: {
        x0: tableDefault.x0,
        y0: Math.min(tableY0, tableY1 - 24),
        x1: tableDefault.x1,
        y1: tableY1,
      },
      headingRegion: headingBand,
      headingText,
    };
  } finally {
    await worker.terminate();
  }
}
