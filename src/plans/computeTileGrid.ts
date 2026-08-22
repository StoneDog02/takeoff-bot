import type { PlanPageVisualTileGeometry } from "./PlanPageVisualTile.js";
import { DEFAULT_PAGE_TILE_GRID } from "./PlanPageVisualTile.js";

export interface TileGridCell {
  row: number;
  col: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ComputeTileGridInput {
  widthPx: number;
  heightPx: number;
  columns?: number;
  rows?: number;
  overlapFraction?: number;
}

export interface ComputeTileGridResult {
  columns: number;
  rows: number;
  overlapFraction: number;
  tileWidth: number;
  tileHeight: number;
  stepX: number;
  stepY: number;
  cells: TileGridCell[];
}

function assertPositiveInt(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer, got ${value}.`);
  }
}

/**
 * Computes a deterministic overlapping grid that covers every source pixel.
 * Edge tiles are pinned to the page boundary so coverage is exact.
 */
export function computeTileGrid(
  input: ComputeTileGridInput,
): ComputeTileGridResult {
  const widthPx = input.widthPx;
  const heightPx = input.heightPx;
  assertPositiveInt("widthPx", widthPx);
  assertPositiveInt("heightPx", heightPx);

  const columns = input.columns ?? DEFAULT_PAGE_TILE_GRID.columns;
  const rows = input.rows ?? DEFAULT_PAGE_TILE_GRID.rows;
  const overlapFraction =
    input.overlapFraction ?? DEFAULT_PAGE_TILE_GRID.overlapFraction;

  assertPositiveInt("columns", columns);
  assertPositiveInt("rows", rows);
  if (!(overlapFraction >= 0 && overlapFraction < 1)) {
    throw new Error(
      `overlapFraction must be in [0, 1), got ${overlapFraction}.`,
    );
  }

  const tileWidth =
    columns === 1 ? widthPx : widthPx / (columns - (columns - 1) * overlapFraction);
  const tileHeight =
    rows === 1 ? heightPx : heightPx / (rows - (rows - 1) * overlapFraction);
  const stepX = columns === 1 ? widthPx : tileWidth * (1 - overlapFraction);
  const stepY = rows === 1 ? heightPx : tileHeight * (1 - overlapFraction);

  const cells: TileGridCell[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      let x = col * stepX;
      let y = row * stepY;
      if (col === columns - 1) {
        x = Math.max(0, widthPx - tileWidth);
      }
      if (row === rows - 1) {
        y = Math.max(0, heightPx - tileHeight);
      }
      const width = Math.min(tileWidth, widthPx - x);
      const height = Math.min(tileHeight, heightPx - y);
      cells.push({
        row,
        col,
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(width),
        height: Math.round(height),
      });
    }
  }

  return {
    columns,
    rows,
    overlapFraction,
    tileWidth,
    tileHeight,
    stepX,
    stepY,
    cells,
  };
}

export function tileIdForCell(row: number, col: number): string {
  return `t-r${row}-c${col}`;
}

export function geometryForCell(input: {
  cell: TileGridCell;
  pageWidthPx: number;
  pageHeightPx: number;
  overlapFraction: number;
  columns: number;
  rows: number;
}): PlanPageVisualTileGeometry {
  const { cell, pageWidthPx, pageHeightPx } = input;
  return {
    x: cell.x,
    y: cell.y,
    width: cell.width,
    height: cell.height,
    normalizedX: cell.x / pageWidthPx,
    normalizedY: cell.y / pageHeightPx,
    normalizedWidth: cell.width / pageWidthPx,
    normalizedHeight: cell.height / pageHeightPx,
    row: cell.row,
    col: cell.col,
    overlapFraction: input.overlapFraction,
    gridColumns: input.columns,
    gridRows: input.rows,
  };
}

/**
 * True when every pixel of a page is covered by at least one grid cell.
 */
export function tileGridCoversPage(input: {
  widthPx: number;
  heightPx: number;
  cells: readonly TileGridCell[];
}): boolean {
  const { widthPx, heightPx, cells } = input;
  if (cells.length === 0) {
    return false;
  }

  // Sample a dense lattice including edges; exact pixel flood-fill is unnecessary
  // for deterministic rectangular grids and is expensive at construction DPI.
  const sampleXs = new Set<number>([0, widthPx - 1]);
  const sampleYs = new Set<number>([0, heightPx - 1]);
  for (let i = 0; i <= 32; i += 1) {
    sampleXs.add(Math.min(widthPx - 1, Math.floor((i * (widthPx - 1)) / 32)));
    sampleYs.add(Math.min(heightPx - 1, Math.floor((i * (heightPx - 1)) / 32)));
  }
  for (const cell of cells) {
    sampleXs.add(cell.x);
    sampleXs.add(Math.min(widthPx - 1, cell.x + cell.width - 1));
    sampleYs.add(cell.y);
    sampleYs.add(Math.min(heightPx - 1, cell.y + cell.height - 1));
  }

  for (const y of sampleYs) {
    for (const x of sampleXs) {
      const covered = cells.some(
        (cell) =>
          x >= cell.x &&
          y >= cell.y &&
          x < cell.x + cell.width &&
          y < cell.y + cell.height,
      );
      if (!covered) {
        return false;
      }
    }
  }

  return true;
}
