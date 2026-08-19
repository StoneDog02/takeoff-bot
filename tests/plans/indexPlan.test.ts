import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { indexPlan } from "../../src/plans/indexPlan.js";
import {
  WALL_W001_20FT_TEXT,
  WALL_W001_24FT_TEXT,
} from "../fixtures/wallW001FixtureLines.ts";
import { WALL_TWO_WALL_TEXT } from "../fixtures/wallTwoWallFixtureLines.ts";
import { WALL_TWO_WALL_CONFLICT_TEXT } from "../fixtures/wallTwoWallConflictFixtureLines.ts";

const fixturesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures",
);
const wallFixturePdf = path.join(fixturesDir, "wall-w001-text-layer.pdf");
const wall24FixturePdf = path.join(fixturesDir, "wall-w001-24ft-text-layer.pdf");
const twoWallFixturePdf = path.join(fixturesDir, "wall-w001-w002-text-layer.pdf");
const twoWallConflictFixturePdf = path.join(
  fixturesDir,
  "wall-w001-w002-conflict-text-layer.pdf",
);
const twoPageFixturePdf = path.join(fixturesDir, "two-page-notes-text-layer.pdf");
const nonPdfFixture = path.join(fixturesDir, "not-a-pdf.txt");
const invalidPdfFixture = path.join(fixturesDir, "invalid.pdf");
const indexPlanSourcePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../src/plans/indexPlan.ts",
);

