import { performance } from "node:perf_hooks";

import type { Segment } from "../sgg/extractSegments.js";
import { renderPagePng } from "../dimensions/dimOwnership.js";
import {
  createMarkOcrWorker,
  cropBboxFromRaster,
  ocrMarkRegion,
} from "../semantic-mark-recovery/markOcr.js";
import { scoreMarkOcrText } from "../semantic-mark-recovery/scoreMarkOcrText.js";
import type {
  SemanticDefinition,
  SemanticDefinitionBlock,
} from "../schemas/semanticDefinition.schema.js";
import {
  auditVectorGridFeasibility,
  cellBboxesFromGrid,
  reconstructTableGridFromSegments,
} from "./reconstructTableGridFromSegments.js";
import {
  locateGeneralNotesRegion,
  locateShearWallScheduleRegion,
} from "./locateShearWallScheduleRegion.js";
import { extractScheduleFromRowBands } from "./extractScheduleFromRowBands.js";

const OCR_SCALE = 3;

const COLUMN_PROPERTY_MAP: Record<string, string> = {
  sheathing: "assembly.sheathingType",
  panel: "assembly.sheathingType",
  nailing: "assembly.nailingPattern",
  nail: "assembly.nailingPattern",
  holdown: "assembly.holdownType",
  hd: "assembly.holdownType",
};

function inferPropertyPath(headerText: string, cellText: string): string | null {
  const h = headerText.toLowerCase();
  for (const [needle, path] of Object.entries(COLUMN_PROPERTY_MAP)) {
    if (h.includes(needle)) return path;
  }
  if (/^SW\d/i.test(cellText)) return null;
  if (cellText.length > 0 && cellText.length < 32) return "assembly.scheduleNote";
  return null;
}

function rowKeyFromCells(cellTexts: string[]): string | null {
  for (const t of cellTexts) {
    const scored = scoreMarkOcrText(t, 80);
    if (scored?.normalizedKey && /^SW\d/i.test(scored.normalizedKey)) {
      return scored.normalizedKey.toUpperCase();
    }
    if (/^SW\d+[A-Z]?$/i.test(t.trim())) {
      return t.trim().toUpperCase();
    }
  }
  return null;
}

