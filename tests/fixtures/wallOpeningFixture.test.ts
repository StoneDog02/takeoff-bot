import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { indexPlan } from "../../src/plans/indexPlan.js";
import {
  mixedOpeningNominalWidthLineIndexes,
  openingNominalWidthLineIndex,
  WALL_O001_MIXED_4FT_TEXT,
  WALL_O001_MIXED_TEXT,
  wallOpeningFixtureText,
} from "./wallOpeningFixtureLines.js";

const fixturesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures",
);
const controlPdf = path.join(fixturesDir, "wall-w001-o001-text-layer.pdf");
const mutationPdf = path.join(fixturesDir, "wall-w001-o001-4ft-text-layer.pdf");

describe("wall+opening mixed fixture PDFs", () => {
  it("indexes the 3-ft nominal-width control mixed-domain fixture", async () => {
    const planIndex = await indexPlan(controlPdf);

    assert.equal(planIndex.totalPages, 1);
    assert.equal(planIndex.pages[0]?.textContent, WALL_O001_MIXED_TEXT);
    assert.match(planIndex.pages[0]?.textContent ?? "", /W-001/);
    assert.match(planIndex.pages[0]?.textContent ?? "", /O-001/);
    assert.match(planIndex.pages[0]?.textContent ?? "", /O-001 in Wall W-001/);
  });

  it("indexes the 4-ft nominal-width mutation mixed-domain fixture", async () => {
    const planIndex = await indexPlan(mutationPdf);

    assert.equal(planIndex.totalPages, 1);
    assert.equal(planIndex.pages[0]?.textContent, WALL_O001_MIXED_4FT_TEXT);
    assert.match(planIndex.pages[0]?.textContent ?? "", /Nominal width: 4 ft/);
  });

  it("differs only on the opening nominal-width line between control and mutation", async () => {
    const controlIndex = await indexPlan(controlPdf);
    const mutationIndex = await indexPlan(mutationPdf);
    const controlText = controlIndex.pages[0]?.textContent ?? "";
    const mutationText = mutationIndex.pages[0]?.textContent ?? "";
    const nominalWidthLineIndex = openingNominalWidthLineIndex();

    assert.equal(controlText, WALL_O001_MIXED_TEXT);
    assert.equal(mutationText, WALL_O001_MIXED_4FT_TEXT);
    assert.notEqual(controlText, mutationText);
    assert.deepEqual(
      mixedOpeningNominalWidthLineIndexes(controlText, mutationText),
      [nominalWidthLineIndex],
    );
    assert.equal(controlText.split("\n")[nominalWidthLineIndex], "Nominal width: 3 ft");
    assert.equal(
      mutationText.split("\n")[nominalWidthLineIndex],
      "Nominal width: 4 ft",
    );
  });

  it("builds fixture text deterministically from nominal width", () => {
    assert.equal(wallOpeningFixtureText(3), WALL_O001_MIXED_TEXT);
    assert.equal(wallOpeningFixtureText(4), WALL_O001_MIXED_4FT_TEXT);
    assert.notEqual(WALL_O001_MIXED_TEXT, WALL_O001_MIXED_4FT_TEXT);
  });
});
