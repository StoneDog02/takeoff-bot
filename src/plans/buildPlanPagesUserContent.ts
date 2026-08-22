import { readFile } from "node:fs/promises";

import type {
  ContentBlockParam,
  ImageBlockParam,
  TextBlockParam,
} from "@anthropic-ai/sdk/resources/messages.js";

import type { PlanPage } from "./PlanPage.js";
import type { PlanPageVisual } from "./PlanPageVisual.js";
import type { PlanPageVisualTile } from "./PlanPageVisualTile.js";

export interface BuildPlanPageContentBlocksInput {
  page: PlanPage;
  visual?: PlanPageVisual | null;
  tiles?: readonly PlanPageVisualTile[];
}

function textBlock(text: string): TextBlockParam {
  return { type: "text", text };
}

async function imageBlockFromPngPath(
  imagePath: string,
  mediaType: "image/png",
): Promise<ImageBlockParam> {
  const bytes = await readFile(imagePath);
  if (bytes.byteLength === 0) {
    throw new Error(`buildPlanPageContentBlocks: empty image at '${imagePath}'.`);
  }

  return {
    type: "image",
    source: {
      type: "base64",
      media_type: mediaType,
      data: bytes.toString("base64"),
    },
  };
}

/**
 * Builds Anthropic content blocks for one plan page with explicit pageNumber
 * provenance. Includes text when present, optional full-page visual, and
 * optional geometry-based tiles labeled by tileId (not semantic region names).
 */
export async function buildPlanPageContentBlocks(
  input: BuildPlanPageContentBlocksInput,
): Promise<ContentBlockParam[]> {
  const { page, visual } = input;
  const tiles = [...(input.tiles ?? [])].sort((left, right) =>
    left.tileId < right.tileId ? -1 : left.tileId > right.tileId ? 1 : 0,
  );

  if (visual && visual.pageNumber !== page.pageNumber) {
    throw new Error(
      `buildPlanPageContentBlocks: visual pageNumber ${visual.pageNumber} does not match page ${page.pageNumber}.`,
    );
  }

  for (const tile of tiles) {
    if (tile.pageNumber !== page.pageNumber) {
      throw new Error(
        `buildPlanPageContentBlocks: tile ${tile.tileId} pageNumber ${tile.pageNumber} does not match page ${page.pageNumber}.`,
      );
    }
  }

  const blocks: ContentBlockParam[] = [
    textBlock(
      [
        `## Page ${page.pageNumber}`,
        `sheetId: ${page.sheetId ?? "null"}`,
        `label: ${page.label ?? "null"}`,
        visual
          ? `visual: attached full sheet (pageNumber=${visual.pageNumber}, ${visual.widthPx}x${visual.heightPx}px, scale=${visual.scale})`
          : "visual: none",
        tiles.length > 0
          ? `tiles: ${tiles.length} attached (${tiles.map((tile) => tile.tileId).join(", ")})`
          : "tiles: none",
      ].join("\n"),
    ),
  ];

  const trimmedText = page.textContent.trim();
  if (trimmedText.length > 0) {
    blocks.push(textBlock(`Page text:\n${trimmedText}`));
  } else {
    blocks.push(
      textBlock(
        "Page text: (empty — no usable machine-readable text layer on this page)",
      ),
    );
  }

  if (visual) {
    blocks.push(
      textBlock(
        [
          `## Page ${page.pageNumber} — Full Sheet`,
          `pageNumber=${page.pageNumber}`,
          "Use this image as whole-sheet spatial context.",
          "When a fact is read only from this Full Sheet image, set source.tileId to null.",
        ].join("\n"),
      ),
    );
    blocks.push(
      await imageBlockFromPngPath(visual.imagePath, visual.mediaType),
    );
  }

  for (const tile of tiles) {
    const g = tile.geometry;
    blocks.push(
      textBlock(
        [
          `## Page ${page.pageNumber} — Tile ${tile.tileId}`,
          `pageNumber=${page.pageNumber}`,
          `tileId=${tile.tileId}`,
          `geometryPixels: x=${g.x} y=${g.y} width=${g.width} height=${g.height}`,
          `geometryNormalized: x=${g.normalizedX.toFixed(6)} y=${g.normalizedY.toFixed(6)} width=${g.normalizedWidth.toFixed(6)} height=${g.normalizedHeight.toFixed(6)}`,
          `grid: row=${g.row} col=${g.col} columns=${g.gridColumns} rows=${g.gridRows} overlapFraction=${g.overlapFraction}`,
          `When a fact is read from THIS tile image, set source.tileId to "${tile.tileId}".`,
          "Provenance label only — not a semantic interpretation of sheet content.",
        ].join("\n"),
      ),
    );
    blocks.push(
      await imageBlockFromPngPath(tile.imagePath, tile.mediaType),
    );
  }

  return blocks;
}

export interface BuildPlanPagesUserContentInput {
  pages: readonly PlanPage[];
  visualsByPageNumber?: ReadonlyMap<number, PlanPageVisual>;
  tilesByPageNumber?: ReadonlyMap<number, readonly PlanPageVisualTile[]>;
  preambleText: string;
}

/**
 * Assembles a multimodal user message content array for Stage 5.
 * Pure construction helper — does not call Anthropic.
 */
export async function buildPlanPagesUserContent(
  input: BuildPlanPagesUserContentInput,
): Promise<ContentBlockParam[]> {
  const blocks: ContentBlockParam[] = [textBlock(input.preambleText)];

  for (const page of input.pages) {
    const visual = input.visualsByPageNumber?.get(page.pageNumber) ?? null;
    const tiles = input.tilesByPageNumber?.get(page.pageNumber) ?? [];
    const pageBlocks = await buildPlanPageContentBlocks({
      page,
      visual,
      tiles,
    });
    blocks.push(...pageBlocks);
  }

  return blocks;
}

/** Counts image blocks that would be sent for the given maps. */
export function countVisualImageBlocks(input: {
  pages: readonly PlanPage[];
  visualsByPageNumber?: ReadonlyMap<number, PlanPageVisual>;
  tilesByPageNumber?: ReadonlyMap<number, readonly PlanPageVisualTile[]>;
}): number {
  let count = 0;
  for (const page of input.pages) {
    if (input.visualsByPageNumber?.has(page.pageNumber)) {
      count += 1;
    }
    count += input.tilesByPageNumber?.get(page.pageNumber)?.length ?? 0;
  }
  return count;
}
