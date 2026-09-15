import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { compareBurtonBenchmark } from "../../../src/framing/benchmark/compareBurtonBenchmark.js";
import { loadBurtonBenchmarkFixture } from "../../../src/framing/benchmark/loadBurtonBenchmarkFixture.js";
import type {
  BurtonBenchmarkFixture,
  BurtonBenchmarkItem,
  BurtonEngineJoin,
} from "../../../src/framing/benchmark/burtonBenchmark.schema.js";
import type {
  FramingMaterialLine,
  FramingTakeoff,
} from "../../../src/framing/schemas/framingTakeoff.schema.js";

const REPO_ROOT = process.cwd();
const FORBIDDEN_IMPORT = /from ["']\.\.\/(read|resolve|calculate|output)\//;

function takeoff(materials: FramingMaterialLine[]): FramingTakeoff {
  return {
    schemaVersion: 2,
    projectId: "synthetic-b-cmp-1",
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

function join(
  quantityKeys: string[],
  unit: string,
  prefix?: string,
): BurtonEngineJoin {
  return {
    quantityKeys,
    unit,
    note: "synthetic join for B-CMP-1 tests only",
    ...(prefix ? { canonicalClassificationPrefix: prefix } : {}),
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
    normalizationNotes: "synthetic B-CMP-1 item",
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

function assertNoAccuracyScore(result: unknown): void {
  const json = JSON.stringify(result);
  assert.equal(json.includes('"accuracy"'), false);
  assert.equal(json.includes('"score"'), false);
  assert.equal(
    result !== null &&
      typeof result === "object" &&
      "accuracy" in (result as object),
    false,
  );
}

describe("compareBurtonBenchmark", () => {
  it("treats zero eligible rows as valid with null quantity-agreement percents", () => {
    const ours = takeoff([
      line({
        material: "2x4 stud",
        quantity: 200,
        unit: "each",
        quantityKey: "wall.studs",
      }),
    ]);
    const result = compareBurtonBenchmark({
      takeoff: ours,
      benchmark: benchmark([
        item({
          benchmarkItemId: "L045",
          originalQuantity: 244,
          originalUnit: "ea",
          originalDescription: '2X4-92 5/8" Stud',
          engineJoin: join(["wall.studs"], "each"),
        }),
      ]),
      runId: "zero-eligible",
    });

    assert.equal(result.rows.filter((row) => row.status === "NOT COMPARABLE").length, 1);
    assert.equal(result.rows.filter((row) => row.status === "OURS ONLY").length, 1);
    assert.equal(result.rows[0]?.absDelta, null);
    assert.equal(result.rows[0]?.pctDelta, null);
    assert.equal(result.gradeSheet.quantityAgreement.eligibleItemCount, 0);
    assert.equal(result.gradeSheet.quantityAgreement.numericComparedCount, 0);
    assert.equal(result.gradeSheet.quantityAgreement.matchPercent, null);
    assert.equal(result.gradeSheet.quantityAgreement.withinInner3Percent, null);
    assertNoAccuracyScore(result);
  });

  it("loads the real freeze-candidate: all Burton rows NOT COMPARABLE, ours OURS ONLY", () => {
    const fixture = loadBurtonBenchmarkFixture(REPO_ROOT);
    const ours = takeoff([
      line({
        material: "2x4 stud",
        quantity: 200,
        unit: "each",
        quantityKey: "wall.studs",
      }),
      line({
        material: "BCI joist LF",
        quantity: 527,
        unit: "linear-foot",
        quantityKey: "floor.joist-linear-feet",
      }),
    ]);
    const result = compareBurtonBenchmark({
      takeoff: ours,
      benchmark: fixture,
      runId: "freeze-candidate",
    });

    const burtonRows = result.rows.filter((row) => row.burton);
    const oursOnly = result.rows.filter((row) => row.status === "OURS ONLY");
    assert.equal(burtonRows.length, 90);
    assert.equal(
      burtonRows.every((row) => row.status === "NOT COMPARABLE"),
      true,
    );
    assert.equal(
      burtonRows.every((row) => row.absDelta === null && row.pctDelta === null),
      true,
    );
    assert.equal(oursOnly.length, 2);
    assert.equal(result.gradeSheet.quantityAgreement.numericComparedCount, 0);
    assert.equal(result.gradeSheet.quantityAgreement.matchPercent, null);
    assertNoAccuracyScore(result);
  });

  it("does not treat ineligible related rows as comparable even when same family exists", () => {
    const result = compareBurtonBenchmark({
      takeoff: takeoff([
        line({
          material: "2x4 stud",
          quantity: 244,
          unit: "each",
          quantityKey: "wall.studs",
        }),
      ]),
      benchmark: benchmark([
        item({
          benchmarkItemId: "L045",
          originalQuantity: 244,
          originalUnit: "ea",
          comparisonEligible: false,
          engineJoin: join(["wall.studs"], "each"),
        }),
      ]),
      runId: "ineligible-related",
    });

    assert.equal(result.rows[0]?.status, "NOT COMPARABLE");
    assert.equal(result.rows[0]?.absDelta, null);
    assert.equal(result.rows[1]?.status, "OURS ONLY");
  });

  it("does not choose the closest quantity for an ambiguous two-key join", () => {
    const result = compareBurtonBenchmark({
      takeoff: takeoff([
        line({
          material: "studs",
          quantity: 244,
          unit: "each",
          quantityKey: "wall.studs",
        }),
        line({
          material: "plates",
          quantity: 100,
          unit: "linear-foot",
          quantityKey: "wall.plates",
        }),
      ]),
      benchmark: benchmark([
        item({
          benchmarkItemId: "ambiguous",
          originalQuantity: 240,
          originalUnit: "ea",
          comparisonEligible: true,
          engineJoin: join(["wall.studs", "wall.plates"], "each"),
        }),
      ]),
      runId: "ambiguous-keys",
    });

    assert.equal(result.rows[0]?.status, "NOT COMPARABLE");
    assert.equal(result.rows[0]?.absDelta, null);
    assert.equal(result.rows.filter((row) => row.status === "OURS ONLY").length, 2);
  });

  it("does not pick the closest of two Our Takeoff lines for one join key", () => {
    const result = compareBurtonBenchmark({
      takeoff: takeoff([
        line({
          material: "studs A",
          quantity: 240,
          unit: "each",
          quantityKey: "wall.studs",
          canonicalClassification: "stud-a",
        }),
        line({
          material: "studs B",
          quantity: 10,
          unit: "each",
          quantityKey: "wall.studs",
          canonicalClassification: "stud-b",
        }),
      ]),
      benchmark: benchmark([
        item({
          benchmarkItemId: "one-key",
          originalQuantity: 244,
          originalUnit: "ea",
          comparisonEligible: true,
          engineJoin: join(["wall.studs"], "each"),
        }),
      ]),
      runId: "ambiguous-lines",
    });

    assert.equal(result.rows[0]?.status, "NOT COMPARABLE");
    assert.equal(result.rows[0]?.absDelta, null);
    assert.match(
      result.rows[0]?.explanationRef.explanationText ?? "",
      /multiple Our Takeoff lines/,
    );
  });

  it("does not convert stock ea to LF or sheets to SF", () => {
    const plates = compareBurtonBenchmark({
      takeoff: takeoff([
        line({
          material: "plates",
          quantity: 224,
          unit: "linear-foot",
          quantityKey: "wall.plates",
        }),
      ]),
      benchmark: benchmark([
        item({
          benchmarkItemId: "plates-ea",
          originalQuantity: 14,
          originalUnit: "ea",
          comparisonUnit: "ea",
          quantityLayer: "procurement_stock_ea",
          normalizedFamily: "plate",
          comparisonEligible: true,
          engineJoin: join(["wall.plates"], "linear-foot"),
        }),
      ]),
      runId: "no-ea-to-lf",
    });
    assert.equal(plates.rows[0]?.status, "NOT COMPARABLE");
    assert.equal(plates.rows[0]?.absDelta, null);
    assert.equal(plates.rows[0]?.diagnosticClass, "S5 missing");

    const sheets = compareBurtonBenchmark({
      takeoff: takeoff([
        line({
          material: "wall OSB",
          quantity: 1952,
          unit: "square-foot",
          quantityKey: "sheathing.area",
        }),
      ]),
      benchmark: benchmark([
        item({
          benchmarkItemId: "osb-ea",
          originalQuantity: 61,
          originalUnit: "ea",
          comparisonUnit: "ea",
          quantityLayer: "procurement_stock_ea",
          normalizedFamily: "wall_sheathing",
          comparisonEligible: true,
          engineJoin: join(["sheathing.area"], "square-foot"),
        }),
      ]),
      runId: "no-sheets-to-sf",
    });
    assert.equal(sheets.rows[0]?.status, "NOT COMPARABLE");
    assert.equal(sheets.rows[0]?.absDelta, null);
  });

  it("eligible empty engineJoin is NOT COMPARABLE, not MISSING OURS", () => {
    const result = compareBurtonBenchmark({
      takeoff: takeoff([]),
      benchmark: benchmark([
        item({
          benchmarkItemId: "no-join",
          originalQuantity: 244,
          originalUnit: "ea",
          comparisonEligible: true,
          engineJoin: null,
        }),
      ]),
      runId: "empty-join",
    });

    assert.equal(result.rows[0]?.status, "NOT COMPARABLE");
    assert.notEqual(result.rows[0]?.status, "MISSING OURS");
    assert.equal(result.rows[0]?.ours, null);
  });

  it("MISSING OURS requires a usable join and keeps quantity null, not zero", () => {
    const result = compareBurtonBenchmark({
      takeoff: takeoff([]),
      benchmark: benchmark([
        item({
          benchmarkItemId: "missing",
          originalQuantity: 244,
          originalUnit: "ea",
          comparisonEligible: true,
          engineJoin: join(["wall.studs"], "each"),
        }),
      ]),
      runId: "missing-ours",
    });

    assert.equal(result.rows[0]?.status, "MISSING OURS");
    assert.equal(result.rows[0]?.ours?.quantityKey, "wall.studs");
    assert.equal(result.rows[0]?.ours?.quantity, null);
    assert.notEqual(result.rows[0]?.ours?.quantity, 0);
    assert.equal(result.rows[0]?.absDelta, null);
    assert.equal(result.rows[0]?.diagnosticClass, null);
  });

  it("does not infer CALC missing capability from absent takeoff output", () => {
    const without = compareBurtonBenchmark({
      takeoff: takeoff([]),
      benchmark: benchmark([
        item({
          benchmarkItemId: "no-infer",
          originalQuantity: 1,
          originalUnit: "lf",
          comparisonUnit: "lf",
          quantityLayer: "procurement_lf",
          normalizedFamily: "beam",
          comparisonEligible: true,
          engineJoin: join(["member.material"], "linear-foot"),
        }),
      ]),
      runId: "no-infer-calc",
    });
    assert.equal(without.rows[0]?.status, "MISSING OURS");
    assert.equal(without.rows[0]?.diagnosticClass, null);

    const withExplicit = compareBurtonBenchmark({
      takeoff: takeoff([]),
      benchmark: benchmark([
        item({
          benchmarkItemId: "explicit-gap",
          originalQuantity: 1,
          originalUnit: "lf",
          comparisonUnit: "lf",
          quantityLayer: "procurement_lf",
          normalizedFamily: "rim_board",
          comparisonEligible: true,
          engineJoin: join(["member.material"], "linear-foot"),
        }),
      ]),
      runId: "explicit-calc-gap",
      unsupportedEmitters: ["member.material"],
    });
    assert.equal(withExplicit.rows[0]?.status, "MISSING OURS");
    assert.equal(withExplicit.rows[0]?.diagnosticClass, "CALC missing capability");
  });

  it("preserves UNRESOLVED as distinct from MISSING OURS", () => {
    const missing = compareBurtonBenchmark({
      takeoff: takeoff([]),
      benchmark: benchmark([
        item({
          benchmarkItemId: "u1",
          originalQuantity: 244,
          originalUnit: "ea",
          comparisonEligible: true,
          engineJoin: join(["wall.studs"], "each"),
        }),
      ]),
      runId: "missing",
    });
    const unresolved = compareBurtonBenchmark({
      takeoff: takeoff([]),
      benchmark: benchmark([
        item({
          benchmarkItemId: "u1",
          originalQuantity: 244,
          originalUnit: "ea",
          comparisonEligible: true,
          engineJoin: join(["wall.studs"], "each"),
        }),
      ]),
      runId: "unresolved",
      unresolvedQuantityKeys: ["wall.studs"],
    });

    assert.equal(missing.rows[0]?.status, "MISSING OURS");
    assert.equal(unresolved.rows[0]?.status, "UNRESOLVED");
    assert.equal(unresolved.rows[0]?.diagnosticClass, null);
    assert.equal(unresolved.rows[0]?.ours?.quantity, null);
  });

  it("emits MATCH, ours-high, ours-low, reporting bands, and outside tolerance", () => {
    const fixture = (qty: number, id: string) =>
      benchmark([
        item({
          benchmarkItemId: id,
          originalQuantity: 100,
          originalUnit: "ea",
          comparisonEligible: true,
          engineJoin: join(["wall.studs"], "each"),
        }),
      ]);

    const match = compareBurtonBenchmark({
      takeoff: takeoff([
        line({ material: "studs", quantity: 100, unit: "each", quantityKey: "wall.studs" }),
      ]),
      benchmark: fixture(100, "match"),
      runId: "match",
    });
    assert.equal(match.rows[0]?.status, "MATCH");
    assert.equal(match.rows[0]?.absDelta, 0);
    assert.equal(match.rows[0]?.pctDelta, 0);

    const high3 = compareBurtonBenchmark({
      takeoff: takeoff([
        line({ material: "studs", quantity: 103, unit: "each", quantityKey: "wall.studs" }),
      ]),
      benchmark: fixture(100, "high3"),
      runId: "high3",
    });
    assert.equal(high3.rows[0]?.status, "WITHIN TARGET — OURS HIGH");
    assert.equal(high3.gradeSheet.quantityAgreement.withinInner3, 1);

    const low5 = compareBurtonBenchmark({
      takeoff: takeoff([
        line({ material: "studs", quantity: 95, unit: "each", quantityKey: "wall.studs" }),
      ]),
      benchmark: fixture(100, "low5"),
      runId: "low5",
    });
    assert.equal(low5.rows[0]?.status, "WITHIN TARGET — OURS LOW");
    assert.equal(low5.gradeSheet.quantityAgreement.withinOuter5, 1);
    assert.equal(low5.gradeSheet.quantityAgreement.withinInner3, 0);

    const highOut = compareBurtonBenchmark({
      takeoff: takeoff([
        line({ material: "studs", quantity: 110, unit: "each", quantityKey: "wall.studs" }),
      ]),
      benchmark: fixture(100, "out"),
      runId: "out",
    });
    assert.equal(highOut.rows[0]?.status, "OUTSIDE TOLERANCE — OURS HIGH");
    assert.equal(highOut.rows[0]?.diagnosticClass, "CALC discrepancy");
    assert.equal(highOut.gradeSheet.quantityAgreement.outside, 1);
    assert.equal(highOut.gradeSheet.quantityAgreement.numericComparedCount, 1);
    assert.equal(highOut.gradeSheet.quantityAgreement.outsidePercent, 100);
  });

  it("uses only numeric-compared rows as the quantity-agreement denominator", () => {
    const result = compareBurtonBenchmark({
      takeoff: takeoff([
        line({ material: "studs", quantity: 100, unit: "each", quantityKey: "wall.studs" }),
        line({ material: "rafters", quantity: 12, unit: "each", quantityKey: "roof.common-rafters" }),
      ]),
      benchmark: benchmark([
        item({
          benchmarkItemId: "eligible-match",
          originalQuantity: 100,
          originalUnit: "ea",
          comparisonEligible: true,
          engineJoin: join(["wall.studs"], "each"),
        }),
        item({
          benchmarkItemId: "ineligible",
          originalQuantity: 999,
          originalUnit: "ea",
          comparisonEligible: false,
          engineJoin: join(["roof.common-rafters"], "each"),
        }),
      ]),
      runId: "denominator",
    });

    assert.equal(result.gradeSheet.coverage.oursOnly, 1);
    assert.equal(result.gradeSheet.coverage.notComparable, 1);
    assert.equal(result.gradeSheet.quantityAgreement.numericComparedCount, 1);
    assert.equal(result.gradeSheet.quantityAgreement.matchPercent, 100);
    assert.equal(result.gradeSheet.quantityAgreement.eligibleItemCount, 1);
    assertNoAccuracyScore(result);
  });

  it("is deterministic", () => {
    const input = {
      takeoff: takeoff([
        line({ material: "studs", quantity: 100, unit: "each", quantityKey: "wall.studs" }),
      ]),
      benchmark: benchmark([
        item({
          benchmarkItemId: "det",
          originalQuantity: 100,
          originalUnit: "ea",
          comparisonEligible: true,
          engineJoin: join(["wall.studs"], "each"),
        }),
      ]),
      runId: "det",
    };
    const a = compareBurtonBenchmark(input);
    const b = compareBurtonBenchmark(input);
    assert.deepEqual(a, b);
    assert.equal(JSON.stringify(a), JSON.stringify(b));
  });

  it("does not import production read/resolve/calculate/output modules", () => {
    const dir = path.join(REPO_ROOT, "src/framing/benchmark");
    const files = readdirSync(dir).filter((name) => name.endsWith(".ts"));
    assert.ok(files.includes("compareBurtonBenchmark.ts"));
    for (const file of files) {
      const source = readFileSync(path.join(dir, file), "utf8");
      assert.equal(
        FORBIDDEN_IMPORT.test(source),
        false,
        `${file} must not import the production pipeline`,
      );
    }
  });
});
