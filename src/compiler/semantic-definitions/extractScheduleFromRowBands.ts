import { performance } from "node:perf_hooks";

import { renderPagePng } from "../dimensions/dimOwnership.js";
import {
  createScheduleOcrWorker,
  cropBboxFromRaster,
  ocrScheduleCell,
} from "../semantic-mark-recovery/markOcr.js";
import { scoreMarkOcrText } from "../semantic-mark-recovery/scoreMarkOcrText.js";
import type {
  SemanticDefinition,
  SemanticDefinitionBlock,
} from "../schemas/semanticDefinition.schema.js";
import type { Bbox } from "./reconstructTableGridFromSegments.js";
import { locateShearWallScheduleTableRegion } from "./locateShearWallScheduleTableRegion.js";

const OCR_SCALE = 6;
const DATA_ROW_OFFSET_PT = 44;
const DATA_ROW_HEIGHT_PT = 24;
const KEY_STRIP_FRAC = 0.35;

type ColumnBand = {
  id: string;
  propertyPath: string | null;
  x0Frac: number;
  x1Frac: number;
};

/** Calibrated on Beckstead p1 shear-wall schedule table band. */
const COLUMN_BANDS: ColumnBand[] = [
  { id: "mark", propertyPath: null, x0Frac: 0.04, x1Frac: 0.14 },
  {
    id: "panel",
    propertyPath: "assembly.sheathingType",
    x0Frac: 0.17,
    x1Frac: 0.45,
  },
  {
    id: "edge",
    propertyPath: "assembly.nailingPattern.edge",
    x0Frac: 0.45,
    x1Frac: 0.55,
  },
  {
    id: "field",
    propertyPath: "assembly.nailingPattern.field",
    x0Frac: 0.55,
    x1Frac: 0.63,
  },
  {
    id: "anchorage",
    propertyPath: "assembly.holdownType",
    x0Frac: 0.63,
    x1Frac: 0.84,
  },
];

function bandBbox(row: Bbox, band: ColumnBand): Bbox {
  const w = row.x1 - row.x0;
  return {
    x0: row.x0 + w * band.x0Frac,
    y0: row.y0,
    x1: row.x0 + w * band.x1Frac,
    y1: row.y1,
  };
}

function markKeyFromText(text: string): string | null {
  const tokens = text.split(/\s+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (!/^SW\d+[A-Z]?$/i.test(token)) continue;
    const prev = tokens[i - 1]?.toUpperCase();
    if (prev === "USE") continue;
    return token.toUpperCase();
  }
  const scored = scoreMarkOcrText(text, 70);
  if (scored?.normalizedKey && /^SW\d/i.test(scored.normalizedKey)) {
    return scored.normalizedKey.toUpperCase();
  }
  return null;
}

function keyStripBbox(row: Bbox): Bbox {
  const w = row.x1 - row.x0;
  return {
    x0: row.x0,
    y0: row.y0,
    x1: row.x0 + w * KEY_STRIP_FRAC,
    y1: row.y1,
  };
}

