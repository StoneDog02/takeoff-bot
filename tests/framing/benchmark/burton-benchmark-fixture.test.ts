import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  BURTON_BENCHMARK_FIXTURE_RELATIVE_PATH,
  BURTON_BENCHMARK_SOURCE_FILE,
  loadBurtonBenchmarkFixture,
} from "../../../src/framing/benchmark/loadBurtonBenchmarkFixture.js";

const REPO_ROOT = process.cwd();
const FORBIDDEN_IMPORT = /from ["']\.\.\/(read|resolve|calculate|output)\//;

describe("beckstead-burton-benchmark-v1 freeze candidate", () => {
  it("parses the fixture, references the source PDF, and keeps every row ineligible", () => {
    const pdfPath = path.join(REPO_ROOT, BURTON_BENCHMARK_SOURCE_FILE);
    assert.equal(existsSync(pdfPath), true, "source PDF must remain on disk");

    const fixture = loadBurtonBenchmarkFixture(REPO_ROOT);

    assert.equal(fixture.benchmarkId, "beckstead-burton-benchmark-v1");
    assert.equal(fixture.benchmarkVersion, "v1-freeze-candidate");
    assert.equal(fixture.status, "freeze-candidate");
    assert.equal(fixture.frozenAt, null);
    assert.equal(fixture.sourceFile, BURTON_BENCHMARK_SOURCE_FILE);
    assert.equal(fixture.quoteNumber, "1343851");
    assert.equal(fixture.items.length, 90);

    const lineNumbers = fixture.items.map((item) => item.lineNumber);
    assert.equal(new Set(lineNumbers).size, 90);
    assert.equal(
      new Set(fixture.items.map((item) => item.benchmarkItemId)).size,
      90,
    );
    assert.equal(
      fixture.items.every((item) => item.comparisonEligible === false),
      true,
    );
    assert.equal(
      fixture.items.some((item) => item.comparisonEligible !== false),
      false,
    );

    const byLine = new Map(
      fixture.items.map((item) => [item.lineNumber, item]),
    );
    const studs2x4 = byLine.get(45);
    assert.equal(studs2x4?.originalQuantity, 244);
    assert.equal(studs2x4?.originalUnit, "ea");
    assert.equal(studs2x4?.normalizedFamily, "stud");
    assert.equal(studs2x4?.inFramingEngineScope, true);

    const bci = byLine.get(37);
    assert.equal(bci?.originalQuantity, 1388);
    assert.equal(bci?.originalUnit, "lf");
    assert.equal(bci?.quantityLayer, "procurement_lf");

    const rim = byLine.get(36);
    assert.equal(rim?.originalQuantity, 8);
    assert.equal(rim?.originalUnit, "ea");
    assert.equal(rim?.normalizedFamily, "rim_board");
    assert.notEqual(rim?.originalQuantity, 571);

    const truss = byLine.get(70);
    assert.equal(truss?.quantityLayer, "package_lump");
    assert.equal(truss?.engineJoin, null);

    const rebar = byLine.get(3);
    assert.equal(rebar?.inFramingEngineScope, false);
    assert.equal(rebar?.quantityLayer, "out_of_framing_scope");
  });

  it("does not import production read/resolve/calculate/output modules", () => {
    const dir = path.join(REPO_ROOT, "src/framing/benchmark");
    for (const file of [
      "burtonBenchmark.schema.ts",
      "loadBurtonBenchmarkFixture.ts",
      "benchmarkComparison.schema.ts",
      "compareBurtonBenchmark.ts",
      "explainBurtonBenchmark.ts",
      "exportBurtonBenchmarkCsv.ts",
      "benchmarkDisplay.ts",
    ]) {
      const source = readFileSync(path.join(dir, file), "utf8");
      assert.equal(
        FORBIDDEN_IMPORT.test(source),
        false,
        `${file} must not import the production pipeline`,
      );
    }

    const fixtureSource = readFileSync(
      path.join(REPO_ROOT, BURTON_BENCHMARK_FIXTURE_RELATIVE_PATH),
      "utf8",
    );
    assert.match(fixtureSource, /"sourceFile": "benchmarks\/beckstead\/source\/burton-takeoff.pdf"/);
  });
});
