import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AGREEMENT_UNAVAILABLE_LABEL,
  EVIDENCE_NOT_JOINED_LABEL,
  formatAgreementPercent,
  formatEvidencePages,
  formatQuantityCell,
  statusTone,
} from "../../../src/framing/benchmark/benchmarkDisplay.js";
import { compareBurtonBenchmark } from "../../../src/framing/benchmark/compareBurtonBenchmark.js";
import { explainBurtonBenchmarkComparison } from "../../../src/framing/benchmark/explainBurtonBenchmark.js";
import {
  BURTON_BENCHMARK_CSV_COLUMNS,
  exportBurtonBenchmarkCsv,
} from "../../../src/framing/benchmark/exportBurtonBenchmarkCsv.js";
import { loadBurtonBenchmarkFixture } from "../../../src/framing/benchmark/loadBurtonBenchmarkFixture.js";
import type {
  BurtonBenchmarkFixture,
  BurtonBenchmarkItem,
  BurtonEngineJoin,
} from "../../../src/framing/benchmark/burtonBenchmark.schema.js";
import {
  emptyFramingConstruction,
  type FramingConstruction,
} from "../../../src/framing/schemas/framingConstruction.schema.js";
import type {
  FramingMaterialLine,
  FramingTakeoff,
} from "../../../src/framing/schemas/framingTakeoff.schema.js";

const REPO_ROOT = process.cwd();

function takeoff(materials: FramingMaterialLine[]): FramingTakeoff {
  return {
    schemaVersion: 2,
    projectId: "synthetic-b-ui-1",
    pdfPath: "tests/fixtures/synthetic.pdf",
    createdAt: "2026-09-15T12:00:00.000Z",
    materials,
  };
}

function line(
  partial: Pick<FramingMaterialLine, "material" | "quantity" | "unit"> &
    Partial<FramingMaterialLine>,
): FramingMaterialLine {
  return {
    description: partial.description ?? partial.material,
    lengthOrType: partial.lengthOrType ?? null,
    ...partial,
  };
}

function join(quantityKeys: string[], unit: string): BurtonEngineJoin {
  return {
    quantityKeys,
    unit,
    note: "synthetic join for B-UI-1 tests only",
  };
}

function item(
  overrides: Partial<BurtonBenchmarkItem> &
    Pick<BurtonBenchmarkItem, "benchmarkItemId" | "originalQuantity" | "originalUnit">,
): BurtonBenchmarkItem {
  return {
    pdfPage: 1,
    lineNumber: 1,
    section: "1ST FLOOR WALLS",
    originalDescription: overrides.originalDescription ?? "synthetic",
    productCode: "SYN",
    originalTally: null,
    unitPrice: null,
    extendedPrice: null,
    pricingUnit: overrides.originalUnit,
    normalizedFamily: "stud",
    normalizedSpec: "2x4",
    comparisonUnit: overrides.originalUnit,
    comparisonKey: "synthetic",
    quantityLayer: "procurement_stock_ea",
    inFramingEngineScope: true,
    comparisonEligible: false,
    engineJoin: null,
    normalizationNotes: "synthetic B-UI-1 item",
    ...overrides,
  };
}

function benchmark(items: BurtonBenchmarkItem[]): BurtonBenchmarkFixture {
  return {
    benchmarkId: "beckstead-burton-benchmark-v1",
    benchmarkVersion: "v1-freeze-candidate",
    status: "freeze-candidate",
    frozenAt: null,
    sourceFile: "benchmarks/beckstead/source/burton-takeoff.pdf",
    quoteNumber: "1343851",
    quoteDate: "2025-07-21",
    customer: "synthetic",
    disclaimer: "synthetic",
    quoteTotals: {
      totalAmount: 0,
      salesTax: 0,
      quotationTotal: 0,
      notes: "synthetic",
    },
    scopePolicy: "synthetic",
    eligibilityPolicy: "synthetic",
    items,
  };
}

function csvMap(csv: string): { header: string[]; rows: string[][] } {
  const lines = csv.split("\n");
  const header = lines[0]!.split(",");
  const rows = lines.slice(1).map((line) => {
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i]!;
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          current += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        cells.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
    cells.push(current);
    return cells;
  });
  return { header, rows };
}

function cell(
  parsed: { header: string[]; rows: string[][] },
  rowIndex: number,
  column: string,
): string {
  const index = parsed.header.indexOf(column);
  assert.notEqual(index, -1, `missing column ${column}`);
  return parsed.rows[rowIndex]![index]!;
}