describe("indexPlan", () => {
  it("indexes actual PDF page count and text-layer content", async () => {
    const planIndex = await indexPlan(wallFixturePdf);

    assert.equal(planIndex.pdfPath, wallFixturePdf);
    assert.equal(planIndex.totalPages, 1);
    assert.equal(planIndex.pages.length, 1);
    assert.equal(planIndex.pages[0]?.pageNumber, 1);
    assert.equal(planIndex.pages[0]?.sheetId, null);
    assert.equal(planIndex.pages[0]?.label, null);
    assert.match(planIndex.pages[0]?.textContent ?? "", /W-001/);
    assert.match(planIndex.pages[0]?.textContent ?? "", /wood stud wall/i);
    assert.match(planIndex.pages[0]?.textContent ?? "", /20 ft/);
    assert.match(planIndex.pages[0]?.textContent ?? "", /2x4/);
    assert.match(planIndex.pages[0]?.textContent ?? "", /16 in O\.C\./);
    assert.match(planIndex.pages[0]?.textContent ?? "", /8 ft wall height/);
    assert.match(planIndex.pages[0]?.textContent ?? "", /3 plates/);
  });

  it("indexes the 24-ft mutation fixture with only length changed", async () => {
    const controlIndex = await indexPlan(wallFixturePdf);
    const mutationIndex = await indexPlan(wall24FixturePdf);

    assert.equal(mutationIndex.totalPages, 1);
    assert.equal(mutationIndex.pages[0]?.textContent, WALL_W001_24FT_TEXT);
    assert.equal(controlIndex.pages[0]?.textContent, WALL_W001_20FT_TEXT);
    assert.notEqual(
      controlIndex.pages[0]?.textContent,
      mutationIndex.pages[0]?.textContent,
    );

    const controlLines = WALL_W001_20FT_TEXT.split("\n");
    const mutationLines = WALL_W001_24FT_TEXT.split("\n");
    assert.deepEqual(
      controlLines.flatMap((line, index) =>
        line !== mutationLines[index] ? [index] : [],
      ),
      [2],
    );
    assert.equal(controlLines[2], "20 ft");
    assert.equal(mutationLines[2], "24 ft");
  });

  it("indexes the two-wall fixture with both wall blocks and distinct values", async () => {
    const planIndex = await indexPlan(twoWallFixturePdf);

    assert.equal(planIndex.totalPages, 1);
    assert.equal(planIndex.pages.length, 1);
    assert.equal(planIndex.pages[0]?.pageNumber, 1);
    assert.equal(planIndex.pages[0]?.sheetId, null);
    assert.equal(planIndex.pages[0]?.label, null);
    assert.equal(planIndex.pages[0]?.textContent, WALL_TWO_WALL_TEXT);
    assert.match(planIndex.pages[0]?.textContent ?? "", /W-001/);
    assert.match(planIndex.pages[0]?.textContent ?? "", /W-002/);
    assert.match(planIndex.pages[0]?.textContent ?? "", /20 ft/);
    assert.match(planIndex.pages[0]?.textContent ?? "", /12 ft/);
    assert.match(planIndex.pages[0]?.textContent ?? "", /2x4/);
    assert.match(planIndex.pages[0]?.textContent ?? "", /2x6/);
    assert.match(planIndex.pages[0]?.textContent ?? "", /16 in O\.C\./);
    assert.match(planIndex.pages[0]?.textContent ?? "", /24 in O\.C\./);
    assert.match(planIndex.pages[0]?.textContent ?? "", /8 ft wall height/);
    assert.match(planIndex.pages[0]?.textContent ?? "", /9 ft wall height/);
    assert.match(planIndex.pages[0]?.textContent ?? "", /3 plates/);
    assert.match(planIndex.pages[0]?.textContent ?? "", /2 plates/);
  });

  it("indexes the two-wall conflict fixture with both W-002 length notes", async () => {
    const planIndex = await indexPlan(twoWallConflictFixturePdf);

    assert.equal(planIndex.totalPages, 1);
    assert.equal(planIndex.pages.length, 1);
    assert.equal(planIndex.pages[0]?.textContent, WALL_TWO_WALL_CONFLICT_TEXT);
    assert.match(planIndex.pages[0]?.textContent ?? "", /W-001/);
    assert.match(planIndex.pages[0]?.textContent ?? "", /W-002/);
    assert.match(planIndex.pages[0]?.textContent ?? "", /Length note: 12 ft/);
    assert.match(
      planIndex.pages[0]?.textContent ?? "",
      /Conflicting length note: 14 ft/,
    );
    assert.match(planIndex.pages[0]?.textContent ?? "", /20 ft/);
    assert.match(planIndex.pages[0]?.textContent ?? "", /2x4/);
    assert.match(planIndex.pages[0]?.textContent ?? "", /2x6/);
  });

  it("indexes a different PDF as different page count and text", async () => {
    const wallIndex = await indexPlan(wallFixturePdf);
    const notesIndex = await indexPlan(twoPageFixturePdf);

    assert.equal(notesIndex.totalPages, 2);
    assert.equal(notesIndex.pages.length, 2);
    assert.equal(notesIndex.pages[0]?.pageNumber, 1);
    assert.equal(notesIndex.pages[1]?.pageNumber, 2);
    assert.match(notesIndex.pages[0]?.textContent ?? "", /FIXTURE-PAGE-ONE unique-alpha-text/);
    assert.match(notesIndex.pages[1]?.textContent ?? "", /FIXTURE-PAGE-TWO unique-beta-text/);
    assert.notEqual(
      wallIndex.pages[0]?.textContent,
      notesIndex.pages[0]?.textContent,
    );
    assert.equal(notesIndex.pages[0]?.sheetId, null);
    assert.equal(notesIndex.pages[0]?.label, null);
  });

  it("fails clearly when the PDF path does not exist", async () => {
    const missingPath = path.join(fixturesDir, "does-not-exist.pdf");

    await assert.rejects(() => indexPlan(missingPath), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /PDF file not found/);
      assert.match(error.message, /does-not-exist\.pdf/);
      return true;
    });
  });

  it("fails clearly when the file is not a PDF", async () => {
    await assert.rejects(() => indexPlan(nonPdfFixture), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Failed to index PDF/);
      assert.match(error.message, /not a PDF file/i);
      return true;
    });
  });

  it("fails clearly when the PDF is invalid", async () => {
    await assert.rejects(() => indexPlan(invalidPdfFixture), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Failed to index PDF/);
      return true;
    });
  });

  it("does not contain a hardcoded 8-page mock catalog", async () => {
    const source = await readFile(indexPlanSourcePath, "utf8");

    assert.match(source, /@opendataloader\/pdf/);
    assert.doesNotMatch(source, /MOCK_PAGE_TEMPLATES/);
    assert.doesNotMatch(source, /A1\.01/);
    assert.doesNotMatch(source, /A2\.01/);
    assert.doesNotMatch(source, /Floor Plan - Level 1/);
    assert.doesNotMatch(source, /buildMockPageText/);
  });
});
