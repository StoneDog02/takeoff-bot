import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { renderPagePng } from "../../../drawing-compiler/dimensions/dimOwnership.js";

const require = createRequire(import.meta.url);
const Tesseract = require("tesseract.js");

export type CollectWallAssemblyNoteTextsInput = {
  pdfPath: string;
  /** Pages likely to contain NOTES TO PLAN / general structural notes. */
  pageNumbers?: readonly number[];
  /**
   * Optional directory of `page-NN.txt` OCR caches (e.g. Phase 5D scan output).
   * When present, avoids re-OCR for those pages.
   */
  ocrCacheDir?: string | null;
};

async function ocrPng(png: Buffer): Promise<string> {
  const worker = await Tesseract.createWorker("eng", 1, {
    logger: () => undefined,
  });
  try {
    const result = await worker.recognize(png);
    return String(result.data.text || "").replace(/\s+/g, " ").trim();
  } finally {
    await worker.terminate();
  }
}

async function loadCachedPageText(
  ocrCacheDir: string,
  pageNumber: number,
): Promise<string | null> {
  const file = path.join(
    ocrCacheDir,
    `page-${String(pageNumber).padStart(2, "0")}.txt`,
  );
  try {
    const text = await readFile(file, "utf8");
    return text.trim().length > 0 ? text : null;
  } catch {
    return null;
  }
}

/**
 * Collect note/plan OCR text for wall-assembly fact extraction.
 * Prefer cache when available; otherwise render + OCR selected pages.
 */
export async function collectWallAssemblyNoteTexts(
  input: CollectWallAssemblyNoteTextsInput,
): Promise<string[]> {
  const pageNumbers = input.pageNumbers ?? [1, 3, 4];
  const texts: string[] = [];

  for (const pageNumber of pageNumbers) {
    if (input.ocrCacheDir) {
      const cached = await loadCachedPageText(input.ocrCacheDir, pageNumber);
      if (cached) {
        texts.push(cached);
        continue;
      }
    }
    const rendered = await renderPagePng(input.pdfPath, pageNumber, 1.5);
    texts.push(await ocrPng(rendered.png));
  }

  return texts;
}
