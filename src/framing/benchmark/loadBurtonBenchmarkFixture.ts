import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  BURTON_BENCHMARK_SOURCE_FILE,
  burtonBenchmarkFixtureSchema,
  type BurtonBenchmarkFixture,
} from "./burtonBenchmark.schema.js";

export const BURTON_BENCHMARK_FIXTURE_RELATIVE_PATH =
  "benchmarks/beckstead/normalized/burton-takeoff.normalized.json";

export { BURTON_BENCHMARK_SOURCE_FILE };

export function loadBurtonBenchmarkFixture(
  repoRoot: string,
): BurtonBenchmarkFixture {
  const raw = JSON.parse(
    readFileSync(
      join(repoRoot, BURTON_BENCHMARK_FIXTURE_RELATIVE_PATH),
      "utf8",
    ),
  ) as unknown;
  return burtonBenchmarkFixtureSchema.parse(raw);
}
