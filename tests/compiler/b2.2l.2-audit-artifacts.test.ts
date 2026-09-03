import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";

const METRICS = path.join("artifacts", "b2.2l.2", "metrics");

async function loadJson(name: string) {
  const raw = await readFile(path.join(METRICS, name), "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}

describe("B2.2L.2 audit artifacts", () => {
  it("page-semantic-inventory covers all Beckstead pages", async () => {
    const inv = await loadJson("page-semantic-inventory.json");
    const pages = inv.pages as Array<{ pageNumber: number }>;
    assert.equal(pages.length, 11);
    assert.ok(pages.some((p) => p.pageNumber === 4));
  });

  it("primitive-decision-matrix has required gate decisions", async () => {
    const matrix = await loadJson("primitive-decision-matrix.json");
    const decisions = matrix.decisions as Array<{ decision: string }>;
    assert.ok(decisions.length >= 8);
    assert.ok(decisions.some((d) => d.decision === "BUILD"));
    assert.ok(decisions.some((d) => d.decision === "ADAPT"));
  });

  it("b2.2l1 decision review recommends HYBRID over plan DIRECT_OCR", async () => {
    const review = await loadJson("b2.2l1-decision-review.json");
    assert.equal(review.originalDecision, "DIRECT_OCR");
    assert.match(String(review.revisedRecommendation), /HYBRID/);
  });

  it("wall-human-traces reference real physical run keys on p4", async () => {
    const traces = await loadJson("wall-human-traces.json");
    const items = traces.traces as Array<{ physicalRunKey: string }>;
    assert.ok(items.length >= 3);
    for (const t of items) {
      assert.match(t.physicalRunKey, /^physical-run:p4:/);
    }
  });

  it("external-solutions catalog is non-empty", async () => {
    const solutions = JSON.parse(
      await readFile(path.join(METRICS, "external-solutions.json"), "utf8"),
    ) as unknown[];
    assert.ok(solutions.length >= 5);
  });
});
