import type { Segment } from "../sgg/extractSegments.js";

export type Bbox = { x0: number; y0: number; x1: number; y1: number };

export type TableGridLine = {
  orientation: "H" | "V";
  position: number;
  segmentIds: number[];
  strokeWidth: number;
};

export type TableGrid = {
  horizontalLines: TableGridLine[];
  verticalLines: TableGridLine[];
  bbox: Bbox;
  cellCount: number;
};

const MIN_RULE_LENGTH = 40;
const LINE_CLUSTER_TOL = 3;

function clusterLines(
  segments: readonly Segment[],
  orientation: "H" | "V",
  region: Bbox,
): TableGridLine[] {
  const rules = segments.filter((s) => {
    if (s.orientation !== orientation) return false;
    if (s.length < MIN_RULE_LENGTH) return false;
    const midX = (s.x1 + s.x2) / 2;
    const midY = (s.y1 + s.y2) / 2;
    if (midX < region.x0 || midX > region.x1) return false;
    if (midY < region.y0 || midY > region.y1) return false;
    return true;
  });

  const positions: Array<{ pos: number; seg: Segment }> = rules.map((s) => ({
    pos: orientation === "H" ? (s.y1 + s.y2) / 2 : (s.x1 + s.x2) / 2,
    seg: s,
  }));
  positions.sort((a, b) => a.pos - b.pos);

  const clusters: Array<{ pos: number; segmentIds: number[]; strokeWidths: number[] }> =
    [];
  for (const { pos, seg } of positions) {
    const last = clusters[clusters.length - 1];
    if (last && Math.abs(pos - last.pos) <= LINE_CLUSTER_TOL) {
      last.segmentIds.push(seg.id);
      last.strokeWidths.push(seg.strokeWidth);
      last.pos = (last.pos * (last.segmentIds.length - 1) + pos) / last.segmentIds.length;
    } else {
      clusters.push({ pos, segmentIds: [seg.id], strokeWidths: [seg.strokeWidth] });
    }
  }

  return clusters.map((c) => ({
    orientation,
    position: c.pos,
    segmentIds: c.segmentIds,
    strokeWidth:
      c.strokeWidths.reduce((a, b) => a + b, 0) / Math.max(c.strokeWidths.length, 1),
  }));
}

/**
 * Reconstruct H/V table rule lines from pdf.js segments within a region.
 */
export function reconstructTableGridFromSegments(input: {
  segments: readonly Segment[];
  region: Bbox;
}): TableGrid {
  const { segments, region } = input;
  const horizontalLines = clusterLines(segments, "H", region);
  const verticalLines = clusterLines(segments, "V", region);
  const rows = Math.max(horizontalLines.length - 1, 0);
  const cols = Math.max(verticalLines.length - 1, 0);

  return {
    horizontalLines,
    verticalLines,
    bbox: region,
    cellCount: rows * cols,
  };
}

export function auditVectorGridFeasibility(grid: TableGrid): {
  reliableRowLines: number;
  reliableColLines: number;
  feasible: boolean;
  cellCount: number;
} {
  const reliableRowLines = grid.horizontalLines.length;
  const reliableColLines = grid.verticalLines.length;
  const rows = Math.max(reliableRowLines - 1, 0);
  const cols = Math.max(reliableColLines - 1, 0);
  const cellCount = rows * cols;
  return {
    reliableRowLines,
    reliableColLines,
    feasible:
      reliableRowLines >= 4 &&
      reliableColLines >= 2 &&
      cellCount <= 120,
    cellCount,
  };
}

export function cellBboxesFromGrid(grid: TableGrid): Bbox[] {
  const hs = grid.horizontalLines.map((l) => l.position).sort((a, b) => a - b);
  const vs = grid.verticalLines.map((l) => l.position).sort((a, b) => a - b);
  const cells: Bbox[] = [];
  for (let ri = 0; ri < hs.length - 1; ri++) {
    for (let ci = 0; ci < vs.length - 1; ci++) {
      cells.push({
        x0: vs[ci]!,
        y0: hs[ri]!,
        x1: vs[ci + 1]!,
        y1: hs[ri + 1]!,
      });
    }
  }
  return cells;
}
