/**
 * B2.2G frozen dims — generic dim candidates + B2.2E/F ownership/OCR.
 * uniqueness 1.5, lengthRatio 0.85, overall lengthWeight 220; OCR 0/90/270.
 * Claude=0.
 */
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { PNG } from "pngjs";
import { pdf } from "pdf-to-img";

import { parseImperialLengthToFeet } from "../units/parseImperialLengthToFeet.js";
import type { PbgRun, Point } from "../pbg/consolidatePhysicalRuns.js";
import type { Segment } from "../sgg/extractSegments.js";

const require = createRequire(import.meta.url);
const Tesseract = require("tesseract.js");

export type DimStringCandidate = {
  id: string;
  segId: number;
  orientation: "H" | "V";
  length: number;
  strokeWidth: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  mid: Point;
  roleGuess: "overall-candidate" | "chain-component-candidate" | "unknown";
  outsideEnvelope: boolean;
  unpaired: boolean;
};

export type Footprint = { x0: number; y0: number; x1: number; y1: number };

function midOf(s: { x1: number; y1: number; x2: number; y2: number }): Point {
  return { x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 };
}


/**
 * Generic dim-string candidates (B2.2C exterior-band idea, producer-agnostic):
 * length>=80, stroke<=0.5, unpaired OR outside envelope by >20pt.
 * Role: length vs median face → overall if long.
 */
export function detectDimStringCandidates(
  segments: Segment[],
  footprint: Footprint,
): DimStringCandidate[] {
  const faceLens = segments
    .filter((s) => s.orientation !== "D" && s.length >= 40 && s.strokeWidth <= 2.2)
    .map((s) => s.length)
    .sort((a, b) => a - b);
  const medianFace =
    faceLens.length > 0 ? faceLens[Math.floor(faceLens.length / 2)]! : 80;

  // Paired wall-like ids (parallel twin gap 2–12 with overlap) — B2.2C idea
  const structural = segments.filter(
    (s) => s.length >= 40 && s.orientation !== "D" && s.strokeWidth <= 2.5,
  );
  const pairedIds = new Set<number>();
  for (const mode of ["H", "V"] as const) {
    const list = structural.filter((s) => s.orientation === mode);
    const sorted = [...list].sort((a, b) =>
      mode === "H"
        ? (a.y1 + a.y2) / 2 - (b.y1 + b.y2) / 2
        : (a.x1 + a.x2) / 2 - (b.x1 + b.x2) / 2,
    );
    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[i]!;
      const aPos = mode === "H" ? (a.y1 + a.y2) / 2 : (a.x1 + a.x2) / 2;
      const aMin = mode === "H" ? Math.min(a.x1, a.x2) : Math.min(a.y1, a.y2);
      const aMax = mode === "H" ? Math.max(a.x1, a.x2) : Math.max(a.y1, a.y2);
      for (let j = i + 1; j < sorted.length; j++) {
        const b = sorted[j]!;
        const bPos = mode === "H" ? (b.y1 + b.y2) / 2 : (b.x1 + b.x2) / 2;
        const gap = Math.abs(bPos - aPos);
        if (gap > 12) break;
        if (gap < 2) continue;
        const bMin = mode === "H" ? Math.min(b.x1, b.x2) : Math.min(b.y1, b.y2);
        const bMax = mode === "H" ? Math.max(b.x1, b.x2) : Math.max(b.y1, b.y2);
        const overlap = Math.min(aMax, bMax) - Math.max(aMin, bMin);
        if (overlap >= Math.min(a.length, b.length) * 0.5) {
          pairedIds.add(a.id);
          pairedIds.add(b.id);
        }
      }
    }
  }

  const out: DimStringCandidate[] = [];
  let n = 0;
  for (const s of segments) {
    if (s.orientation === "D") continue;
    if (s.length < 80) continue;
    if (s.strokeWidth > 0.5) continue;
    const m = midOf(s);
    let outside = false;
    if (s.orientation === "H") {
      if (m.y > footprint.y1 + 20 || m.y < footprint.y0 - 20) outside = true;
    } else {
      if (m.x > footprint.x1 + 20 || m.x < footprint.x0 - 20) outside = true;
    }
    const unpaired = !pairedIds.has(s.id);
    if (!unpaired && !outside) continue;

    const roleGuess =
      s.length >= medianFace * 0.85
        ? ("overall-candidate" as const)
        : s.length >= medianFace * 0.4
          ? ("chain-component-candidate" as const)
          : ("unknown" as const);

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
      mid: m,
      roleGuess,
      outsideEnvelope: outside,
      unpaired,
    });
  }
  return out;
}

