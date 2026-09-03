import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";

import { PNG } from "pngjs";

import { rotatePng90 } from "../dimensions/dimOwnership.js";

const require = createRequire(import.meta.url);
const Tesseract = require("tesseract.js");

export type MarkOcrWorker = {
  recognize: (pngBuf: Buffer) => Promise<{ text: string; confidence: number }>;
  terminate: () => Promise<void>;
};

export async function createMarkOcrWorker(): Promise<MarkOcrWorker> {
  const worker = await Tesseract.createWorker("eng", 1, {
    logger: () => undefined,
  });
  await worker.setParameters({
    tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789- ",
  });
  return wrapTesseractWorker(worker);
}

/** Schedule cells need punctuation (/, @, quotes) absent from mark-OCR whitelist. */
export async function createScheduleOcrWorker(): Promise<MarkOcrWorker> {
  const worker = await Tesseract.createWorker("eng", 1, {
    logger: () => undefined,
  });
  await worker.setParameters({
    tessedit_char_whitelist:
      "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-/\"@.'° ",
    tessedit_pageseg_mode: "6",
  });
  return wrapTesseractWorker(worker);
}

function wrapTesseractWorker(worker: {
  recognize: (buf: Buffer) => Promise<{ data: { text?: string; confidence?: number } }>;
  terminate: () => Promise<void>;
}): MarkOcrWorker {
  return {
    recognize: async (pngBuf: Buffer) => {
      const result = await worker.recognize(pngBuf);
      return {
        text: String(result.data.text ?? ""),
        confidence: Number(result.data.confidence ?? 0),
      };
    },
    terminate: () => worker.terminate(),
  };
}

export function cropBboxFromRaster(
  pngBuf: Buffer,
  pageWidthPt: number,
  pageHeightPt: number,
  bbox: { x0: number; y0: number; x1: number; y1: number },
  padPx = 8,
): { png: Buffer; width: number; height: number } {
  const src = PNG.sync.read(pngBuf);
  const sx = src.width / pageWidthPt;
  const sy = src.height / pageHeightPt;
  let left = Math.floor(bbox.x0 * sx) - padPx;
  let right = Math.ceil(bbox.x1 * sx) + padPx;
  let top = Math.floor((pageHeightPt - bbox.y1) * sy) - padPx;
  let bottom = Math.ceil((pageHeightPt - bbox.y0) * sy) + padPx;
  left = Math.max(0, left);
  top = Math.max(0, top);
  right = Math.min(src.width, Math.max(left + 1, right));
  bottom = Math.min(src.height, Math.max(top + 1, bottom));
  const w = right - left;
  const h = bottom - top;
  const outPng = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = ((top + y) * src.width + (left + x)) << 2;
      const di = (y * w + x) << 2;
      outPng.data[di] = src.data[si]!;
      outPng.data[di + 1] = src.data[si + 1]!;
      outPng.data[di + 2] = src.data[si + 2]!;
      outPng.data[di + 3] = src.data[si + 3]!;
    }
  }
  return { png: PNG.sync.write(outPng), width: w, height: h };
}

export async function ocrScheduleCell(
  cropPng: Buffer,
  worker: MarkOcrWorker,
): Promise<{ text: string; confidence: number }> {
  const result = await worker.recognize(cropPng);
  return {
    text: String(result.text ?? ""),
    confidence: Number(result.confidence ?? 0),
  };
}

export async function ocrMarkRegion(
  cropPng: Buffer,
  worker: MarkOcrWorker,
): Promise<{ text: string; confidence: number; rotationDeg: number }> {
  const base = PNG.sync.read(cropPng);
  let best = { text: "", confidence: 0, rotationDeg: 0 };

  for (const turns of [0, 1, 3] as const) {
    const rotDeg = turns === 0 ? 0 : turns === 1 ? 90 : 270;
    const img = rotatePng90(base, turns);
    const pngBuf = PNG.sync.write(img);
    const result = await worker.recognize(pngBuf);
    if (result.confidence > best.confidence || result.text.length > best.text.length) {
      best = { text: result.text, confidence: result.confidence, rotationDeg: rotDeg };
    }
  }
  return best;
}

export async function saveCropDebug(
  cropPng: Buffer,
  path: string,
): Promise<void> {
  await writeFile(path, cropPng);
}
