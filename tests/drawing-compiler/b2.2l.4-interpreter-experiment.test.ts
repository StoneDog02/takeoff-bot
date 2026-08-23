import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";

const METRICS = path.resolve("artifacts/b2.2l.4/metrics");

describe("B2.2L.4 interpreter experiment artifacts", () => {
  it("interpreter-experiment.json records GREEN on compiler_heavy branch", async () => {
    const raw = await readFile(
      path.join(METRICS, "interpreter-experiment.json"),
      "utf8",
    );
    const summary = JSON.parse(raw) as {
      overallGreen: boolean;
      promoteRecommended: boolean;
      branches: Array<{
        branch: string;
        greenOutcome: string | null;
        unresolvedCount: number;
      }>;
    };
    assert.equal(summary.overallGreen, true);
    assert.equal(summary.promoteRecommended, true);
    const compilerHeavy = summary.branches.find(
      (b) => b.branch === "compiler_heavy",
    );
    assert.ok(compilerHeavy);
    assert.equal(compilerHeavy.greenOutcome, "GREEN");
    assert.ok(compilerHeavy.unresolvedCount >= 1);
  });

  it("governed dictionary exists for compiler_heavy branch", async () => {
    const raw = await readFile(
      path.resolve(
        "artifacts/b2.2l.4/probe/compiler_heavy/governed-dictionary.json",
      ),
      "utf8",
    );
    const governed = JSON.parse(raw) as {
      governance: { greenOutcome: string };
      unresolved: unknown[];
    };
    assert.equal(governed.governance.greenOutcome, "GREEN");
    assert.ok(governed.unresolved.length >= 1);
  });
});
