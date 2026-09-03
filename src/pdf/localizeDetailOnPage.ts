import type { ContentBlockParam } from "@anthropic-ai/sdk/resources/messages.js";
import { readFile } from "node:fs/promises";

import { runClaudeJson } from "../ai/anthropic/runClaudeJson.js";
import type { PlanPageVisual } from "./PlanPageVisual.js";
import type { PlanPageVisualTile } from "./PlanPageVisualTile.js";
import {
  detailLocalizationResultSchema,
  filterLocalizationTilesToValidSet,
  type DetailLocalizationResult,
} from "./detailLocalization.js";
import type { PlanReferenceQueueItem } from "./PlanReferenceQueue.js";

function tileGridDescription(tiles: readonly PlanPageVisualTile[]): string {
  return [...tiles]
    .sort((left, right) =>
      left.tileId < right.tileId ? -1 : left.tileId > right.tileId ? 1 : 0,
    )
    .map((tile) => {
      const g = tile.geometry;
      return `- ${tile.tileId}: row=${g.row} col=${g.col} normalized=(${g.normalizedX.toFixed(3)},${g.normalizedY.toFixed(3)},${g.normalizedWidth.toFixed(3)},${g.normalizedHeight.toFixed(3)})`;
    })
    .join("\n");
}

/**
 * Localization-only Claude call: locate which geometry tiles contain a
 * requested detail on a full sheet. Does not extract framing Evidence.
 *
 * Visual strategy: full-sheet image + textual tile-grid map (no tile images).
 */
export async function localizeDetailOnPage(input: {
  queueItem: PlanReferenceQueueItem;
  pageVisual: PlanPageVisual;
  pageTiles: readonly PlanPageVisualTile[];
  architecturalSheetId?: string | null;
  onApiCall?: () => void;
  onUsage?: (usage: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationInputTokens: number | null;
    cacheReadInputTokens: number | null;
  }) => void;
}): Promise<DetailLocalizationResult> {
  const detailNumber = input.queueItem.detailNumber;
  if (!detailNumber) {
    throw new Error(
      "localizeDetailOnPage: queue item must have a detailNumber.",
    );
  }
  if (input.pageVisual.pageNumber !== input.queueItem.targetPageNumber) {
    throw new Error(
      `localizeDetailOnPage: visual page ${input.pageVisual.pageNumber} != target ${input.queueItem.targetPageNumber}.`,
    );
  }

  const validTileIds = new Set(input.pageTiles.map((tile) => tile.tileId));
  const bytes = await readFile(input.pageVisual.imagePath);
  const imageBlock: ContentBlockParam = {
    type: "image",
    source: {
      type: "base64",
      media_type: "image/png",
      data: bytes.toString("base64"),
    },
  };

  const sheet =
    input.architecturalSheetId ??
    input.queueItem.targetSheetId ??
    "unknown";

  const systemPrompt = `You locate construction-plan DETAIL callouts on a sheet image for navigation only.

Return JSON only matching the schema fields you are given.
Do NOT extract framing quantities, material takeoffs, or construction Evidence facts.
Do NOT invent detail numbers that are not visually present.
If the requested detail is not clearly visible, set visibility to not-visible or ambiguous.
matchingTileIds must be chosen only from the provided tile id list.
Prefer the fewest tiles that cover the detail title/body.`;

  const userContent: ContentBlockParam[] = [
    {
      type: "text",
      text: [
        `Locate DETAIL ${detailNumber} on sheet ${sheet} (pageNumber=${input.queueItem.targetPageNumber}).`,
        `PlanReference navigation key: ${input.queueItem.navigationKey}`,
        `Originating observations: ${input.queueItem.originatingObservations
          .map(
            (obs) =>
              `${obs.originatingSubjectKind}:${obs.originatingSubjectKey} (“${obs.originalText}”)`,
          )
          .join("; ")}`,
        "",
        "Geometry tile catalog for this page (choose matchingTileIds only from this list):",
        tileGridDescription(input.pageTiles),
        "",
        "Full sheet image follows.",
      ].join("\n"),
    },
    imageBlock,
    {
      type: "text",
      text: `Respond with JSON for locating detail ${detailNumber} only.`,
    },
  ];

  const raw = await runClaudeJson({
    systemPrompt,
    userContent,
    schema: detailLocalizationResultSchema,
    label: "detail localization",
    maxTokens: 4096,
    onApiCall: input.onApiCall,
    onUsage: input.onUsage,
  });

  const parsed = detailLocalizationResultSchema.parse({
    ...raw,
    requestedDetailNumber: detailNumber,
    targetSheetId: input.queueItem.targetSheetId,
    targetPageNumber: input.queueItem.targetPageNumber!,
  });

  return filterLocalizationTilesToValidSet(parsed, validTileIds);
}
