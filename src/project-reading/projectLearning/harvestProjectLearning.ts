import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { convert } from "@opendataloader/pdf";

import { renderPagePng } from "../../compiler/dimensions/dimOwnership.js";
import { extractScheduleFromRowBands } from "../../compiler/semantic-definitions/extractScheduleFromRowBands.js";
import { createScheduleOcrWorker } from "../../compiler/semantic-mark-recovery/markOcr.js";
import type { PlanIndex } from "../../pdf/PlanIndex.js";
import { ensureProjectLearningHybridServer } from "./ensureProjectLearningHybridServer.js";
import {
  countStructuredOdlElements,
  projectLearningCandidateSchema,
  projectLearningHarvestTelemetrySchema,
  type ProjectLearningCandidate,
  type ProjectLearningHarvestTelemetry,
  type ProjectLearningSourceKind,
} from "./projectLearningTypes.js";

export type HarvestProjectLearningInput = {
  pdfPath: string;
  pageNumbers: number[];
  preferHybrid: boolean;
  /** Directory that persists structured ODL JSON for the run (not deleted). */
  outputDir: string;
  planIndex: PlanIndex;
  /** Injected candidates for tests / OCR fallback without live ODL. */
  seedCandidates?: ProjectLearningCandidate[];
  /** When false, skip live ODL convert (tests / Hybrid unavailable). */
  allowLiveOdl?: boolean;
  /** Test seam: inject OCR fallback candidates instead of live OCR. */
  ocrFallbackCandidates?: ProjectLearningCandidate[];
  /** Test seam: skip ensuring / calling Hybrid server. */
  skipHybridServerEnsure?: boolean;
};

export type HarvestProjectLearningResult = {
  candidates: ProjectLearningCandidate[];
  /** Alias of telemetry.hybridActuallyUsed for older callers. */
  hybridUsed: boolean;
  telemetry: ProjectLearningHarvestTelemetry;
  timingMs: number;
  rawArtifactPaths: string[];
};

function guessDefinitionFamily(
  content: string,
): ProjectLearningCandidate["definitionKind"] | undefined {
  if (/SHEAR\s*WALL/i.test(content)) return "shear-wall";
  if (/WOOD\s*BEAM|HEADER\s*SCHEDULE|WB\d/i.test(content)) return "header";
  if (/HOLDOWN|HOLD\s*DOWN/i.test(content)) return "holdown";
  if (/CONNECTOR\s*SCHEDULE/i.test(content)) return "connector";
  if (/WALL\s*LEGEND|ABBREVIAT/i.test(content)) return "wall-type";
  return undefined;
}

/** Collect nested paragraph/cell text for richer Claude region payloads. */
function collectNestedText(node: unknown, depth = 0): string {
  if (!node || depth > 8) return "";
  if (Array.isArray(node)) {
    return node.map((child) => collectNestedText(child, depth + 1)).filter(Boolean).join(" | ");
  }
  if (typeof node !== "object") return "";
  const rec = node as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof rec.content === "string" && rec.content.trim()) {
    parts.push(rec.content.trim());
  }
  for (const key of ["kids", "rows", "cells"]) {
    if (rec[key]) {
      const nested = collectNestedText(rec[key], depth + 1);
      if (nested) parts.push(nested);
    }
  }
  return parts.join(" | ");
}

function emptyTelemetry(
  partial: Partial<ProjectLearningHarvestTelemetry> = {},
): ProjectLearningHarvestTelemetry {
  return projectLearningHarvestTelemetrySchema.parse({
    hybridRequested: false,
    hybridActuallyUsed: false,
    hybridFallbackOccurred: false,
    forceOcrRequested: false,
    structuredElementsRecovered: 0,
    ocrFallbackUsed: false,
    ...partial,
  });
}