function wallBag(): FramingConstruction {
  const construction = emptyFramingConstruction();
  construction.walls = {
    walls: [
      {
        id: "W-SYN-001",
        objectType: "building-wall",
        physicalId: "W-SYN-001",
        resolutionTraces: [
          {
            propertyPath: "assembly.studSize",
            method: "explicit-project-value",
            explanation: "explicit",
            assumptionIds: [],
          },
        ],
        name: "W-001",
        level: "1",
        wallType: "wood stud wall",
        semanticTypeKey: null,
        bindingAuthorityGrade: null,
        location: "exterior",
        bearingStatus: "non-bearing",
        isShearOrBraced: null,
        fireRating: null,
        constructionPhase: "new",
        assembly: {
          material: "dimensional-lumber",
          studSize: "2x4",
          studSpacingInches: 16,
          heightFeet: 8,
          plateCount: 3,
          sheathing: null,
        },
        segmentIds: ["WS-SYN-001"],
      },
    ],
    segments: [
      {
        id: "WS-SYN-001",
        objectType: "wall-segment",
        physicalId: "WS-SYN-001",
        resolutionTraces: [
          {
            propertyPath: "lengthFeet",
            method: "explicit-project-value",
            explanation: "explicit",
            assumptionIds: [],
          },
        ],
        parentWallId: "W-SYN-001",
        lengthFeet: 20,
        openingIds: [],
      },
    ],
  };
  return construction;
}

describe("benchmark display tokens", () => {
  it("renders null agreement percent as unavailable, never 0%", () => {
    assert.equal(formatAgreementPercent(null), AGREEMENT_UNAVAILABLE_LABEL);
    assert.equal(formatAgreementPercent(null).includes("0%"), false);
    assert.equal(formatAgreementPercent(0), "0%");
  });

  it("renders null quantity as unavailable, never 0", () => {
    assert.equal(formatQuantityCell(null), "unavailable");
    assert.notEqual(formatQuantityCell(null), "0");
    assert.equal(formatQuantityCell(0), "0");
  });

  it("does not treat OURS ONLY, NOT COMPARABLE, or OUTSIDE as failure tones", () => {
    assert.equal(statusTone("OURS ONLY"), "ours-only");
    assert.equal(statusTone("NOT COMPARABLE"), "not-comparable");
    assert.equal(statusTone("OUTSIDE TOLERANCE — OURS HIGH"), "outside");
    assert.equal(statusTone("MISSING OURS"), "missing-ours");
  });

  it("does not render empty evidencePages as no evidence", () => {
    const label = formatEvidencePages([], "unavailable");
    assert.equal(label, EVIDENCE_NOT_JOINED_LABEL);
    assert.equal(label.includes("no evidence"), false);
    assert.equal(label.toLowerCase().includes("n/a"), false);
  });
});

