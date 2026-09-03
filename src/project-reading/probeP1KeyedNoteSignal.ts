import { renderPagePng } from "../compiler/dimensions/dimOwnership.js";
import {
  createScheduleOcrWorker,
  cropBboxFromRaster,
  ocrScheduleCell,
} from "../compiler/semantic-mark-recovery/markOcr.js";
import { locateGeneralNotesRegion } from "../compiler/semantic-definitions/locateShearWallScheduleRegion.js";
import type { Bbox } from "../compiler/semantic-definitions/reconstructTableGridFromSegments.js";

const OCR_SCALE = 5;

export type KeyedNoteProbeResult = {
  pageNumber: number;
  region: Bbox;
  ocrText: string;
  hasSwKeyedNote: boolean;
  matchedSnippets: string[];
};

export function evaluateKeyedNoteShearWallSignal(
  ocrText: string,
  options?: { scheduleDefinitionsOnPage?: boolean },
): boolean {
  const text = ocrText.replace(/\s+/g, " ").trim();
  if (
    /SW_/i.test(text) &&
    (/SHEAR/i.test(text) || /SCHEDULE/i.test(text) || /INDICATES/i.test(text))
  ) {
    return true;
  }
  if (options?.scheduleDefinitionsOnPage && /SHEAR\s*WALL/i.test(text)) {
    return true;
  }
  return false;
}

/**
 * OCR probe for S1.1-style general/keyed notes (SW_ shear wall vocabulary).
 */
export async function probeP1KeyedNoteSignal(input: {
  pdfPath: string;
  pageNumber: number;
  pageWidth: number;
  pageHeight: number;
  scheduleDefinitionsOnPage?: boolean;
}): Promise<KeyedNoteProbeResult> {
  const region = locateGeneralNotesRegion({
    pageWidth: input.pageWidth,
    pageHeight: input.pageHeight,
  });
  const rendered = await renderPagePng(
    input.pdfPath,
    input.pageNumber,
    OCR_SCALE,
  );
  const worker = await createScheduleOcrWorker();
  try {
    const crop = cropBboxFromRaster(
      rendered.png,
      input.pageWidth,
      input.pageHeight,
      region,
    );
    const ocr = await ocrScheduleCell(crop.png, worker);
    const text = ocr.text.replace(/\s+/g, " ").trim();
    const matchedSnippets: string[] = [];
    if (/SW_/i.test(text)) matchedSnippets.push("SW_");
    if (/SHEAR\s*WALL/i.test(text)) matchedSnippets.push("SHEAR WALL");
    if (/SHEARWALL/i.test(text)) matchedSnippets.push("SHEARWALL");
    if (/INDICATES/i.test(text)) matchedSnippets.push("INDICATES");
    const hasSwKeyedNote = evaluateKeyedNoteShearWallSignal(text, {
      scheduleDefinitionsOnPage: input.scheduleDefinitionsOnPage,
    });
    return {
      pageNumber: input.pageNumber,
      region,
      ocrText: text.slice(0, 2000),
      hasSwKeyedNote,
      matchedSnippets,
    };
  } finally {
    await worker.terminate();
  }
}

export function extractKeyedNoteCitationSnippet(ocrText: string): string | null {
  const normalized = ocrText.replace(/\s+/g, " ");
  const match = normalized.match(
    /[^.]{0,40}SW_[^.]{0,80}(?:SHEAR|SCHEDULE)[^.]{0,40}/i,
  );
  if (match) return match[0].trim().slice(0, 120);
  if (/SW_/i.test(normalized) && /SHEAR/i.test(normalized)) {
    const idx = normalized.search(/SW_/i);
    return normalized.slice(Math.max(0, idx - 20), idx + 80).trim();
  }
  return null;
}
