/**
 * B2.2H — first-class PDF text primitives (diagnostic SGG signal).
 * Native getTextContent → TextPrimitive; imperial clustering.
 * Claude=0. No producer-specific constants.
 */
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { readFile } from "node:fs/promises";
import { parseImperialLengthToFeet } from "../units/parseImperialLengthToFeet.js";

export type TextPrimitive = {
  id: string;
  pageNumber: number;
  rawText: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  transform?: number[];
  orientation: "H" | "V" | "unknown";
  sourceAuthority: "pdf-text-layer" | "localized-ocr";
  confidence: number | null;
  parseStatus: "ok" | "unresolved";
  parsedFeet: number | null;
  provenance: {
    itemIndices?: number[];
    cropPath?: string;
    rotationDeg?: number;
  };
  mid: { x: number; y: number };
};

type RawItem = {
  index: number;
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
  transform: number[];
  angleDeg: number;
};

function orientationFromAngle(angleDeg: number): "H" | "V" | "unknown" {
  const a = ((angleDeg % 180) + 180) % 180;
  if (a < 15 || a > 165) return "H";
  if (a > 75 && a < 105) return "V";
  return "unknown";
}

function looksImperialFragment(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  if (/\d/.test(t) && /['′"″]/.test(t)) return true;
  if (/^\d+$/.test(t)) return true;
  if (/^\d+\s*[-/]\s*\d+/.test(t)) return true;
  if (/^\d+\s*\/\s*\d+$/.test(t)) return true;
  return false;
}

/**
 * Extract all text items as primitives; also emit clustered imperial candidates.
 */
export async function extractTextPrimitives(
  pdfPath: string,
  pageNumber: number,
): Promise<{
  pageWidth: number;
  pageHeight: number;
  rawItemCount: number;
  primitives: TextPrimitive[];
  imperialCandidates: TextPrimitive[];
}> {
  const data = new Uint8Array(await readFile(pdfPath));
  const doc = await getDocument({ data, useSystemFonts: true }).promise;
  const page = await doc.getPage(pageNumber);
  const view = page.view;
  const pageWidth = view[2]! - view[0]!;
  const pageHeight = view[3]! - view[1]!;
  const text = await page.getTextContent();

  const raw: RawItem[] = [];
  let idx = 0;
  for (const it of text.items) {
    if (!("str" in it)) continue;
    const str = String(it.str);
    const tr = it.transform as number[];
    const angleDeg = (Math.atan2(tr[1]!, tr[0]!) * 180) / Math.PI;
    const scaleX = Math.hypot(tr[0]!, tr[1]!) || 1;
    const w = Number(it.width) || Math.max(scaleX * str.length * 0.5, 0);
    const h = Number(it.height) || scaleX;
    raw.push({
      index: idx++,
      str,
      x: tr[4]!,
      y: tr[5]!,
      w,
      h,
      transform: tr.slice(),
      angleDeg,
    });
  }
  await doc.destroy();

  const primitives: TextPrimitive[] = raw
    .filter((r) => r.str.trim().length > 0)
    .map((r) => {
      const ori = orientationFromAngle(r.angleDeg);
      // Approximate bbox from anchor + width along orientation
      let x0 = r.x;
      let y0 = r.y;
      let x1 = r.x;
      let y1 = r.y;
      if (ori === "V") {
        x0 = r.x - r.h * 0.2;
        x1 = r.x + r.h;
        y0 = r.y;
        y1 = r.y + Math.max(r.w, r.h);
      } else {
        x0 = r.x;
        x1 = r.x + Math.max(r.w, r.h);
        y0 = r.y - r.h * 0.2;
        y1 = r.y + r.h;
      }
      const parse = parseImperialLengthToFeet(r.str.trim());
      return {
        id: `txt:p${pageNumber}:${r.index}`,
        pageNumber,
        rawText: r.str.trim(),
        bbox: { x0, y0, x1, y1 },
        transform: r.transform,
        orientation: ori,
        sourceAuthority: "pdf-text-layer" as const,
        confidence: null,
        parseStatus: parse.status === "ok" ? ("ok" as const) : ("unresolved" as const),
        parsedFeet: parse.status === "ok" ? parse.feet : null,
        provenance: { itemIndices: [r.index] },
        mid: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 },
      };
    });

  // Cluster nearby fragments into imperial strings
  const imperialCandidates: TextPrimitive[] = [];
  const used = new Set<number>();
  const fragIdx = raw
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => looksImperialFragment(r.str) || /['′]/.test(r.str));

  for (let a = 0; a < fragIdx.length; a++) {
    const seed = fragIdx[a]!;
    if (used.has(seed.r.index)) continue;
    const cluster = [seed.r];
    used.add(seed.r.index);
    let changed = true;
    while (changed) {
      changed = false;
      for (const cand of fragIdx) {
        if (used.has(cand.r.index)) continue;
        const ok = cluster.some((c) => {
          const sameOri =
            Math.abs(
              ((c.angleDeg % 180) + 180) % 180 -
                (((cand.r.angleDeg % 180) + 180) % 180),
            ) < 20;
          if (!sameOri) return false;
          return Math.hypot(c.x - cand.r.x, c.y - cand.r.y) < Math.max(c.h, cand.r.h) * 4 + 14;
        });
        if (ok) {
          cluster.push(cand.r);
          used.add(cand.r.index);
          changed = true;
        }
      }
    }
    // Sort along primary axis
    const ori = orientationFromAngle(cluster[0]!.angleDeg);
    cluster.sort((p, q) =>
      ori === "V" ? p.y - q.y : p.x - q.x,
    );
    const joined = cluster.map((c) => c.str).join("").replace(/\s+/g, " ").trim();
    // Cleanup common joins: 12'-0"
    const cleaned = joined
      .replace(/[′']/g, "'")
      .replace(/[″"]/g, '"')
      .replace(/(\d)\s*'\s*-?\s*(\d)/, "$1'-$2");
    const parse = parseImperialLengthToFeet(cleaned);
    // Also try with trailing quote
    const parse2 =
      parse.status === "ok"
        ? parse
        : parseImperialLengthToFeet(cleaned.endsWith('"') ? cleaned : `${cleaned}"`);
    const best = parse2.status === "ok" ? parse2 : parse;
    if (best.status !== "ok" && !/['′]\s*-?\s*\d/.test(cleaned) && !/^\d+\s*'/.test(cleaned)) {
      continue;
    }
    const xs = cluster.flatMap((c) => [c.x, c.x + c.w]);
    const ys = cluster.flatMap((c) => [c.y, c.y + c.h]);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const y0 = Math.min(...ys);
    const y1 = Math.max(...ys);
    imperialCandidates.push({
      id: `imp:p${pageNumber}:${cluster.map((c) => c.index).join("-")}`,
      pageNumber,
      rawText: best.status === "ok" ? best.originalText : cleaned,
      bbox: { x0, y0, x1, y1 },
      transform: cluster[0]!.transform,
      orientation: ori === "unknown" ? "H" : ori,
      sourceAuthority: "pdf-text-layer",
      confidence: null,
      parseStatus: best.status === "ok" ? "ok" : "unresolved",
      parsedFeet: best.status === "ok" ? best.feet : null,
      provenance: { itemIndices: cluster.map((c) => c.index) },
      mid: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 },
    });
  }

  // Prefer parse-ok unique by rounded mid
  const seen = new Set<string>();
  const deduped: TextPrimitive[] = [];
  for (const c of imperialCandidates.sort((a, b) => {
    if (a.parseStatus === "ok" && b.parseStatus !== "ok") return -1;
    if (b.parseStatus === "ok" && a.parseStatus !== "ok") return 1;
    return (b.parsedFeet ?? 0) - (a.parsedFeet ?? 0);
  })) {
    const k = `${c.rawText}@${Math.round(c.mid.x / 8)},${Math.round(c.mid.y / 8)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(c);
  }

  return {
    pageWidth,
    pageHeight,
    rawItemCount: raw.length,
    primitives,
    imperialCandidates: deduped,
  };
}
