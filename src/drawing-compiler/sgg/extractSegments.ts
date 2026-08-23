/**
 * B2.2G frozen geometry — copied from B2.2D (thresholds unchanged).
 * Parameterize only via callers (pdfPath, pageNumber). Claude=0.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";

export type Point = { x: number; y: number };

export type Segment = {
  id: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  length: number;
  angleDeg: number;
  orientation: "H" | "V" | "D";
  strokeWidth: number;
};

export type GapMode = { center: number; count: number; halfWidth: number };

export type FacePair = {
  id: string;
  aId: number;
  bId: number;
  orientation: "H" | "V";
  gap: number;
  overlap: number;
  modeCenter: number;
  midA: Point;
  midB: Point;
};

export type PhysicalWallRunCandidate = {
  id: string;
  pageNumber: number;
  orientation: "H" | "V";
  faceSegmentIds: number[];
  facePairGapsPt: number[];
  thicknessPt: number | null;
  centerline: { x1: number; y1: number; x2: number; y2: number };
  endpoints: [Point, Point];
  connectedRunIds: string[];
  junctions: Array<{
    kind: "corner" | "T" | "unknown" | "unresolved";
    at: Point;
    otherRunId?: string;
  }>;
  openingGapSuspects: Array<{
    along: "faceA" | "faceB";
    gapPt: number;
    at: Point;
  }>;
  confidence: "high" | "medium" | "low";
  unresolvedReason: string | null;
  lengthPt: number;
  mid: Point;
};

function multiply(a: number[], b: number[]): number[] {
  return [
    a[0]! * b[0]! + a[2]! * b[1]!,
    a[1]! * b[0]! + a[3]! * b[1]!,
    a[0]! * b[2]! + a[2]! * b[3]!,
    a[1]! * b[2]! + a[3]! * b[3]!,
    a[0]! * b[4]! + a[2]! * b[5]! + a[4]!,
    a[1]! * b[4]! + a[3]! * b[5]! + a[5]!,
  ];
}
function apply(m: number[], x: number, y: number): Point {
  return {
    x: m[0]! * x + m[2]! * y + m[4]!,
    y: m[1]! * x + m[3]! * y + m[5]!,
  };
}
function orientationOf(angleDeg: number): "H" | "V" | "D" {
  const a = ((angleDeg % 180) + 180) % 180;
  if (a < 8 || a > 172) return "H";
  if (a > 82 && a < 98) return "V";
  return "D";
}
function strokePaint(op: number): boolean {
  return (
    op === OPS.stroke ||
    op === OPS.closeStroke ||
    op === OPS.fillStroke ||
    op === OPS.eoFillStroke ||
    op === OPS.closeFillStroke ||
    op === OPS.closeEOFillStroke
  );
}
function mid(s: Segment | { x1: number; y1: number; x2: number; y2: number }): Point {
  return { x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 };
}
function axisRange(s: Segment, mode: "H" | "V"): { lo: number; hi: number; pos: number } {
  if (mode === "H") {
    return {
      lo: Math.min(s.x1, s.x2),
      hi: Math.max(s.x1, s.x2),
      pos: (s.y1 + s.y2) / 2,
    };
  }
  return {
    lo: Math.min(s.y1, s.y2),
    hi: Math.max(s.y1, s.y2),
    pos: (s.x1 + s.x2) / 2,
  };
}

export async function extractSegments(pdfPath: string, pageNumber: number) {
  const t0 = performance.now();
  const data = new Uint8Array(await readFile(pdfPath));
  const doc = await getDocument({ data, useSystemFonts: true }).promise;
  const page = await doc.getPage(pageNumber);
  const opList = await page.getOperatorList();
  const view = page.view;
  const pageWidth = view[2]! - view[0]!;
  const pageHeight = view[3]! - view[1]!;

  let ctm = [1, 0, 0, 1, 0, 0];
  const stack: Array<{ ctm: number[]; lineWidth: number }> = [];
  let lineWidth = 1;
  const segments: Segment[] = [];
  let nextId = 0;

  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i]!;
    const args = opList.argsArray[i] as unknown[];
    if (fn === OPS.save) stack.push({ ctm: ctm.slice(), lineWidth });
    else if (fn === OPS.restore) {
      const s = stack.pop();
      if (s) {
        ctm = s.ctm;
        lineWidth = s.lineWidth;
      }
    } else if (fn === OPS.transform) ctm = multiply(ctm, args as number[]);
    else if (fn === OPS.setLineWidth) lineWidth = Number(args[0]);
    else if (fn === OPS.constructPath) {
      const paintOp = Number(args[0]);
      if (!strokePaint(paintOp)) continue;
      const scale = Math.hypot(ctm[0]!, ctm[1]!) || 1;
      const worldStroke = lineWidth * scale;
      const packed = args[1];
      const arrays = Array.isArray(packed) ? packed : [packed];
      for (const arrRaw of arrays) {
        const arr = arrRaw as ArrayLike<number>;
        let px = 0;
        let py = 0;
        let started = false;
        let j = 0;
        while (j + 2 < arr.length) {
          const cmd = Number(arr[j]);
          const x = Number(arr[j + 1]);
          const y = Number(arr[j + 2]);
          j += 3;
          const p = apply(ctm, x, y);
          if (cmd === 0) {
            px = p.x;
            py = p.y;
            started = true;
          } else if (cmd === 1 && started) {
            const length = Math.hypot(p.x - px, p.y - py);
            if (length >= 0.05) {
              const angleDeg = (Math.atan2(p.y - py, p.x - px) * 180) / Math.PI;
              segments.push({
                id: nextId++,
                x1: px,
                y1: py,
                x2: p.x,
                y2: p.y,
                length,
                angleDeg,
                orientation: orientationOf(angleDeg),
                strokeWidth: worldStroke,
              });
            }
            px = p.x;
            py = p.y;
          } else {
            px = p.x;
            py = p.y;
            started = true;
          }
        }
      }
    }
  }
  await doc.destroy();
  return {
    pageWidth,
    pageHeight,
    segments,
    extractMs: performance.now() - t0,
  };
}

/** Face candidates: H/V, long enough, not glyph-scale, not sheet border. */
export function filterFaceCandidates(
  segments: Segment[],
  pageWidth: number,
  pageHeight: number,
): Segment[] {
  const maxBorder = Math.max(pageWidth, pageHeight) * 0.88;
  return segments.filter((s) => {
    if (s.orientation === "D") return false;
    if (s.length < 40) return false;
    if (s.strokeWidth > 2.2) return false;
    if (s.length > maxBorder) return false;
    return true;
  });
}