describe("exportBurtonBenchmarkCsv", () => {
  it("keeps freeze-candidate percents and missing quantities as null, not zero", () => {
    const fixture = loadBurtonBenchmarkFixture(REPO_ROOT);
    const ours = takeoff([
      line({
        material: "2x4 stud",
        quantity: 200,
        unit: "each",
        quantityKey: "wall.studs",
        debugSourceIds: ["WS-SYN-001"],
      }),
    ]);
    const comparison = compareBurtonBenchmark({
      takeoff: ours,
      benchmark: fixture,
      runId: "csv-zero-eligible",
    });
    const explained = explainBurtonBenchmarkComparison({
      comparison,
      takeoff: ours,
      construction: wallBag(),
      constructionKind: "session-post-calc",
    });
    const csv = exportBurtonBenchmarkCsv(explained);
    const parsed = csvMap(csv);
    assert.deepEqual(parsed.header, [...BURTON_BENCHMARK_CSV_COLUMNS]);
    assert.equal(cell(parsed, 0, "match_percent"), "null");
    assert.equal(cell(parsed, 0, "numeric_compared_count"), "0");
    assert.equal(cell(parsed, 0, "eligible_item_count"), "0");
    assert.equal(csv.includes("accuracy"), false);
    assert.equal(csv.toLowerCase().includes("no evidence"), false);
    const burtonRow = explained.rows.find((row) => row.status === "NOT COMPARABLE")!;
    const burtonIndex = explained.rows.indexOf(burtonRow);
    assert.equal(cell(parsed, burtonIndex, "our_quantity"), "null");
    assert.equal(cell(parsed, burtonIndex, "difference_quantity"), "null");
    assert.equal(cell(parsed, burtonIndex, "comparison_eligible"), "false");
    const oursOnlyIndex = explained.rows.findIndex((row) => row.status === "OURS ONLY");
    assert.equal(cell(parsed, oursOnlyIndex, "our_quantity"), "200");
    assert.equal(cell(parsed, oursOnlyIndex, "project_pages"), "unavailable");
    assert.equal(cell(parsed, oursOnlyIndex, "provenance_join_status"), "unavailable");
    assert.deepEqual(
      explained.rows.map((row) => ({
        status: row.status,
        ours: row.ours,
        absDelta: row.absDelta,
        pctDelta: row.pctDelta,
      })),
      comparison.rows.map((row) => ({
        status: row.status,
        ours: row.ours,
        absDelta: row.absDelta,
        pctDelta: row.pctDelta,
      })),
    );
  });

  it("preserves MISSING OURS quantity as null and related/not compared", () => {
    const missing = compareBurtonBenchmark({
      takeoff: takeoff([]),
      benchmark: benchmark([
        item({
          benchmarkItemId: "missing",
          originalQuantity: 100,
          originalUnit: "ea",
          comparisonEligible: true,
          engineJoin: join(["wall.studs"], "each"),
        }),
      ]),
      runId: "csv-missing",
    });
    const missingExplained = explainBurtonBenchmarkComparison({
      comparison: missing,
      takeoff: takeoff([]),
    });
    const missingCsv = csvMap(exportBurtonBenchmarkCsv(missingExplained));
    assert.equal(cell(missingCsv, 0, "comparison_status"), "MISSING OURS");
    assert.equal(cell(missingCsv, 0, "our_quantity"), "null");
    assert.notEqual(cell(missingCsv, 0, "our_quantity"), "0");
    assert.equal(cell(missingCsv, 0, "burton_quantity"), "100");

    const ours = takeoff([
      line({
        material: "studs",
        quantity: 244,
        unit: "each",
        quantityKey: "wall.studs",
        debugSourceIds: ["WS-SYN-001"],
      }),
    ]);
    const related = compareBurtonBenchmark({
      takeoff: ours,
      benchmark: benchmark([
        item({
          benchmarkItemId: "L045",
          originalQuantity: 244,
          originalUnit: "ea",
          comparisonEligible: false,
          engineJoin: join(["wall.studs"], "each"),
        }),
      ]),
      runId: "csv-related",
    });
    const relatedExplained = explainBurtonBenchmarkComparison({
      comparison: related,
      takeoff: ours,
      construction: wallBag(),
      constructionKind: "session-post-calc",
    });
    const relatedCsv = csvMap(exportBurtonBenchmarkCsv(relatedExplained));
    const notComparableIndex = relatedExplained.rows.findIndex(
      (row) => row.status === "NOT COMPARABLE",
    );
    assert.equal(cell(relatedCsv, notComparableIndex, "related_not_compared"), "true");
    assert.equal(
      relatedExplained.rows[notComparableIndex]?.explanationRef.relatedNotCompared,
      true,
    );
  });

  it("is deterministic and does not recompute comparison fields", () => {
    const ours = takeoff([
      line({
        material: "studs",
        quantity: 120,
        unit: "each",
        quantityKey: "wall.studs",
      }),
    ]);
    const comparison = compareBurtonBenchmark({
      takeoff: ours,
      benchmark: benchmark([
        item({
          benchmarkItemId: "studs",
          originalQuantity: 100,
          originalUnit: "ea",
          comparisonEligible: true,
          engineJoin: join(["wall.studs"], "each"),
        }),
      ]),
      runId: "csv-det",
    });
    const explained = explainBurtonBenchmarkComparison({
      comparison,
      takeoff: ours,
    });
    const a = exportBurtonBenchmarkCsv(explained);
    const b = exportBurtonBenchmarkCsv(explained);
    assert.equal(a, b);
    const parsed = csvMap(a);
    assert.equal(cell(parsed, 0, "comparison_status"), explained.rows[0]?.status);
    assert.equal(cell(parsed, 0, "difference_quantity"), "20");
    assert.equal(cell(parsed, 0, "diagnostic_class"), "CALC discrepancy");
    assert.equal(cell(parsed, 0, "project_pages"), "unavailable");
    assert.equal(a.includes("no evidence"), false);
  });
});