export async function extractScheduleDefinitions(input: {
  pdfPath: string;
  pageNumber: number;
  pageWidth: number;
  pageHeight: number;
  segments: readonly Segment[];
}): Promise<SemanticDefinitionBlock> {
  const t0 = performance.now();
  const scheduleRegion = locateShearWallScheduleRegion({
    pageWidth: input.pageWidth,
    pageHeight: input.pageHeight,
  });
  const grid = reconstructTableGridFromSegments({
    segments: input.segments,
    region: scheduleRegion,
  });
  const feasibility = auditVectorGridFeasibility(grid);

  if (!feasibility.feasible) {
    const rowBand = await extractScheduleFromRowBands({
      pdfPath: input.pdfPath,
      pageNumber: input.pageNumber,
      pageWidth: input.pageWidth,
      pageHeight: input.pageHeight,
    });
    if (rowBand.block.definitions.length > 0) {
      return rowBand.block;
    }
  }

  const definitions: SemanticDefinition[] = [];
  const rendered = await renderPagePng(input.pdfPath, input.pageNumber, OCR_SCALE);
  const worker = await createMarkOcrWorker();

  try {
    if (feasibility.feasible) {
      const cells = cellBboxesFromGrid(grid);
      const hs = grid.horizontalLines.map((l) => l.position).sort((a, b) => a - b);
      const vs = grid.verticalLines.map((l) => l.position).sort((a, b) => a - b);
      const colHeaders: string[] = [];

      if (hs.length >= 2 && vs.length >= 2) {
        for (let ci = 0; ci < vs.length - 1; ci++) {
          const headerBbox = {
            x0: vs[ci]!,
            y0: hs[0]!,
            x1: vs[ci + 1]!,
            y1: hs[1]!,
          };
          const crop = cropBboxFromRaster(
            rendered.png,
            input.pageWidth,
            input.pageHeight,
            headerBbox,
          );
          const ocr = await ocrMarkRegion(crop.png, worker);
          colHeaders.push(ocr.text.trim());
        }
      }

      const maxRows = Math.min(hs.length - 1, 24);
      for (let ri = 1; ri < maxRows; ri++) {
        const rowCells: string[] = [];
        const rowBboxes: Array<{ x0: number; y0: number; x1: number; y1: number }> = [];
        for (let ci = 0; ci < vs.length - 1; ci++) {
          const cellBbox = {
            x0: vs[ci]!,
            y0: hs[ri]!,
            x1: vs[ci + 1]!,
            y1: hs[ri + 1]!,
          };
          const cellW = cellBbox.x1 - cellBbox.x0;
          const cellH = cellBbox.y1 - cellBbox.y0;
          rowBboxes.push(cellBbox);
          if (cellW < 8 || cellH < 6) {
            rowCells.push("");
            continue;
          }
          const crop = cropBboxFromRaster(
            rendered.png,
            input.pageWidth,
            input.pageHeight,
            cellBbox,
          );
          const ocr = await ocrMarkRegion(crop.png, worker);
          rowCells.push(ocr.text.trim());
        }

        const semanticTypeKey = rowKeyFromCells(rowCells);
        if (!semanticTypeKey) continue;

        const properties = rowCells
          .map((rawText, ci) => {
            const header = colHeaders[ci] ?? "";
            const propertyPath = inferPropertyPath(header, rawText);
            if (!propertyPath || !rawText) return null;
            return {
              propertyPath,
              rawText,
              candidateValue: rawText,
              cellBbox: rowBboxes[ci],
            };
          })
          .filter((p): p is NonNullable<typeof p> => p != null);

        definitions.push({
          definitionId: `def-p${input.pageNumber}-${semanticTypeKey}`,
          semanticTypeKey,
          definitionKind: "shear-wall",
          sourcePageNumber: input.pageNumber,
          sourceRegion: {
            x0: rowBboxes[0]?.x0 ?? scheduleRegion.x0,
            y0: rowBboxes[0]?.y0 ?? scheduleRegion.y0,
            x1: rowBboxes[rowBboxes.length - 1]?.x1 ?? scheduleRegion.x1,
            y1: rowBboxes[0]?.y1 ?? scheduleRegion.y1,
          },
          properties,
          provenance: {
            extractionMethod: "vector-grid-ocr",
            columnHeaders: colHeaders,
            rowIndex: ri,
          },
        });
      }
    } else {
      const bands = [
        scheduleRegion,
        {
          x0: input.pageWidth * 0.02,
          y0: input.pageHeight * 0.55,
          x1: input.pageWidth * 0.98,
          y1: input.pageHeight * 0.9,
        },
      ];
      const keys = new Set<string>();
      const rowCount = 12;
      for (let ri = 0; ri < rowCount; ri++) {
        const y0 =
          scheduleRegion.y0 +
          ((scheduleRegion.y1 - scheduleRegion.y0) * ri) / rowCount;
        const y1 =
          scheduleRegion.y0 +
          ((scheduleRegion.y1 - scheduleRegion.y0) * (ri + 1)) / rowCount;
        const rowKeyBand = {
          x0: scheduleRegion.x0,
          y0,
          x1: scheduleRegion.x0 + (scheduleRegion.x1 - scheduleRegion.x0) * 0.18,
          y1,
        };
        const crop = cropBboxFromRaster(
          rendered.png,
          input.pageWidth,
          input.pageHeight,
          rowKeyBand,
        );
        const ocr = await ocrMarkRegion(crop.png, worker);
        for (const token of ocr.text.split(/\s+/).filter(Boolean)) {
          const scored = scoreMarkOcrText(token, ocr.confidence);
          if (scored?.normalizedKey && /^SW\d/i.test(scored.normalizedKey)) {
            keys.add(scored.normalizedKey.toUpperCase());
          }
          if (/^SW\d+[A-Z]?$/i.test(token.trim())) {
            keys.add(token.trim().toUpperCase());
          }
        }
      }
      for (const band of bands) {
        const crop = cropBboxFromRaster(
          rendered.png,
          input.pageWidth,
          input.pageHeight,
          band,
        );
        const ocr = await ocrMarkRegion(crop.png, worker);
        const tokens = ocr.text.split(/\s+/).filter(Boolean);
        for (const token of tokens) {
          const scored = scoreMarkOcrText(token, ocr.confidence);
          if (scored?.normalizedKey && /^SW\d/i.test(scored.normalizedKey)) {
            keys.add(scored.normalizedKey.toUpperCase());
          }
          if (/^SW\d+[A-Z]?$/i.test(token.trim())) {
            keys.add(token.trim().toUpperCase());
          }
        }
      }
      for (const key of keys) {
        definitions.push({
          definitionId: `def-p${input.pageNumber}-${key}`,
          semanticTypeKey: key,
          definitionKind: "shear-wall",
          sourcePageNumber: input.pageNumber,
          sourceRegion: scheduleRegion,
          properties: [],
          provenance: { extractionMethod: "band-ocr-audit" },
        });
      }
      void locateGeneralNotesRegion;
    }
  } finally {
    await worker.terminate();
  }

  const propertiesRecovered = definitions.reduce(
    (n, d) => n + d.properties.length,
    0,
  );

  return {
    definitions,
    metrics: {
      rowsExtracted: definitions.length,
      keysRecovered: definitions.length,
      propertiesRecovered,
      timingMs: Number((performance.now() - t0).toFixed(1)),
    },
  };
}
