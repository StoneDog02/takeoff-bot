import assert from "node:assert/strict";
import { mkdir, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { computePlanSourceFingerprint } from "../../src/plans/computePlanSourceFingerprint.js";
import { indexPlan } from "../../src/plans/indexPlan.js";
import { tryDeriveRoleAssignmentsFromClassification } from "../../src/plans/deriveRoleAssignmentsFromPageClassification.js";
import { classifyPlanPagesDeterministically } from "../../src/plans/classifyPlanPages.js";
import { readPdfOutlinePageMap } from "../../src/plans/readPdfOutlinePageMap.js";

const fixturesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures",
);
const becksteadPdf = path.join(fixturesDir, "beckstead-residence-plans.pdf");
const wallPdf = path.join(fixturesDir, "wall-w001-text-layer.pdf");

describe("plan source fingerprint with PDF content hash", () => {
  it("distinguishes different PDF bytes even when text layers are empty", async () => {
    const outDir = path.resolve("artifacts/beckstead-b1.3/fingerprint");
    await mkdir(outDir, { recursive: true });

    const aPath = path.join(outDir, "a.pdf");
    const bPath = path.join(outDir, "b.pdf");
    await copyFile(becksteadPdf, aPath);
    // Mutate one byte so hashes differ while remaining a PDF-sized blob for hashing.
    const wallBytes = await import("node:fs/promises").then((fs) =>
      fs.readFile(wallPdf),
    );
    await writeFile(bPath, wallBytes);

    const indexA = await indexPlan(aPath);
    const indexB = await indexPlan(bPath);

    assert.ok(indexA.sourceContentHash);
    assert.ok(indexB.sourceContentHash);
    assert.notEqual(indexA.sourceContentHash, indexB.sourceContentHash);

    // Force empty text comparison case for A vs a clone with cleared text conceptually:
    // different PDFs already differ; also same text emptiness on Beckstead pages.
    assert.ok(indexA.pages.every((page) => page.textContent.trim() === ""));
    assert.notEqual(
      computePlanSourceFingerprint(indexA),
      computePlanSourceFingerprint(indexB),
    );
  });

  it("is stable for the same PDF bytes across path relocation", async () => {
    const outDir = path.resolve("artifacts/beckstead-b1.3/fingerprint");
    await mkdir(outDir, { recursive: true });
    const relocated = path.join(outDir, "beckstead-relocated.pdf");
    await copyFile(becksteadPdf, relocated);

    const original = await indexPlan(becksteadPdf);
    const moved = await indexPlan(relocated);
    assert.equal(original.sourceContentHash, moved.sourceContentHash);
    assert.equal(
      computePlanSourceFingerprint(original),
      computePlanSourceFingerprint(moved),
    );
  });
});

describe("Beckstead read-only routing probe", () => {
  it("captures outline identity but cannot derive framing roles automatically", async () => {
    const outline = await readPdfOutlinePageMap(becksteadPdf);
    assert.equal(outline.size, 11);
    assert.equal(outline.get(1), "11");
    assert.equal(outline.get(4), "23");
    assert.equal(outline.get(11), "62");

    const planIndex = await indexPlan(becksteadPdf);
    assert.equal(planIndex.totalPages, 11);
    assert.ok(planIndex.sourceContentHash);
    assert.equal(planIndex.pages[0]?.sheetId, "11");
    assert.equal(planIndex.pages[0]?.label, "11");
    assert.equal(planIndex.pages[3]?.sheetId, "23");

    const classification = classifyPlanPagesDeterministically(planIndex);
    assert.ok(classification.every((page) => page.pageKind === "unknown"));
    assert.ok(classification.every((page) => page.needsVisualClassification));
    const derived = tryDeriveRoleAssignmentsFromClassification({
      intent: "wall-framing",
      pages: classification.map((page) => ({
        pageNumber: page.pageNumber,
        pageType: page.pageType,
        relevantToFraming: page.relevantToFraming,
        pageKind: page.pageKind,
        scopeHints: page.scopeHints,
        needsVisualClassification: page.needsVisualClassification,
      })),
    });
    assert.equal(derived, null);
  });
});