/**
 * Discover gap thickness modes from ALL candidate parallel overlaps
 * in a wide exploratory window, then keep dense peaks.
 * Generic — no hardcoded GAP_MAX=12. EXPLORE_MAX=28 frozen from B2.2D.
 */
export function discoverGapModes(
  faces: Segment[],
  mode: "H" | "V",
): { modes: GapMode[]; exploratoryGaps: number[] } {
  const list = faces.filter((s) => s.orientation === mode);
  const sorted = [...list].sort((a, b) => axisRange(a, mode).pos - axisRange(b, mode).pos);
  const gaps: number[] = [];
  const EXPLORE_MAX = 28; // exploratory only; modes prune later

  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i]!;
    const ar = axisRange(a, mode);
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j]!;
      const br = axisRange(b, mode);
      const gap = Math.abs(br.pos - ar.pos);
      if (gap > EXPLORE_MAX) break;
      if (gap < 1.5) continue;
      const overlap = Math.min(ar.hi, br.hi) - Math.max(ar.lo, br.lo);
      if (overlap < 30) continue;
      if (Math.abs(a.strokeWidth - b.strokeWidth) > 0.5) continue;
      gaps.push(gap);
    }
  }

  const bins = new Map<number, number>();
  for (const g of gaps) {
    const k = Math.round(g * 5) / 5;
    bins.set(k, (bins.get(k) ?? 0) + 1);
  }
  const entries = [...bins.entries()].sort((a, b) => a[0] - b[0]);
  const modes: GapMode[] = [];
  for (let i = 0; i < entries.length; i++) {
    const [center, count] = entries[i]!;
    const prev = entries[i - 1]?.[1] ?? 0;
    const next = entries[i + 1]?.[1] ?? 0;
    if (count >= 8 && count >= prev && count >= next) {
      let left = center;
      let right = center;
      for (let k = i - 1; k >= 0 && entries[k]![1] >= count * 0.25; k--) {
        left = entries[k]![0];
      }
      for (let k = i + 1; k < entries.length && entries[k]![1] >= count * 0.25; k++) {
        right = entries[k]![0];
      }
      const halfWidth = Math.max(0.4, (right - left) / 2 + 0.35);
      const near = modes.find((m) => Math.abs(m.center - center) < 0.6);
      if (near) {
        if (count > near.count) {
          near.center = center;
          near.count = count;
          near.halfWidth = halfWidth;
        }
      } else {
        modes.push({ center, count, halfWidth });
      }
    }
  }
  modes.sort((a, b) => b.count - a.count);
  return { modes: modes.slice(0, 12), exploratoryGaps: gaps };
}