export function walkOdlKids(
  node: unknown,
  out: ProjectLearningCandidate[],
  sourceKind: ProjectLearningSourceKind,
  pageFilter: Set<number>,
): void {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const child of node) walkOdlKids(child, out, sourceKind, pageFilter);
    return;
  }
  if (typeof node !== "object") return;
  const rec = node as Record<string, unknown>;
  const pageNumber = rec["page number"];
  const type = typeof rec.type === "string" ? rec.type : "unknown";
  const nestedText = collectNestedText(rec);
  const content =
    typeof rec.content === "string" && rec.content.trim().length > 0
      ? rec.content
      : type === "table"
        ? nestedText ||
          `table rows=${String(rec["number of rows"] ?? "?")} cols=${String(rec["number of columns"] ?? "?")}`
        : nestedText;

  if (
    typeof pageNumber === "number" &&
    pageFilter.has(pageNumber) &&
    (type === "table" ||
      type === "heading" ||
      type === "paragraph" ||
      (typeof content === "string" && content.length > 0))
  ) {
    const bboxArr = Array.isArray(rec["bounding box"])
      ? (rec["bounding box"] as number[])
      : null;
    const id = `pl-${sourceKind}-p${pageNumber}-${out.length + 1}`;
    out.push(
      projectLearningCandidateSchema.parse({
        id,
        pageNumber,
        sourceKind,
        elementType: type,
        bbox:
          bboxArr && bboxArr.length === 4
            ? {
                left: Number(bboxArr[0]),
                bottom: Number(bboxArr[1]),
                right: Number(bboxArr[2]),
                top: Number(bboxArr[3]),
              }
            : undefined,
        rawValue: content || `[${type}]`,
        validationStatus: "harvested",
        definitionKind: guessDefinitionFamily(content || type),
        tableHint: type === "table" ? content : undefined,
      }),
    );
  }

  for (const value of Object.values(rec)) {
    if (value && typeof value === "object") {
      walkOdlKids(value, out, sourceKind, pageFilter);
    }
  }
}

/**
 * True when ODL output has usable structured kids (not image-only).
 */
export function odlDocumentHasStructuredContent(
  document: unknown,
  pageFilter?: ReadonlySet<number>,
): boolean {
  const kids =
    document &&
    typeof document === "object" &&
    Array.isArray((document as { kids?: unknown }).kids)
      ? (document as { kids: unknown[] }).kids
      : [];
  return countStructuredOdlElements(kids, pageFilter) > 0;
}

async function loadOdlCandidatesFromDir(input: {
  outputDir: string;
  pageNumbers: number[];
  sourceKind: ProjectLearningSourceKind;
}): Promise<{
  candidates: ProjectLearningCandidate[];
  structuredElementsRecovered: number;
  rawPaths: string[];
}> {
  const files = (await readdir(input.outputDir)).filter(
    (f) => f.endsWith(".json") && f !== "harvest-summary.json",
  );
  const candidates: ProjectLearningCandidate[] = [];
  const pageFilter = new Set(input.pageNumbers);
  const rawPaths: string[] = [];
  let structuredElementsRecovered = 0;

  for (const file of files) {
    const full = path.join(input.outputDir, file);
    rawPaths.push(full);
    const document = JSON.parse(await readFile(full, "utf8")) as unknown;
    const kids =
      document &&
      typeof document === "object" &&
      Array.isArray((document as { kids?: unknown }).kids)
        ? (document as { kids: unknown[] }).kids
        : [];
    structuredElementsRecovered += countStructuredOdlElements(kids, pageFilter);
    walkOdlKids(kids, candidates, input.sourceKind, pageFilter);
  }

  return { candidates, structuredElementsRecovered, rawPaths };
}

async function rowBandAssistCandidates(input: {
  pdfPath: string;
  pageNumbers: number[];
}): Promise<ProjectLearningCandidate[]> {
  const out: ProjectLearningCandidate[] = [];
  const pageWidth = 2592;
  const pageHeight = 1728;
  for (const pageNumber of input.pageNumbers) {
    try {
      const rowBand = await extractScheduleFromRowBands({
        pdfPath: input.pdfPath,
        pageNumber,
        pageWidth,
        pageHeight,
      });
      for (const def of rowBand.block.definitions) {
        out.push(
          projectLearningCandidateSchema.parse({
            id: `pl-ocr-row-band-p${pageNumber}-${def.semanticTypeKey}`,
            pageNumber,
            sourceKind: "ocr-row-band",
            elementType: "schedule-row",
            bbox: {
              left: def.sourceRegion.x0,
              bottom: def.sourceRegion.y0,
              right: def.sourceRegion.x1,
              top: def.sourceRegion.y1,
            },
            rawValue: def.properties
              .map((p) => `${p.propertyPath}=${p.rawText}`)
              .join("; "),
            validationStatus: "harvested",
            definitionKind: def.definitionKind,
            semanticTypeKey: def.semanticTypeKey,
            properties: def.properties.map((p) => ({
              propertyPath: p.propertyPath,
              rawText: p.rawText,
            })),
            tableHint: "shear-wall-row-band",
          }),
        );
      }
    } catch {
      // optional
    }
  }
  return out;
}