export async function renderPagePng(
  pdfPath: string,
  pageNumber: number,
  scale: number,
): Promise<{ png: Buffer; width: number; height: number; ms: number }> {
  const t0 = performance.now();
  const document = await pdf(pdfPath, { scale });
  const png = Buffer.from(await document.getPage(pageNumber));
  return {
    png,
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
    ms: performance.now() - t0,
  };
}

/** Crop around a dim mid/bbox from a rendered page raster (PDF y-up → PNG y-down). */
export function cropDimFromRaster(
  pngBuf: Buffer,
  pageWidthPt: number,
  pageHeightPt: number,
  dim: { x1: number; y1: number; x2: number; y2: number; mid: Point },
  padPx = 12,
): { png: Buffer; width: number; height: number } {
  const src = PNG.sync.read(pngBuf);
  const sx = src.width / pageWidthPt;
  const sy = src.height / pageHeightPt;
  const x0 = Math.min(dim.x1, dim.x2) - 8;
  const x1 = Math.max(dim.x1, dim.x2) + 8;
  const y0 = Math.min(dim.y1, dim.y2) - 14;
  const y1 = Math.max(dim.y1, dim.y2) + 14;
  let left = Math.floor(x0 * sx) - padPx;
  let right = Math.ceil(x1 * sx) + padPx;
  let top = Math.floor((pageHeightPt - y1) * sy) - padPx;
  let bottom = Math.ceil((pageHeightPt - y0) * sy) + padPx;
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
  return { png: PNG.sync.write(outPng), width: w, height: h };
}

export async function createOcrWorker() {
  const worker = await Tesseract.createWorker("eng", 1, {
    logger: () => undefined,
  });
  await worker.setParameters({
    tessedit_char_whitelist: "0123456789'-\" ",
  });
  return worker;
}

export type OcrWorker = Awaited<ReturnType<typeof createOcrWorker>>;