export function pairWithinModes(
  faces: Segment[],
  modes: GapMode[],
  orientation: "H" | "V",
  _dimSegIds: Set<number> = new Set(),
): FacePair[] {
  if (modes.length === 0) return [];
  const list = faces.filter((s) => s.orientation === orientation);
  const sorted = [...list].sort(
    (a, b) => axisRange(a, orientation).pos - axisRange(b, orientation).pos,
  );
  const maxGap = Math.max(...modes.map((m) => m.center + m.halfWidth)) + 0.5;
  const pairs: FacePair[] = [];
  const used = new Set<string>();

  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i]!;
    // Do NOT exclude dim-string segIds — wall faces can be mis-tagged.
    const ar = axisRange(a, orientation);
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j]!;
      const br = axisRange(b, orientation);
      const gap = Math.abs(br.pos - ar.pos);
      if (gap > maxGap) break;
      if (gap < 1.5) continue;
      const overlap = Math.min(ar.hi, br.hi) - Math.max(ar.lo, br.lo);
      if (overlap < 35) continue;
      if (Math.abs(a.strokeWidth - b.strokeWidth) > 0.55) continue;

      let bestMode: GapMode | null = null;
      let bestDist = Infinity;
      for (const m of modes) {
        const dist = Math.abs(gap - m.center);
        if (dist <= m.halfWidth && dist < bestDist) {
          bestDist = dist;
          bestMode = m;
        }
      }
      if (!bestMode) continue;

      const key = [a.id, b.id].sort((x, y) => x - y).join(":");
      if (used.has(key)) continue;
      used.add(key);
      pairs.push({
        id: `pair:${orientation}:${key}`,
        aId: a.id,
        bId: b.id,
        orientation,
        gap,
        overlap,
        modeCenter: bestMode.center,
        midA: mid(a),
        midB: mid(b),
      });
    }
  }
  return pairs;
}

function mergeCollinearAlongLine(
  segs: Segment[],
  orientation: "H" | "V",
  mergeMax: number,
  openingScale: number,
): {
  chains: Segment[][];
  openingGaps: Array<{ gapPt: number; at: Point }>;
} {
  if (segs.length === 0) return { chains: [], openingGaps: [] };
  const sorted = [...segs].sort((a, b) => {
    const ar = axisRange(a, orientation);
    const br = axisRange(b, orientation);
    return ar.lo - br.lo;
  });
  const chains: Segment[][] = [];
  const openingGaps: Array<{ gapPt: number; at: Point }> = [];
  let current: Segment[] = [sorted[0]!];
  let curHi = axisRange(sorted[0]!, orientation).hi;

  for (let i = 1; i < sorted.length; i++) {
    const s = sorted[i]!;
    const r = axisRange(s, orientation);
    const gap = r.lo - curHi;
    if (gap <= mergeMax || (gap <= 0 && r.hi > curHi - 1)) {
      current.push(s);
      curHi = Math.max(curHi, r.hi);
    } else if (gap > openingScale) {
      const at =
        orientation === "H"
          ? { x: curHi + gap / 2, y: axisRange(current[0]!, orientation).pos }
          : { x: axisRange(current[0]!, orientation).pos, y: curHi + gap / 2 };
      openingGaps.push({ gapPt: gap, at });
      chains.push(current);
      current = [s];
      curHi = r.hi;
    } else {
      // Ambiguous medium gap — fail closed: split, record suspect
      const at =
        orientation === "H"
          ? { x: curHi + gap / 2, y: axisRange(current[0]!, orientation).pos }
          : { x: axisRange(current[0]!, orientation).pos, y: curHi + gap / 2 };
      openingGaps.push({ gapPt: gap, at });
      chains.push(current);
      current = [s];
      curHi = r.hi;
    }
  }
  chains.push(current);
  return { chains, openingGaps };
}