export function normalizeForScheduleMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[""″]/g, '"')
    .replace(/[''′]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchPropertyToTruth(
  extracted: string,
  expected: string,
): boolean {
  const a = normalizeForScheduleMatch(extracted);
  const b = normalizeForScheduleMatch(expected);
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

export type RowBandOcrCacheEntry = {
  pageNumber: number;
  rowIndex: number;
  rowBbox: Bbox;
  columnId: string;
  cellBbox: Bbox;
  ocrText: string;
  confidence: number;
};

export async function extractScheduleFromRowBands(input: {
  pdfPath: string;
  pageNumber: number;
  pageWidth: number;
  pageHeight: number;
}): Promise<{
  block: SemanticDefinitionBlock;
  tableRegion: Bbox;
  headingText: string | null;
  ocrCache: RowBandOcrCacheEntry[];
}> {
  const t0 = performance.now();
  const located = await locateShearWallScheduleTableRegion(input);
  const table = located.tableRegion;
  const dataY0 = table.y0 + DATA_ROW_OFFSET_PT;
  const maxRowIndex = Math.floor((table.y1 - dataY0) / DATA_ROW_HEIGHT_PT);

  const markRendered = await renderPagePng(
    input.pdfPath,
    input.pageNumber,
    OCR_SCALE + 2,
  );
  const rendered = await renderPagePng(
    input.pdfPath,
    input.pageNumber,
    OCR_SCALE,
  );
  const worker = await createScheduleOcrWorker();
  const ocrCache: RowBandOcrCacheEntry[] = [];
  const definitions: SemanticDefinition[] = [];
  const recoveredKeys = new Set<string>();

  try {
    for (let ri = 0; ri < maxRowIndex; ri++) {
      const rowBbox: Bbox = {
        x0: table.x0,
        y0: dataY0 + DATA_ROW_HEIGHT_PT * ri,
        x1: table.x1,
        y1: dataY0 + DATA_ROW_HEIGHT_PT * (ri + 1),
      };
      if (rowBbox.y1 - rowBbox.y0 < 10) continue;

      const keyStrip = keyStripBbox(rowBbox);
      const keyOcr = await ocrScheduleCell(
        cropBboxFromRaster(
          markRendered.png,
          input.pageWidth,
          input.pageHeight,
          keyStrip,
          12,
        ).png,
        worker,
      );
      const semanticTypeKey = markKeyFromText(keyOcr.text);
      if (!semanticTypeKey || recoveredKeys.has(semanticTypeKey)) continue;

      const markBand = bandBbox(rowBbox, COLUMN_BANDS[0]!);
      const markOcr = await ocrScheduleCell(
        cropBboxFromRaster(
          markRendered.png,
          input.pageWidth,
          input.pageHeight,
          markBand,
          12,
        ).png,
        worker,
      );

      ocrCache.push({
        pageNumber: input.pageNumber,
        rowIndex: ri,
        rowBbox,
        columnId: "mark",
        cellBbox: markBand,
        ocrText: markOcr.text || keyOcr.text,
        confidence: markOcr.confidence,
      });

      const properties: SemanticDefinition["properties"] = [];

      for (const col of COLUMN_BANDS.slice(1)) {
        if (!col.propertyPath) continue;
        const cellBbox = bandBbox(rowBbox, col);
        const crop = cropBboxFromRaster(
          rendered.png,
          input.pageWidth,
          input.pageHeight,
          cellBbox,
        );
        const ocr = await ocrScheduleCell(crop.png, worker);
        const rawText = ocr.text.replace(/\s+/g, " ").trim();
        ocrCache.push({
          pageNumber: input.pageNumber,
          rowIndex: ri,
          rowBbox,
          columnId: col.id,
          cellBbox,
          ocrText: rawText,
          confidence: ocr.confidence,
        });
        if (!rawText) continue;
        properties.push({
          propertyPath: col.propertyPath,
          rawText,
          candidateValue: rawText,
          cellBbox,
        });
      }

      recoveredKeys.add(semanticTypeKey);
      definitions.push({
        definitionId: `def-p${input.pageNumber}-${semanticTypeKey}`,
        semanticTypeKey,
        definitionKind: "shear-wall",
        sourcePageNumber: input.pageNumber,
        sourceRegion: rowBbox,
        properties,
        provenance: {
          extractionMethod: "row-band-ocr",
          rowIndex: ri,
        },
      });
    }
  } finally {
    await worker.terminate();
  }

  const propertiesRecovered = definitions.reduce(
    (n, d) => n + d.properties.length,
    0,
  );

  return {
    block: {
      definitions,
      metrics: {
        rowsExtracted: definitions.length,
        keysRecovered: definitions.length,
        propertiesRecovered,
        timingMs: Number((performance.now() - t0).toFixed(1)),
      },
    },
    tableRegion: table,
    headingText: located.headingText,
    ocrCache,
  };
}
