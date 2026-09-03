import { readFile } from "node:fs/promises";

import type {
  ContentBlockParam,
  ImageBlockParam,
  TextBlockParam,
} from "@anthropic-ai/sdk/resources/messages.js";

import { runClaudeJson } from "../ai/anthropic/runClaudeJson.js";
import type { PlanIndex, PlanPage } from "./PlanPage.js";
import type { PlanPageVisual } from "./PlanPageVisual.js";
import type { ClassifiedPlanPage } from "./pageClassification.js";
import {
  VISUAL_CLASSIFICATION_PAGES_PER_REQUEST,
  mergeVisualPageClassifications,
  visualPageClassificationPayloadSchema,
  type VisualPageClassificationPayload,
} from "./visualPageClassification.js";

function textBlock(text: string): TextBlockParam {
  return { type: "text", text };
}

async function imageBlockFromPngPath(imagePath: string): Promise<ImageBlockParam> {
  const bytes = await readFile(imagePath);
  if (bytes.byteLength === 0) {
    throw new Error(`classifyPlanPagesVisually: empty image at '${imagePath}'.`);
  }
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: "image/png",
      data: bytes.toString("base64"),
    },
  };
}

export function buildVisualPageClassificationSystemPrompt(): string {
  return `You classify construction-plan PDF pages for routing only.

Return JSON only matching this shape:
{
  "pages": [
    {
      "pageNumber": number,
      "pageKind": "cover" | "plan" | "framing-plan" | "notes" | "schedule" | "detail" | "section" | "elevation" | "mixed" | "other" | "unknown",
      "scopeHints": array of zero or more of ["framing","wall","floor","roof","structural","openings","architectural","general"],
      "contentRoles": array of zero or more of ["plan-layout","notes","schedule","detail","index","elevation","section","other"],
      "titleOrLabel": string | null,
      "evidenceText": string,
      "confidenceLabel": "high" | "medium" | "low",
      "classificationReason": string
    }
  ]
}

Rules:
- Classify ONLY from what is visible on each attached full-sheet image.
- Identify sheet kind and scope hints (for example: floor framing plan, roof framing plan, structural notes, schedule, details).
- contentRoles must list affirmative visible content. For pageKind "mixed", contentRoles is required to distinguish plan-layout vs notes/schedule vs index.
- Include "plan-layout" only when a substantive plan or layout drawing is present (not tiny index thumbnails alone).
- Include "notes" / "schedule" when those content blocks are present.
- sheetId / outline codes in the prompt are opaque identity strings only. Do NOT invent semantics from numeric outline codes.
- If the title block or sheet content is unreadable, use pageKind "unknown" and confidenceLabel "low".
- Prefer "mixed" when a sheet clearly combines multiple major kinds and no single kind dominates.
- Prefer "unknown" over guessing.

Hard prohibitions — do NOT output:
- wall lengths, stud counts, stud spacing as takeoff facts
- plate/opening/header/joist/rafter/sheathing quantities
- material quantities or calculated takeoff values
- framing Evidence records of any kind

This pass answers only: what kind of page is this?`;
}

async function buildBatchUserContent(input: {
  pages: readonly PlanPage[];
  visualsByPage: Map<number, PlanPageVisual>;
}): Promise<ContentBlockParam[]> {
  const blocks: ContentBlockParam[] = [
    textBlock(
      [
        "Classify each attached construction-plan page.",
        "Each image is a FULL SHEET (no detail tiles).",
        "Respond with one JSON object covering exactly the listed pageNumbers.",
        "Do not invent pages. Do not omit pages.",
        "",
        `Expected pageNumbers: ${input.pages.map((page) => page.pageNumber).join(", ")}`,
      ].join("\n"),
    ),
  ];

  for (const page of input.pages) {
    const visual = input.visualsByPage.get(page.pageNumber);
    if (!visual) {
      throw new Error(
        `classifyPlanPagesVisually: missing full-sheet render for page ${page.pageNumber}.`,
      );
    }
    if (visual.pageNumber !== page.pageNumber) {
      throw new Error(
        `classifyPlanPagesVisually: visual pageNumber mismatch for page ${page.pageNumber}.`,
      );
    }

    blocks.push(
      textBlock(
        [
          `## Page ${page.pageNumber}`,
          `outlineIdentity/sheetId: ${page.sheetId ?? "null"} (opaque identity only — not a semantic role)`,
          `label: ${page.label ?? "null"} (opaque unless it contains readable words)`,
          `visual: full sheet ${visual.widthPx}x${visual.heightPx}px scale=${visual.scale}`,
        ].join("\n"),
      ),
      await imageBlockFromPngPath(visual.imagePath),
    );
  }

  return blocks;
}

