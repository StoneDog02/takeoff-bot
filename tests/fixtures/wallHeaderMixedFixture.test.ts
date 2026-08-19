import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { indexPlan } from "../../src/plans/indexPlan.js";
import {
  mixedHeaderLengthLineIndexes,
  WALL_HDR001_MIXED_8FT_TEXT,
  WALL_HDR001_MIXED_TEXT,
  wallHeaderMixedFixtureText,
} from "../fixtures/wallHeaderMixedFixtureLines.js";

const fixturesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures",
);
const controlPdf = path.join(fixturesDir, "wall-w001-hdr001-text-layer.pdf");
const mutationPdf = path.join(fixturesDir, "wall-w001-hdr001-8ft-text-layer.pdf");

describe("wall+header mixed fixture PDFs", () => {
  it("indexes the 6-ft control mixed-domain fixture", async () => {
    const planIndex = await indexPlan(controlPdf);

    assert.equal(planIndex.totalPages, 1);
    assert.equal(planIndex.pages[0]?.textContent, WALL_HDR001_MIXED_TEXT);
    assert.match(planIndex.pages[0]?.textContent ?? "", /W-001/);
    assert.match(planIndex.pages[0]?.textContent ?? "", /HDR-001/);
    assert.match(planIndex.pages[0]?.textContent ?? "", /Length: 6 ft/);
  });

  it("indexes the 8-ft mutation mixed-domain fixture", async () => {
    const planIndex = await indexPlan(mutationPdf);

    assert.equal(planIndex.totalPages, 1);
    assert.equal(planIndex.pages[0]?.textContent, WALL_HDR001_MIXED_8FT_TEXT);
    assert.match(planIndex.pages[0]?.textContent ?? "", /Length: 8 ft/);
  });

  it("differs only on the header length line between control and mutation", async () => {
    const controlIndex = await indexPlan(controlPdf);
    const mutationIndex = await indexPlan(mutationPdf);
    const controlText = controlIndex.pages[0]?.textContent ?? "";
    const mutationText = mutationIndex.pages[0]?.textContent ?? "";

    assert.equal(controlText, WALL_HDR001_MIXED_TEXT);
    assert.equal(mutationText, WALL_HDR001_MIXED_8FT_TEXT);
    assert.notEqual(controlText, mutationText);
    assert.deepEqual(
      mixedHeaderLengthLineIndexes(controlText, mutationText),
      [11],
    );
    assert.equal(controlText.split("\n")[11], "Length: 6 ft");
    assert.equal(mutationText.split("\n")[11], "Length: 8 ft");
  });

  it("builds fixture text deterministically from header length", () => {
    assert.equal(wallHeaderMixedFixtureText(6), WALL_HDR001_MIXED_TEXT);
    assert.equal(wallHeaderMixedFixtureText(8), WALL_HDR001_MIXED_8FT_TEXT);
    assert.notEqual(WALL_HDR001_MIXED_TEXT, WALL_HDR001_MIXED_8FT_TEXT);
  });
});
