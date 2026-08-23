import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";

import { extractWallAssemblyPlanNoteFacts } from "../../src/scopes/framing/geometry/extractWallAssemblyPlanNoteFacts.js";

describe("B2.2M.2 Beckstead wall assembly integration gates", () => {
  it("Phase 5D OCR establishes spacing, plates, and thickness legend", async () => {
    const ocrDir = path.join(process.cwd(), "artifacts/b2.2m.2/ocr");
    const texts = await Promise.all(
      [1, 3, 4].map((n) =>
        readFile(path.join(ocrDir, `page-${String(n).padStart(2, "0")}.txt`), "utf8"),
      ),
    );
    const facts = extractWallAssemblyPlanNoteFacts(texts);
    assert.equal(facts.studSpacingInches, 16);
    assert.ok(facts.doubleTopPlatesFor.length > 0);
    assert.ok(facts.thicknessLegend);
  });

  it("representation decision is MULTI_SOURCE", async () => {
    const decision = JSON.parse(
      await readFile(
        path.join(
          process.cwd(),
          "artifacts/b2.2m.2/metrics/wall-assembly-representation-decision.json",
        ),
        "utf8",
      ),
    );
    assert.equal(decision.decision, "MULTI_SOURCE");
    assert.equal(decision.adoptAdaptCombineBuild, "COMBINE");
  });
});
