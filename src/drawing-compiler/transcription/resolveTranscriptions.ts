/**
 * B2.2H — transcription authority stack:
 *   pdf-text-layer → localized-ocr (normal-offset band) → unresolved
 * Frozen uniqueness ≥1.5 / lengthRatio ≥0.85. Claude=0.
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { PNG } from "pngjs";
import { parseImperialLengthToFeet } from "../units/parseImperialLengthToFeet.js";
import type { DimStringCandidate } from "../dimensions/dimOwnership.js";
import {
  cleanupOcrText,
  createOcrWorker,
  ocrWithRotations,
  renderPagePng,
  type OcrWorker,
} from "../dimensions/dimOwnership.js";
import type { TextPrimitive } from "../text/extractTextPrimitives.js";
import type { PbgRun } from "../pbg/consolidatePhysicalRuns.js";
import type { Segment } from "../sgg/extractSegments.js";
import type { CandidateSource } from "../governance/evaluateScaleConsistency.js";

export type TranscriptionAuthority =
  | "pdf-text-layer"
  | "localized-ocr"
  | "unresolved";

export type SourcedDimCandidate = DimStringCandidate & {
  candidateSource: CandidateSource;
};

export type DimTranscription = {
  dimId: string;
  authority: TranscriptionAuthority;
  rawText: string;
  parsedFeet: number | null;
  parseStatus: "ok" | "unresolved";
  textPrimitiveId: string | null;
  confidence: number | null;
  rotationDeg: number | null;
  cropPath: string | null;
  association: {
    normalDist: number | null;
    axialOverlap: number | null;
    method: string;
  };
};

export const UNIQUENESS_MIN = 1.5;
export const LENGTH_RATIO_MIN = 0.85;

const MIN_CROP_EDGE_PT = 28;
const OCR_RENDER_SCALE = 3;
const NORMAL_BAND_FRAC = 0.08;
const NORMAL_BAND_MIN_PT = 18;
const NORMAL_BAND_MAX_PT = 48;

function mid(d: DimStringCandidate): { x: number; y: number } {
  return d.mid;
}

function axialOverlapRatio(dim: DimStringCandidate, t: TextPrimitive): number {
  if (dim.orientation === "H") {
    const d0 = Math.min(dim.x1, dim.x2);
    const d1 = Math.max(dim.x1, dim.x2);
    const overlap = Math.max(0, Math.min(d1, t.bbox.x1) - Math.max(d0, t.bbox.x0));
    return overlap / Math.max(d1 - d0, t.bbox.x1 - t.bbox.x0, 1);
  }
  const d0 = Math.min(dim.y1, dim.y2);
  const d1 = Math.max(dim.y1, dim.y2);
  const overlap = Math.max(0, Math.min(d1, t.bbox.y1) - Math.max(d0, t.bbox.y0));
  return overlap / Math.max(d1 - d0, t.bbox.y1 - t.bbox.y0, 1);
}

function normalDistToDim(
  dim: DimStringCandidate,
  p: { x: number; y: number },
): number {
  const dx = dim.x2 - dim.x1;
  const dy = dim.y2 - dim.y1;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((p.x - dim.x1) * dx + (p.y - dim.y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (dim.x1 + t * dx), p.y - (dim.y1 + t * dy));
}

function median(nums: number[]): number {
  if (nums.length === 0) return 10;
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

/** Generic architectural scale tokens → pt/ft (1 pt = 1/72"). */
export function estimatePtPerFtFromScaleText(primitives: TextPrimitive[]): number | null {
  const blob = primitives.map((p) => p.rawText).join(" ");
  // 1/4" = 1'-0" → 0.25 * 72 = 18
  const m = blob.match(/(\d+)\s*\/\s*(\d+)\s*["″]\s*=\s*1\s*['′]/);
  if (m) {
    const num = Number(m[1]);
    const den = Number(m[2]);
    if (den > 0) return (num / den) * 72;
  }
  const m2 = blob.match(/(\d+)\s*\/\s*(\d+)\s*=\s*1\s*['′]/);
  if (m2) {
    const num = Number(m2[1]);
    const den = Number(m2[2]);
    if (den > 0) return (num / den) * 72;
  }
  return null;
}

export function associateTextToDims(
  dims: DimStringCandidate[],
  texts: TextPrimitive[],
  pageStats?: { medianTextHeight?: number },
): Map<string, { text: TextPrimitive; normalDist: number; axialOverlap: number }> {
  const medH = pageStats?.medianTextHeight ?? 10;
  const maxNormal = Math.max(medH * 3.5, 22);
  const parseOk = texts.filter((t) => t.parseStatus === "ok" && t.parsedFeet != null);
  const out = new Map<
    string,
    { text: TextPrimitive; normalDist: number; axialOverlap: number }
  >();
  const usedText = new Set<string>();

  for (const dim of dims) {
    let best: {
      text: TextPrimitive;
      score: number;
      nd: number;
      ax: number;
    } | null = null;
    for (const t of parseOk) {
      if (usedText.has(t.id)) continue;
      if (t.orientation !== "unknown" && t.orientation !== dim.orientation) continue;
      const nd = normalDistToDim(dim, t.mid);
      if (nd > maxNormal) continue;
      const ax = axialOverlapRatio(dim, t);
      const m = mid(dim);
      const along =
        dim.orientation === "H"
          ? Math.abs(t.mid.x - m.x) / Math.max(dim.length, 1)
          : Math.abs(t.mid.y - m.y) / Math.max(dim.length, 1);
      if (ax < 0.05 && along > 0.55) continue;
      const score = 1000 / (1 + nd) + ax * 200 - along * 50;
      if (!best || score > best.score) best = { text: t, score, nd, ax };
    }
    if (best) {
      usedText.add(best.text.id);
      out.set(dim.id, {
        text: best.text,
        normalDist: best.nd,
        axialOverlap: best.ax,
      });
    }
  }
  return out;
}

export function tagDetectedDims(
  dims: DimStringCandidate[],
): SourcedDimCandidate[] {
  return dims.map((d) => ({ ...d, candidateSource: "detected" as const }));
}

/**
 * Seed overall dim candidates near HIGH PBG runs when thin parallel strokes
 * miss the frozen stroke≤0.5 detector (common at ~0.6). Does not edit PBG
 * or ownership gates — only expands OCR/text association targets.
 */
export function augmentDimCandidatesNearHighRuns(
  segments: Segment[],
  dims: SourcedDimCandidate[],
  pbg: PbgRun[],
): SourcedDimCandidate[] {
  const existing = new Set(
    dims.map(
      (d) =>
        `${Math.round(d.mid.x)}:${Math.round(d.mid.y)}:${Math.round(d.length)}`,
    ),
  );
  const out = [...dims];
  let n = dims.length;
  for (const r of pbg) {
    if (r.wallAuthority !== "high" || r.lengthPt < 200) continue;
    for (const s of segments) {
      if (s.orientation !== r.orientation) continue;
      if (s.strokeWidth > 1.0 || s.length < 80) continue;
      const lengthRatio =
        Math.min(s.length, r.lengthPt) / Math.max(s.length, r.lengthPt);
      if (lengthRatio < LENGTH_RATIO_MIN) continue;
      const mid = { x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 };
      const normalDist =
        r.orientation === "H"
          ? Math.abs(mid.y - r.mid.y)
          : Math.abs(mid.x - r.mid.x);
      if (normalDist < 5 || normalDist > 80) continue;
      const key = `${Math.round(mid.x)}:${Math.round(mid.y)}:${Math.round(s.length)}`;
      if (existing.has(key)) continue;
      existing.add(key);
      out.push({
        id: `ds-${n++}`,
        segId: s.id,
        orientation: s.orientation,
        length: s.length,
        strokeWidth: s.strokeWidth,
        x1: s.x1,
        y1: s.y1,
        x2: s.x2,
        y2: s.y2,
        mid,
        roleGuess: "overall-candidate",
        outsideEnvelope: true,
        unpaired: true,
        candidateSource: "near-high-seed",
      });
    }
  }
  return out;
}

/** Normal-offset label band (not stroke-thin). */
export function labelBandCropBox(dim: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  length: number;
  orientation: "H" | "V";
}): { x0: number; y0: number; x1: number; y1: number } {
  const band = Math.min(
    NORMAL_BAND_MAX_PT,
    Math.max(NORMAL_BAND_MIN_PT, dim.length * NORMAL_BAND_FRAC),
  );
  const dx = dim.x2 - dim.x1;
  const dy = dim.y2 - dim.y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const pts = [
    { x: dim.x1 + nx * band, y: dim.y1 + ny * band },
    { x: dim.x1 - nx * band, y: dim.y1 - ny * band },
    { x: dim.x2 + nx * band, y: dim.y2 + ny * band },
    { x: dim.x2 - nx * band, y: dim.y2 - ny * band },
  ];
  let x0 = Math.min(...pts.map((p) => p.x));
  let y0 = Math.min(...pts.map((p) => p.y));
  let x1 = Math.max(...pts.map((p) => p.x));
  let y1 = Math.max(...pts.map((p) => p.y));
  const w = x1 - x0;
  const h = y1 - y0;
  if (w < MIN_CROP_EDGE_PT) {
    const pad = (MIN_CROP_EDGE_PT - w) / 2;
    x0 -= pad;
    x1 += pad;
  }
  if (h < MIN_CROP_EDGE_PT) {
    const pad = (MIN_CROP_EDGE_PT - h) / 2;
    y0 -= pad;
    y1 += pad;
  }
  const axialPad = 6;
  if (dim.orientation === "H") {
    x0 -= axialPad;
    x1 += axialPad;
  } else {
    y0 -= axialPad;
    y1 += axialPad;
  }
  return { x0, y0, x1, y1 };
}

export function cropBoxFromRaster(
  pngBuf: Buffer,
  pageWidthPt: number,
  pageHeightPt: number,
  box: { x0: number; y0: number; x1: number; y1: number },
): Buffer {
  const src = PNG.sync.read(pngBuf);
  const sx = src.width / pageWidthPt;
  const sy = src.height / pageHeightPt;
  let left = Math.floor(box.x0 * sx);
  let right = Math.ceil(box.x1 * sx);
  let top = Math.floor((pageHeightPt - box.y1) * sy);
  let bottom = Math.ceil((pageHeightPt - box.y0) * sy);
  left = Math.max(0, left);
  top = Math.max(0, top);
  right = Math.min(src.width, right);
  bottom = Math.min(src.height, bottom);
  const w = Math.max(1, right - left);
  const h = Math.max(1, bottom - top);
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
  return PNG.sync.write(outPng);
}

/**
 * Resolve transcription per dim: native text first, else offset-band OCR.
 */
export async function resolveTranscriptions(opts: {
  dims: DimStringCandidate[];
  imperialTexts: TextPrimitive[];
  allPrimitives: TextPrimitive[];
  pdfPath: string;
  pageNumber: number;
  pageWidth: number;
  pageHeight: number;
  cropsDir: string;
  worker: OcrWorker;
  maxOcr?: number;
}): Promise<DimTranscription[]> {
  await mkdir(opts.cropsDir, { recursive: true });
  const heights = opts.allPrimitives.map(
    (p) => Math.abs(p.bbox.y1 - p.bbox.y0) || Math.abs(p.bbox.x1 - p.bbox.x0),
  );
  const medH = median(heights.filter((h) => h > 0 && h < 80));
  const assoc = associateTextToDims(opts.dims, opts.imperialTexts, {
    medianTextHeight: medH,
  });

  const results: DimTranscription[] = [];
  let ocrCount = 0;
  const maxOcr = opts.maxOcr ?? 40;
  let raster: Buffer | null = null;

  // Prefer OCR on long overalls first (B2.2F west-style targets before cap).
  const dimOrder = [...opts.dims].sort((a, b) => {
    const ao = a.roleGuess === "overall-candidate" ? 1 : 0;
    const bo = b.roleGuess === "overall-candidate" ? 1 : 0;
    if (ao !== bo) return bo - ao;
    return b.length - a.length;
  });

  for (const dim of dimOrder) {
    const hit = assoc.get(dim.id);
    if (hit && hit.text.parseStatus === "ok" && hit.text.parsedFeet != null) {
      results.push({
        dimId: dim.id,
        authority: "pdf-text-layer",
        rawText: hit.text.rawText,
        parsedFeet: hit.text.parsedFeet,
        parseStatus: "ok",
        textPrimitiveId: hit.text.id,
        confidence: null,
        rotationDeg: null,
        cropPath: null,
        association: {
          normalDist: hit.normalDist,
          axialOverlap: hit.axialOverlap,
          method: "text-normal-axial",
        },
      });
      continue;
    }

    if (ocrCount >= maxOcr) {
      results.push({
        dimId: dim.id,
        authority: "unresolved",
        rawText: "",
        parsedFeet: null,
        parseStatus: "unresolved",
        textPrimitiveId: null,
        confidence: null,
        rotationDeg: null,
        cropPath: null,
        association: {
          normalDist: null,
          axialOverlap: null,
          method: "ocr-skipped-cap",
        },
      });
      continue;
    }

    if (!raster) {
      const rendered = await renderPagePng(
        opts.pdfPath,
        opts.pageNumber,
        OCR_RENDER_SCALE,
      );
      raster = rendered.png;
    }

    const box = labelBandCropBox(dim);
    const cropPng = cropBoxFromRaster(
      raster,
      opts.pageWidth,
      opts.pageHeight,
      box,
    );
    const cropPath = path.join(opts.cropsDir, `${dim.id}-band.png`);
    await writeFile(cropPath, cropPng);
    ocrCount++;
    const ocr = await ocrWithRotations(
      cropPath,
      opts.worker,
      opts.cropsDir,
      dim.id,
      dim.orientation,
    );
    const parse =
      ocr.parse.status === "ok"
        ? ocr.parse
        : parseImperialLengthToFeet(cleanupOcrText(ocr.bestText));

    results.push({
      dimId: dim.id,
      authority: parse.status === "ok" ? "localized-ocr" : "unresolved",
      rawText: ocr.bestText,
      parsedFeet: parse.status === "ok" ? parse.feet : null,
      parseStatus: parse.status === "ok" ? "ok" : "unresolved",
      textPrimitiveId: null,
      confidence: ocr.bestConf,
      rotationDeg: ocr.bestRotation,
      cropPath,
      association: {
        normalDist: null,
        axialOverlap: null,
        method: "ocr-normal-offset-band",
      },
    });
  }

  return results;
}

export function estimatePtPerFtFromDimTextPairs(
  dims: DimStringCandidate[],
  transcriptions: DimTranscription[],
): number | null {
  const ratios: number[] = [];
  const byId = new Map(transcriptions.map((t) => [t.dimId, t]));
  for (const d of dims) {
    const t = byId.get(d.id);
    if (!t || t.parseStatus !== "ok" || t.parsedFeet == null || t.parsedFeet < 1) {
      continue;
    }
    ratios.push(d.length / t.parsedFeet);
  }
  if (ratios.length === 0) return null;
  if (ratios.length === 1) return ratios[0]!;
  return median(ratios);
}

/**
 * Virtual dim candidates from parse-ok imperial text when geometry dim is missing.
 * Length in page pts from ptPerFt; role overall if ≥ typical face.
 */
export function virtualDimsFromText(
  texts: TextPrimitive[],
  ptPerFt: number,
  usedTextIds: Set<string>,
  startIndex = 0,
): SourcedDimCandidate[] {
  const out: SourcedDimCandidate[] = [];
  let n = startIndex;
  for (const t of texts) {
    if (t.parseStatus !== "ok" || t.parsedFeet == null || t.parsedFeet < 2) continue;
    if (usedTextIds.has(t.id)) continue;
    if (t.orientation === "unknown") continue;
    const length = t.parsedFeet * ptPerFt;
    if (length < 80) continue;
    const half = length / 2;
    const x1 = t.orientation === "H" ? t.mid.x - half : t.mid.x;
    const x2 = t.orientation === "H" ? t.mid.x + half : t.mid.x;
    const y1 = t.orientation === "V" ? t.mid.y - half : t.mid.y;
    const y2 = t.orientation === "V" ? t.mid.y + half : t.mid.y;
    out.push({
      id: `vt-${n++}`,
      segId: -1,
      orientation: t.orientation,
      length,
      strokeWidth: 0,
      x1,
      y1,
      x2,
      y2,
      mid: { ...t.mid },
      roleGuess: t.parsedFeet >= 20 ? "overall-candidate" : "chain-component-candidate",
      outsideEnvelope: true,
      unpaired: true,
      candidateSource: "virtual-text",
    });
  }
  return out;
}

export { createOcrWorker };
export type { OcrWorker, PbgRun, CandidateSource };