function distPointToSeg(
  p: Point,
  s: { x1: number; y1: number; x2: number; y2: number },
): number {
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((p.x - s.x1) * dx + (p.y - s.y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (s.x1 + t * dx), p.y - (s.y1 + t * dy));
}

export function cleanupOcrText(raw: string): string {
  let t = raw
    .replace(/\s+/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/′/g, "'")
    .replace(/″/g, '"')
    .trim();
  t = t.replace(/[Oo]/g, "0");
  const withFeet = t.match(/\d+\s*'\s*-?\s*\d+\s*"?/);
  if (withFeet) return withFeet[0]!;
  const missingFeet = t.match(/(\d+)\s*-\s*(\d+)\s*"?/);
  if (missingFeet) return `${missingFeet[1]}'-${missingFeet[2]}"`;
  const feetOnly = t.match(/(\d+)\s*'/);
  if (feetOnly) return `${feetOnly[1]}'`;
  return t;
}

export function rotatePng90(png: PNG, turns: 0 | 1 | 3): PNG {
  if (turns === 0) return png;
  const w = png.width;
  const h = png.height;
  const out = new PNG({ width: h, height: w });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = (w * y + x) << 2;
      let dx: number;
      let dy: number;
      if (turns === 1) {
        // 90° CW
        dx = h - 1 - y;
        dy = x;
      } else {
        // 270° CW = 90° CCW
        dx = y;
        dy = w - 1 - x;
      }
      const di = (out.width * dy + dx) << 2;
      out.data[di] = png.data[si]!;
      out.data[di + 1] = png.data[si + 1]!;
      out.data[di + 2] = png.data[si + 2]!;
      out.data[di + 3] = png.data[si + 3]!;
    }
  }
  return out;
}

export async function ocrWithRotations(
  cropPath: string,
  worker: OcrWorker,
  outDir: string,
  dimId: string,
  preferredOrientation?: "H" | "V",
): Promise<{
  bestText: string;
  bestConf: number;
  bestRotation: number;
  parse: ReturnType<typeof parseImperialLengthToFeet>;
  attempts: Array<{ rot: number; text: string; conf: number; ms: number }>;
}> {
  const buf = await readFile(cropPath);
  const base = PNG.sync.read(buf);
  const attempts = [];
  let best: {
    text: string;
    conf: number;
    rot: number;
    parse: ReturnType<typeof parseImperialLengthToFeet>;
  } | null = null;

  for (const turns of [0, 1, 3] as const) {
    const rotDeg = turns === 0 ? 0 : turns === 1 ? 90 : 270;
    const img = rotatePng90(base, turns);
    const pngBuf = PNG.sync.write(img);
    const outCrop = path.join(outDir, `${dimId}-rot${rotDeg}.png`);
    await writeFile(outCrop, pngBuf);
    const t0 = performance.now();
    const result = await worker.recognize(pngBuf);
    const text = cleanupOcrText(result.data.text || "");
    const conf = Number(result.data.confidence ?? 0);
    const ms = performance.now() - t0;
    let parse = parseImperialLengthToFeet(text);
    let displayText = text;
    // Accept 54'4" style (missing hyphen) after cleanup
    if (parse.status !== "ok") {
      const m = text.match(/^(\d+)\s*'\s*(\d+)\s*"?$/);
      if (m) {
        displayText = `${m[1]}'-${m[2]}"`;
        parse = parseImperialLengthToFeet(displayText);
      }
    } else if (parse.status === "ok") {
      displayText = parse.originalText;
    }
    attempts.push({ rot: rotDeg, text: displayText, conf, ms: Number(ms.toFixed(1)) });
    const oriBonus =
      preferredOrientation === "V"
        ? rotDeg === 90 || rotDeg === 270
          ? 80
          : 0
        : preferredOrientation === "H"
          ? rotDeg === 0
            ? 40
            : 0
          : 0;
    const score =
      (parse.status === "ok" ? 1000 : 0) +
      oriBonus +
      conf +
      (displayText.length > 1 ? 10 : 0);
    const bestScore = best
      ? (best.parse.status === "ok" ? 1000 : 0) +
        (preferredOrientation === "V"
          ? best.rot === 90 || best.rot === 270
            ? 80
            : 0
          : preferredOrientation === "H"
            ? best.rot === 0
              ? 40
              : 0
            : 0) +
        best.conf +
        (best.text.length > 1 ? 10 : 0)
      : -1;
    if (score > bestScore) {
      best = { text: displayText, conf, rot: rotDeg, parse };
    }
  }

  return {
    bestText: best?.text ?? "",
    bestConf: best?.conf ?? 0,
    bestRotation: best?.rot ?? 0,
    parse: best?.parse ?? parseImperialLengthToFeet(""),
    attempts,
  };
}

export function rankDimOwnership(
  dims: Array<{
    id: string;
    orientation: "H" | "V";
    length: number;
    mid: Point;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    roleGuess?: string;
  }>,
  pbg: PbgRun[],
  transcriptions: Map<
    string,
    {
      ocrText: string | null;
      parse: ReturnType<typeof parseImperialLengthToFeet> | null;
      governedWallFaceIds?: number[];
    }
  >,
) {
  const associations = [];
  for (const d of dims) {
    const tx = transcriptions.get(d.id);
    const candidates: Array<{
      run: PbgRun;
      score: number;
      lengthRatio: number;
      normalDist: number;
      overlap: number;
    }> = [];

    for (const r of pbg) {
      if (r.orientation !== d.orientation) continue;
      const normalDist =
        d.orientation === "H"
          ? Math.abs(d.mid.y - r.mid.y)
          : Math.abs(d.mid.x - r.mid.x);
      if (normalDist < 5 || normalDist > 320) continue;
      const dLo =
        d.orientation === "H" ? Math.min(d.x1, d.x2) : Math.min(d.y1, d.y2);
      const dHi =
        d.orientation === "H" ? Math.max(d.x1, d.x2) : Math.max(d.y1, d.y2);
      const rLo =
        d.orientation === "H"
          ? Math.min(r.centerline.x1, r.centerline.x2)
          : Math.min(r.centerline.y1, r.centerline.y2);
      const rHi =
        d.orientation === "H"
          ? Math.max(r.centerline.x1, r.centerline.x2)
          : Math.max(r.centerline.y1, r.centerline.y2);
      const overlap = Math.min(dHi, rHi) - Math.max(dLo, rLo);
      if (overlap < 40) continue;
      const lengthRatio =
        Math.min(d.length, r.lengthPt) / Math.max(d.length, r.lengthPt);
      let extensionBonus = 0;
      const faces = tx?.governedWallFaceIds ?? [];
      if (faces.some((f) => r.faceSegmentIds.includes(f))) extensionBonus += 40;
      const endProx = Math.min(
        distPointToSeg({ x: d.x1, y: d.y1 }, r.centerline),
        distPointToSeg({ x: d.x2, y: d.y2 }, r.centerline),
      );
      if (endProx < 80) extensionBonus += 15;
      if (endProx < 30) extensionBonus += 15;
      const lengthWeight =
        d.roleGuess === "overall-candidate" ? 220 : 80;
      const score =
        overlap / (1 + normalDist * 0.04) +
        lengthRatio * lengthWeight +
        extensionBonus +
        (r.wallAuthority === "high" ? 10 : r.wallAuthority === "medium" ? 5 : 0);
      candidates.push({ run: r, score, lengthRatio, normalDist, overlap });
    }
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    const second = candidates[1];
    if (!best) {
      associations.push({
        dimId: d.id,
        roleGuess: d.roleGuess ?? null,
        status: "unassociated" as const,
        reason: "no_plausible_pbg_run",
        mid: d.mid,
        orientation: d.orientation,
        dimLengthPt: d.length,
      });
      continue;
    }
    const margin = second ? best.score / Math.max(1e-6, second.score) : 99;
    const unique = margin >= 1.5;
    const lengthOk = best.lengthRatio >= 0.85;
    let status: "associated" | "ambiguous" | "weak-length" = unique
      ? "associated"
      : "ambiguous";
    if (unique && d.roleGuess === "overall-candidate" && !lengthOk) {
      status = "weak-length";
    }
    associations.push({
      dimId: d.id,
      roleGuess: d.roleGuess ?? null,
      status,
      runId: best.run.id,
      physicalRunKey: best.run.physicalRunKey,
      score: Number(best.score.toFixed(2)),
      secondScore: second ? Number(second.score.toFixed(2)) : null,
      uniquenessMargin: Number(margin.toFixed(2)),
      lengthRatio: Number(best.lengthRatio.toFixed(3)),
      lengthOk,
      normalDist: Number(best.normalDist.toFixed(1)),
      overlap: Number(best.overlap.toFixed(1)),
      ocrText: tx?.ocrText ?? null,
      parse: tx?.parse ?? null,
      dimLengthPt: d.length,
      runLengthPt: best.run.lengthPt,
      mid: d.mid,
      orientation: d.orientation,
      plausibleCount: candidates.length,
    });
  }

  const associated = associations.filter((a) => a.status === "associated");
  const overalls = associated.filter((a) => a.roleGuess === "overall-candidate");
  const overallGood = overalls.filter((a) => a.lengthOk);
  const overallAttempted = associations.filter(
    (a) =>
      a.roleGuess === "overall-candidate" &&
      (a.status === "associated" ||
        a.status === "weak-length" ||
        a.status === "ambiguous"),
  );

  return {
    associations,
    associatedUnique: associated.length,
    ambiguous: associations.filter((a) => a.status === "ambiguous").length,
    weakLength: associations.filter((a) => a.status === "weak-length").length,
    overallUniqueAndLengthOk: overallGood.length,
    overallLengthOkRate:
      overallAttempted.length > 0
        ? overallGood.length / overallAttempted.length
        : null,
  };
}

/**
 * Limited north exterior recovery: look for longest in-envelope H PBG near
 * north envelope — do NOT promote rejected dim-band. Report if ≈ dim length.
 */
