import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { readFile } from "node:fs/promises";

export interface PdfOutlinePageEntry {
  pageNumber: number;
  title: string;
}

type PdfJsRef = { num: number; gen: number };

/**
 * Reads PDF outline/bookmark titles mapped to 1-based page numbers via pdf.js.
 * Generic — does not interpret sheet semantics (plan vs notes vs detail).
 */
export async function readPdfOutlinePageMap(
  pdfPath: string,
): Promise<Map<number, string>> {
  const data = new Uint8Array(await readFile(pdfPath));
  const loadingTask = getDocument({ data, useSystemFonts: true });
  const doc = await loadingTask.promise;

  try {
    const outline = await doc.getOutline();
    const map = new Map<number, string>();
    if (!outline || outline.length === 0) {
      return map;
    }

    for (const item of outline) {
      const pageNumber = await resolveOutlinePageNumber(doc, item.dest);
      if (pageNumber == null) {
        continue;
      }
      const title = item.title?.trim();
      if (!title) {
        continue;
      }
      // First outline title wins for a page; later duplicates do not override.
      if (!map.has(pageNumber)) {
        map.set(pageNumber, title);
      }
    }

    return map;
  } finally {
    await doc.destroy();
  }
}

async function resolveOutlinePageNumber(
  doc: {
    getPageIndex: (ref: PdfJsRef) => Promise<number>;
    getDestination: (id: string) => Promise<unknown>;
  },
  dest: unknown,
): Promise<number | null> {
  try {
    let destination = dest;
    if (typeof destination === "string") {
      destination = await doc.getDestination(destination);
    }
    if (!Array.isArray(destination) || destination.length === 0) {
      return null;
    }
    const ref = destination[0];
    if (!ref || typeof ref !== "object" || !("num" in ref)) {
      return null;
    }
    const pageIndex = await doc.getPageIndex(ref as PdfJsRef);
    if (!Number.isInteger(pageIndex) || pageIndex < 0) {
      return null;
    }
    return pageIndex + 1;
  } catch {
    return null;
  }
}

export function outlineEntriesFromMap(
  map: Map<number, string>,
): PdfOutlinePageEntry[] {
  return [...map.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([pageNumber, title]) => ({ pageNumber, title }));
}