/** Build physical runs from pairs — includes B2.2D midCut side-split fix. */
export function buildRunsFromPairs(
  pairs: FacePair[],
  byId: Map<number, Segment>,
  pageNumber: number,
): PhysicalWallRunCandidate[] {
  type Seed = FacePair & { lo: number; hi: number; pos: number };
  const seeds: Seed[] = [];
  for (const p of pairs) {
    const a = byId.get(p.aId);
    const b = byId.get(p.bId);
    if (!a || !b) continue;
    const ar = axisRange(a, p.orientation);
    const br = axisRange(b, p.orientation);
    const lo = Math.max(ar.lo, br.lo);
    const hi = Math.min(ar.hi, br.hi);
    if (hi - lo < 35) continue;
    seeds.push({
      ...p,
      lo,
      hi,
      pos: (ar.pos + br.pos) / 2,
    });
  }

  const used = new Set<number>();
  const runs: PhysicalWallRunCandidate[] = [];

  const allFaceLens = [...byId.values()].map((s) => s.length);
  const medianLen =
    allFaceLens.sort((a, b) => a - b)[Math.floor(allFaceLens.length / 2)] ?? 40;
  const mergeMax = Math.min(12, Math.max(3, medianLen * 0.05));
  const openingScale = Math.max(40, mergeMax * 4);

  for (let i = 0; i < seeds.length; i++) {
    if (used.has(i)) continue;
    const cluster = [seeds[i]!];
    used.add(i);
    let changed = true;
    while (changed) {
      changed = false;
      const c0 = cluster[0]!;
      const clo = Math.min(...cluster.map((c) => c.lo));
      const chi = Math.max(...cluster.map((c) => c.hi));
      const cpos = cluster.reduce((s, c) => s + c.pos, 0) / cluster.length;
      const cgap = cluster.reduce((s, c) => s + c.gap, 0) / cluster.length;
      for (let j = 0; j < seeds.length; j++) {
        if (used.has(j)) continue;
        const s = seeds[j]!;
        if (s.orientation !== c0.orientation) continue;
        if (Math.abs(s.pos - cpos) > Math.max(2, cgap * 0.35)) continue;
        if (Math.abs(s.gap - cgap) > Math.max(1.2, cgap * 0.25)) continue;
        const gapAlong = Math.max(0, Math.max(clo, s.lo) === clo ? s.lo - chi : clo - s.hi);
        const overlaps = !(s.hi < clo - mergeMax || s.lo > chi + mergeMax);
        if (!overlaps && gapAlong > openingScale) continue;
        if (!overlaps && gapAlong > mergeMax) continue;
        cluster.push(s);
        used.add(j);
        changed = true;
      }
    }

    const faceIds = new Set<number>();
    const gaps: number[] = [];
    for (const c of cluster) {
      faceIds.add(c.aId);
      faceIds.add(c.bId);
      gaps.push(c.gap);
    }
    const faceSegs = [...faceIds]
      .map((id) => byId.get(id)!)
      .filter(Boolean);
    const ori = cluster[0]!.orientation;

    // midCut side split (B2.2D fix — not median<=)
    const byPos = faceSegs
      .map((s) => ({ s, pos: axisRange(s, ori).pos }))
      .sort((a, b) => a.pos - b.pos);
    if (byPos.length < 2) continue;
    const minPos = byPos[0]!.pos;
    const maxPos = byPos[byPos.length - 1]!.pos;
    if (maxPos - minPos < 1.5) continue;
    const midCut = (minPos + maxPos) / 2;
    const sideA = byPos.filter((p) => p.pos <= midCut).map((p) => p.s);
    const sideB = byPos.filter((p) => p.pos > midCut).map((p) => p.s);
    if (sideA.length === 0 || sideB.length === 0) continue;

    const mergeA = mergeCollinearAlongLine(sideA, ori, mergeMax, openingScale);
    const mergeB = mergeCollinearAlongLine(sideB, ori, mergeMax, openingScale);

    const longest = (chains: Segment[][]) =>
      chains.slice().sort((a, b) => {
        const la =
          Math.max(...a.map((s) => axisRange(s, ori).hi)) -
          Math.min(...a.map((s) => axisRange(s, ori).lo));
        const lb =
          Math.max(...b.map((s) => axisRange(s, ori).hi)) -
          Math.min(...b.map((s) => axisRange(s, ori).lo));
        return lb - la;
      })[0] ?? [];

    const chainsA = mergeA.chains.length > 0 ? mergeA.chains : [sideA];
    const chainsB = mergeB.chains.length > 0 ? mergeB.chains : [sideB];

    const emitChainPair = (ca: Segment[], cb: Segment[]) => {
      if (ca.length === 0 || cb.length === 0) return;
      const aRep = ca[0]!;
      const bRep = cb[0]!;
      const ar = {
        lo: Math.min(...ca.map((s) => axisRange(s, ori).lo)),
        hi: Math.max(...ca.map((s) => axisRange(s, ori).hi)),
        pos: axisRange(aRep, ori).pos,
      };
      const br = {
        lo: Math.min(...cb.map((s) => axisRange(s, ori).lo)),
        hi: Math.max(...cb.map((s) => axisRange(s, ori).hi)),
        pos: axisRange(bRep, ori).pos,
      };
      const lo = Math.max(ar.lo, br.lo);
      const hi = Math.min(ar.hi, br.hi);
      if (hi - lo < 30) return;

      const ids = [...new Set([...ca, ...cb].map((s) => s.id))].sort(
        (a, b) => a - b,
      );
      const hash = createHash("sha1")
        .update(`p${pageNumber}:${ori}:${ids.join(",")}`)
        .digest("hex")
        .slice(0, 12);
      const pos = (ar.pos + br.pos) / 2;
      const centerline =
        ori === "H"
          ? { x1: lo, y1: pos, x2: hi, y2: pos }
          : { x1: pos, y1: lo, x2: pos, y2: hi };
      const thickness =
        gaps.length > 0
          ? gaps.reduce((s, g) => s + g, 0) / gaps.length
          : Math.abs(ar.pos - br.pos);
      const openingGapSuspects = [
        ...mergeA.openingGaps.map((g) => ({
          along: "faceA" as const,
          gapPt: g.gapPt,
          at: g.at,
        })),
        ...mergeB.openingGaps.map((g) => ({
          along: "faceB" as const,
          gapPt: g.gapPt,
          at: g.at,
        })),
      ];
      const lengthPt = hi - lo;
      let confidence: "high" | "medium" | "low" = "medium";
      if (lengthPt >= 120 && openingGapSuspects.length === 0 && ids.length >= 2) {
        confidence = "high";
      }
      if (lengthPt < 60 || ids.length < 2) confidence = "low";

      runs.push({
        id: `run:p${pageNumber}:${hash}`,
        pageNumber,
        orientation: ori,
        faceSegmentIds: ids,
        facePairGapsPt: gaps.map((g) => Number(g.toFixed(2))),
        thicknessPt: Number(thickness.toFixed(2)),
        centerline,
        endpoints: [
          { x: centerline.x1, y: centerline.y1 },
          { x: centerline.x2, y: centerline.y2 },
        ],
        connectedRunIds: [],
        junctions: [],
        openingGapSuspects,
        confidence,
        unresolvedReason: null,
        lengthPt: Number(lengthPt.toFixed(2)),
        mid: {
          x: (centerline.x1 + centerline.x2) / 2,
          y: (centerline.y1 + centerline.y2) / 2,
        },
      });
    };

    if (chainsA.length === 1 && chainsB.length === 1) {
      emitChainPair(longest(chainsA), longest(chainsB));
    } else {
      for (const ca of chainsA) {
        const alo = Math.min(...ca.map((s) => axisRange(s, ori).lo));
        const ahi = Math.max(...ca.map((s) => axisRange(s, ori).hi));
        let best: Segment[] | null = null;
        let bestOv = 0;
        for (const cb of chainsB) {
          const blo = Math.min(...cb.map((s) => axisRange(s, ori).lo));
          const bhi = Math.max(...cb.map((s) => axisRange(s, ori).hi));
          const ov = Math.min(ahi, bhi) - Math.max(alo, blo);
          if (ov > bestOv) {
            bestOv = ov;
            best = cb;
          }
        }
        if (best && bestOv >= 30) emitChainPair(ca, best);
      }
    }
  }

  const deduped: PhysicalWallRunCandidate[] = [];
  for (const r of runs.sort((a, b) => b.lengthPt - a.lengthPt)) {
    const clash = deduped.find((d) => {
      if (d.orientation !== r.orientation) return false;
      const dist = Math.hypot(d.mid.x - r.mid.x, d.mid.y - r.mid.y);
      const lenRatio =
        Math.min(d.lengthPt, r.lengthPt) / Math.max(d.lengthPt, r.lengthPt);
      return dist < 8 && lenRatio > 0.7;
    });
    if (!clash) deduped.push(r);
  }
  return deduped;
}