async function ocrFallbackHarvest(input: {
  pdfPath: string;
  pageNumbers: number[];
  planIndex: PlanIndex;
}): Promise<ProjectLearningCandidate[]> {
  const out: ProjectLearningCandidate[] = [];
  const worker = await createScheduleOcrWorker();
  try {
    for (const pageNumber of input.pageNumbers) {
      try {
        const rendered = await renderPagePng(input.pdfPath, pageNumber, 2);
        const ocr = await worker.recognize(rendered.png);
        const text = ocr.text.trim();
        if (text.length > 0) {
          out.push(
            projectLearningCandidateSchema.parse({
              id: `pl-ocr-fullpage-p${pageNumber}`,
              pageNumber,
              sourceKind: "ocr-fullpage",
              elementType: "full-page-ocr",
              rawValue: text.slice(0, 12000),
              validationStatus: "harvested",
              definitionKind: guessDefinitionFamily(text),
              tableHint: /SCHEDULE|LEGEND|NOTES/i.test(text)
                ? "full-page-ocr-schedule-or-notes"
                : undefined,
            }),
          );
        }
      } catch {
        // continue other pages
      }
    }
  } finally {
    await worker.terminate();
  }
  out.push(
    ...(await rowBandAssistCandidates({
      pdfPath: input.pdfPath,
      pageNumbers: input.pageNumbers,
    })),
  );
  return out;
}

async function tryOdlHarvest(input: {
  pdfPath: string;
  pageNumbers: number[];
  preferHybrid: boolean;
  outputDir: string;
  planIndex: PlanIndex;
  skipHybridServerEnsure?: boolean;
  ocrFallbackCandidates?: ProjectLearningCandidate[];
}): Promise<{
  candidates: ProjectLearningCandidate[];
  telemetry: ProjectLearningHarvestTelemetry;
  rawPaths: string[];
}> {
  await mkdir(input.outputDir, { recursive: true });
  const pages = input.pageNumbers.join(",");
  const hybridRequested = input.preferHybrid;
  const forceOcrRequested = hybridRequested;

  let hybridUrl: string | undefined;
  if (hybridRequested && !input.skipHybridServerEnsure) {
    const ensured = await ensureProjectLearningHybridServer();
    hybridUrl = ensured.url;
  }

  const baseOptions: Record<string, unknown> = {
    outputDir: input.outputDir,
    format: "json",
    imageOutput: "off",
    quiet: true,
    keepLineBreaks: true,
    pages,
    tableMethod: "cluster",
    readingOrder: "xycut",
  };

  let hybridConvertSucceeded = false;
  let hybridActuallyUsed = false;
  let hybridFallbackOccurred = false;
  let sourceKind: ProjectLearningSourceKind = "odl-local";

  if (hybridRequested) {
    // Match audit Config C client: docling-fast. Use hybridMode=full on
    // textless sets so triage cannot skip the OCR-backed backend.
    // Do NOT set hybridFallback: true — silent Java image-only is not Hybrid success.
    const hybridOptions: Record<string, unknown> = {
      ...baseOptions,
      hybrid: "docling-fast",
      hybridMode: "full",
      hybridTimeout: "600000",
      hybridFallback: false,
    };
    if (hybridUrl) {
      hybridOptions.hybridUrl = hybridUrl;
    }

    try {
      await convert(
        input.pdfPath,
        hybridOptions as Parameters<typeof convert>[1],
      );
      hybridConvertSucceeded = true;
    } catch {
      hybridFallbackOccurred = true;
    }
  }

  if (!hybridConvertSucceeded) {
    try {
      await convert(
        input.pdfPath,
        baseOptions as Parameters<typeof convert>[1],
      );
    } catch {
      // Local convert may also fail; OCR fallback below.
    }
    if (hybridRequested) {
      hybridFallbackOccurred = true;
    }
  }

  let loaded = await loadOdlCandidatesFromDir({
    outputDir: input.outputDir,
    pageNumbers: input.pageNumbers,
    sourceKind: hybridConvertSucceeded ? "odl-hybrid" : "odl-local",
  });

  // Image-only / zero structured kids is not successful Hybrid processing.
  if (hybridRequested && hybridConvertSucceeded) {
    if (loaded.structuredElementsRecovered > 0) {
      hybridActuallyUsed = true;
      sourceKind = "odl-hybrid";
    } else {
      hybridActuallyUsed = false;
      hybridFallbackOccurred = true;
      sourceKind = "odl-local";
      // Re-tag any image-scraped candidates as local if present.
      loaded = {
        ...loaded,
        candidates: loaded.candidates.map((c) =>
          projectLearningCandidateSchema.parse({
            ...c,
            sourceKind: "odl-local",
            id: c.id.replace("odl-hybrid", "odl-local"),
          }),
        ),
      };
    }
  } else {
    sourceKind = "odl-local";
  }

  let candidates = loaded.candidates;
  let ocrFallbackUsed = false;
  const needOcrFallback =
    hybridRequested &&
    (hybridFallbackOccurred || loaded.structuredElementsRecovered === 0);

  if (needOcrFallback) {
    ocrFallbackUsed = true;
    hybridFallbackOccurred = true;
    const ocrCandidates =
      input.ocrFallbackCandidates ??
      (await ocrFallbackHarvest({
        pdfPath: input.pdfPath,
        pageNumbers: input.pageNumbers,
        planIndex: input.planIndex,
      }));
    candidates = [...candidates, ...ocrCandidates];
  } else {
    // Supplemental SW row-band assist for cross-check / Claude region crops —
    // does not replace Hybrid structure; stays harvested until interpret+validate.
    try {
      const rowBandOnly = await rowBandAssistCandidates({
        pdfPath: input.pdfPath,
        pageNumbers: input.pageNumbers,
      });
      if (rowBandOnly.length > 0) {
        candidates = [...candidates, ...rowBandOnly];
      }
    } catch {
      // optional assist
    }
  }

  void sourceKind;

  const telemetry = emptyTelemetry({
    hybridRequested,
    hybridActuallyUsed,
    hybridFallbackOccurred,
    forceOcrRequested,
    structuredElementsRecovered: loaded.structuredElementsRecovered,
    ocrFallbackUsed,
  });

  await writeFile(
    path.join(input.outputDir, "harvest-summary.json"),
    JSON.stringify(
      {
        ...telemetry,
        candidateCount: candidates.length,
        pages: input.pageNumbers,
      },
      null,
      2,
    ),
  );

  return { candidates, telemetry, rawPaths: loaded.rawPaths };
}

