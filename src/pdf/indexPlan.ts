import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { convert } from "@opendataloader/pdf";

import { computePdfContentHash } from "./computePdfContentHash.js";
import type { PlanIndex, PlanPage } from "./PlanIndex.js";
import { readPdfOutlinePageMap } from "./readPdfOutlinePageMap.js";

const PAGE_NUMBER_KEY = "page number";
const CONTENT_KEY = "content";
const NUMBER_OF_PAGES_KEY = "number of pages";

/**
 * Indexes a PDF file into a PlanIndex using OpenDataLoader text/structured
 * extraction. Page count and textContent come from the PDF. sheetId and label
 * are filled from PDF outline/bookmark titles when present (generic identity
 * only — not semantic page-type classification). sourceContentHash is the
 * SHA-256 of raw PDF bytes for visual-plan fingerprinting.
 */
export async function indexPlan(pdfPath: string): Promise<PlanIndex> {
  await assertPdfFile(pdfPath);

  const sourceContentHash = await computePdfContentHash(pdfPath);

  let pages: PlanPage[];
  try {
    pages = await extractPlanPages(pdfPath);
  } catch (error) {
    throw wrapIndexError(pdfPath, error);
  }

  pages = await enrichPagesWithOutlineIdentity(pdfPath, pages);

  return {
    pdfPath,
    totalPages: pages.length,
    pages,
    indexedAt: new Date().toISOString(),
    sourceContentHash,
  };
}

async function enrichPagesWithOutlineIdentity(
  pdfPath: string,
  pages: PlanPage[],
): Promise<PlanPage[]> {
  let outlineByPage: Map<number, string>;
  try {
    outlineByPage = await readPdfOutlinePageMap(pdfPath);
  } catch {
    // Outline enrichment is best-effort identity; text indexing already succeeded.
    return pages;
  }

  if (outlineByPage.size === 0) {
    return pages;
  }

  return pages.map((page) => {
    const outlineTitle = outlineByPage.get(page.pageNumber);
    if (!outlineTitle) {
      return page;
    }
    return {
      ...page,
      sheetId: page.sheetId ?? outlineTitle,
      label: page.label ?? outlineTitle,
    };
  });
}

async function assertPdfFile(pdfPath: string): Promise<void> {
  let stats;
  try {
    stats = await stat(pdfPath);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      throw new Error(`PDF file not found: ${pdfPath}`);
    }
    throw wrapIndexError(pdfPath, error);
  }

  if (!stats.isFile()) {
    throw new Error(`PDF path is not a file: ${pdfPath}`);
  }
}

async function extractPlanPages(pdfPath: string): Promise<PlanPage[]> {
  const resolvedPath = path.resolve(pdfPath);
  const outputDir = await mkdtemp(path.join(tmpdir(), "takeoff-bot-pdf-index-"));

  try {
    await convert(resolvedPath, {
      outputDir,
      format: "json",
      imageOutput: "off",
      quiet: true,
      keepLineBreaks: true,
    });

    const document = await readConversionJson(outputDir, resolvedPath);
    return mapDocumentToPlanPages(document, pdfPath);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
}

async function readConversionJson(
  outputDir: string,
  pdfPath: string,
): Promise<unknown> {
  const stem = path.basename(pdfPath, path.extname(pdfPath));
  const preferredPath = path.join(outputDir, `${stem}.json`);

  try {
    return JSON.parse(await readFile(preferredPath, "utf8"));
  } catch (error) {
    if (!isNodeError(error) || error.code !== "ENOENT") {
      throw error;
    }
  }

  const jsonFiles = (await readdir(outputDir)).filter((name) =>
    name.endsWith(".json"),
  );
  if (jsonFiles.length !== 1) {
    throw new Error(
      `OpenDataLoader did not write a JSON text-layer document for '${pdfPath}'.`,
    );
  }

  return JSON.parse(await readFile(path.join(outputDir, jsonFiles[0]), "utf8"));
}

function mapDocumentToPlanPages(document: unknown, pdfPath: string): PlanPage[] {
  if (!document || typeof document !== "object") {
    throw new Error(
      `OpenDataLoader returned a non-object JSON document for '${pdfPath}'.`,
    );
  }

  const record = document as Record<string, unknown>;
  const totalPages = record[NUMBER_OF_PAGES_KEY];
  if (!Number.isInteger(totalPages) || typeof totalPages !== "number" || totalPages < 1) {
    throw new Error(
      `OpenDataLoader reported an invalid page count for '${pdfPath}'.`,
    );
  }

  const kids = Array.isArray(record.kids)
    ? record.kids
    : record.kids
      ? [record.kids]
      : [];
  const contentByPage = new Map<number, string[]>();
  collectPageContent(kids, contentByPage, totalPages, pdfPath);

  const pages: PlanPage[] = [];
  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    pages.push({
      pageNumber,
      sheetId: null,
      label: null,
      textContent: (contentByPage.get(pageNumber) ?? []).join("\n"),
    });
  }

  return pages;
}

function collectPageContent(
  node: unknown,
  contentByPage: Map<number, string[]>,
  totalPages: number,
  pdfPath: string,
): void {
  if (Array.isArray(node)) {
    for (const child of node) {
      collectPageContent(child, contentByPage, totalPages, pdfPath);
    }
    return;
  }

  if (!node || typeof node !== "object") {
    return;
  }

  const record = node as Record<string, unknown>;
  const pageNumber = record[PAGE_NUMBER_KEY];
  const content = record[CONTENT_KEY];

  if (typeof pageNumber === "number") {
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > totalPages) {
      throw new Error(
        `OpenDataLoader returned an out-of-range page number for '${pdfPath}'.`,
      );
    }

    if (typeof content === "string" && content.length > 0) {
      const chunks = contentByPage.get(pageNumber) ?? [];
      chunks.push(content);
      contentByPage.set(pageNumber, chunks);
    }
  }

  for (const value of Object.values(record)) {
    if (Array.isArray(value) && value.some((item) => item && typeof item === "object")) {
      collectPageContent(value, contentByPage, totalPages, pdfPath);
    }
  }
}

function wrapIndexError(pdfPath: string, error: unknown): Error {
  if (error instanceof Error && error.message.startsWith("Failed to index PDF ")) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  return new Error(`Failed to index PDF '${pdfPath}': ${message}`, {
    cause: error instanceof Error ? error : undefined,
  });
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