function assertBatchPayloadCoversPages(
  payload: VisualPageClassificationPayload,
  expectedPageNumbers: readonly number[],
): void {
  const seen = new Set<number>();
  for (const page of payload.pages) {
    if (seen.has(page.pageNumber)) {
      throw new Error(
        `classifyPlanPagesVisually: duplicate classification for page ${page.pageNumber}.`,
      );
    }
    seen.add(page.pageNumber);
    if (!expectedPageNumbers.includes(page.pageNumber)) {
      throw new Error(
        `classifyPlanPagesVisually: unexpected pageNumber ${page.pageNumber} not in batch ${expectedPageNumbers.join(",")}.`,
      );
    }
  }
  for (const pageNumber of expectedPageNumbers) {
    if (!seen.has(pageNumber)) {
      throw new Error(
        `classifyPlanPagesVisually: missing classification for page ${pageNumber}.`,
      );
    }
  }
}

export interface ClassifyPlanPagesVisuallyInput {
  planIndex: PlanIndex;
  existingClassification: readonly ClassifiedPlanPage[];
  pageVisuals: readonly PlanPageVisual[];
  pagesPerRequest?: number;
  onApiCall?: () => void;
  onBatchComplete?: (info: {
    batchIndex: number;
    pageNumbers: number[];
    elapsedMs: number;
  }) => void;
}

export interface ClassifyPlanPagesVisuallyResult {
  classifiedPages: ClassifiedPlanPage[];
  batchPayloads: VisualPageClassificationPayload[];
  batchCount: number;
}

/**
 * Live visual page classification using full-sheet images only.
 * Batches pages and validates each Claude payload before merge.
 */
export async function classifyPlanPagesVisuallyViaClaude(
  input: ClassifyPlanPagesVisuallyInput,
): Promise<ClassifyPlanPagesVisuallyResult> {
  const pagesPerRequest =
    input.pagesPerRequest ?? VISUAL_CLASSIFICATION_PAGES_PER_REQUEST;
  const visualsByPage = new Map(
    input.pageVisuals.map((visual) => [visual.pageNumber, visual]),
  );
  const pending = input.existingClassification
    .filter((page) => page.needsVisualClassification)
    .sort((left, right) => left.pageNumber - right.pageNumber);

  if (pending.length === 0) {
    return {
      classifiedPages: [...input.existingClassification],
      batchPayloads: [],
      batchCount: 0,
    };
  }

  const pagesByNumber = new Map(
    input.planIndex.pages.map((page) => [page.pageNumber, page]),
  );
  const batchPayloads: VisualPageClassificationPayload[] = [];
  let merged = [...input.existingClassification];
  const systemPrompt = buildVisualPageClassificationSystemPrompt();

  for (let offset = 0; offset < pending.length; offset += pagesPerRequest) {
    const batchEntries = pending.slice(offset, offset + pagesPerRequest);
    const batchPages = batchEntries.map((entry) => {
      const page = pagesByNumber.get(entry.pageNumber);
      if (!page) {
        throw new Error(
          `classifyPlanPagesVisually: plan index missing page ${entry.pageNumber}.`,
        );
      }
      return page;
    });
    const pageNumbers = batchPages.map((page) => page.pageNumber);
    const batchIndex = Math.floor(offset / pagesPerRequest);
    const started = Date.now();

    const userContent = await buildBatchUserContent({
      pages: batchPages,
      visualsByPage,
    });

    // Ensure no tile imagery leaked into this classification request.
    const imageBlocks = userContent.filter((block) => block.type === "image");
    if (imageBlocks.length !== batchPages.length) {
      throw new Error(
        `classifyPlanPagesVisually: expected ${batchPages.length} full-sheet images, got ${imageBlocks.length}.`,
      );
    }

    const payload = await runClaudeJson({
      systemPrompt,
      userContent,
      schema: visualPageClassificationPayloadSchema,
      label: `visual page classification batch ${batchIndex + 1}`,
      maxTokens: 4096,
      onApiCall: input.onApiCall,
    });

    assertBatchPayloadCoversPages(payload, pageNumbers);
    batchPayloads.push(payload);
    merged = mergeVisualPageClassifications({
      existing: merged,
      visualPayload: payload,
    });

    input.onBatchComplete?.({
      batchIndex,
      pageNumbers,
      elapsedMs: Date.now() - started,
    });
  }

  return {
    classifiedPages: merged,
    batchPayloads,
    batchCount: batchPayloads.length,
  };
}