/**
 * Harvest Project Learning candidates. Persists ODL JSON when live convert runs.
 * Raw ODL text remains validationStatus=harvested (not context-eligible).
 */
export async function harvestProjectLearning(
  input: HarvestProjectLearningInput,
): Promise<HarvestProjectLearningResult> {
  const started = Date.now();
  if (input.seedCandidates && input.seedCandidates.length > 0) {
    return {
      candidates: input.seedCandidates.map((c) =>
        projectLearningCandidateSchema.parse({
          ...c,
          validationStatus: "harvested",
        }),
      ),
      hybridUsed: false,
      telemetry: emptyTelemetry(),
      timingMs: Date.now() - started,
      rawArtifactPaths: [],
    };
  }

  if (input.pageNumbers.length === 0) {
    return {
      candidates: [],
      hybridUsed: false,
      telemetry: emptyTelemetry(),
      timingMs: Date.now() - started,
      rawArtifactPaths: [],
    };
  }

  if (input.allowLiveOdl === false) {
    // Still allow injected OCR fallback for unit tests of the fallback gate.
    if (input.preferHybrid && input.ocrFallbackCandidates) {
      return {
        candidates: input.ocrFallbackCandidates,
        hybridUsed: false,
        telemetry: emptyTelemetry({
          hybridRequested: true,
          hybridActuallyUsed: false,
          hybridFallbackOccurred: true,
          forceOcrRequested: true,
          structuredElementsRecovered: 0,
          ocrFallbackUsed: true,
        }),
        timingMs: Date.now() - started,
        rawArtifactPaths: [],
      };
    }
    return {
      candidates: [],
      hybridUsed: false,
      telemetry: emptyTelemetry({
        hybridRequested: input.preferHybrid,
        forceOcrRequested: input.preferHybrid,
      }),
      timingMs: Date.now() - started,
      rawArtifactPaths: [],
    };
  }

  try {
    const result = await tryOdlHarvest({
      pdfPath: input.pdfPath,
      pageNumbers: input.pageNumbers,
      preferHybrid: input.preferHybrid,
      outputDir: input.outputDir,
      planIndex: input.planIndex,
      skipHybridServerEnsure: input.skipHybridServerEnsure,
      ocrFallbackCandidates: input.ocrFallbackCandidates,
    });
    return {
      candidates: result.candidates,
      hybridUsed: result.telemetry.hybridActuallyUsed,
      telemetry: result.telemetry,
      timingMs: Date.now() - started,
      rawArtifactPaths: result.rawPaths,
    };
  } catch {
    const ocrCandidates =
      input.ocrFallbackCandidates ??
      (await ocrFallbackHarvest({
        pdfPath: input.pdfPath,
        pageNumbers: input.pageNumbers,
        planIndex: input.planIndex,
      }).catch(() => [] as ProjectLearningCandidate[]));
    return {
      candidates: ocrCandidates,
      hybridUsed: false,
      telemetry: emptyTelemetry({
        hybridRequested: input.preferHybrid,
        hybridActuallyUsed: false,
        hybridFallbackOccurred: true,
        forceOcrRequested: input.preferHybrid,
        structuredElementsRecovered: 0,
        ocrFallbackUsed: ocrCandidates.length > 0,
      }),
      timingMs: Date.now() - started,
      rawArtifactPaths: [],
    };
  }
}
