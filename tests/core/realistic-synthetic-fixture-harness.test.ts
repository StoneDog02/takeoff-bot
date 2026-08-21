import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import type { Evidence } from "../../src/core/schemas/evidence.schema.js";
import { indexPlan } from "../../src/plans/indexPlan.js";
import {
  REALISTIC_PLAN_EXPECTED_FACTS,
  REALISTIC_PLAN_FORBIDDEN_INVENTIONS,
  REALISTIC_RESIDENTIAL_FRAMING_PLAN_TEXT,
  realisticPlanStyleBCompactPages,
  realisticResidentialFramingPlanPages,
} from "../fixtures/realisticResidentialFramingPlan.js";
import {
  findForbiddenInventions,
  scoreExpectedFacts,
  summarizeFactScores,
} from "../helpers/extractionQuality.js";
import {
  assertNoEnginePropertyCoaching,
  assertRequiredMarkers,
  isPlanTextGrounded,
  planTextIncludes,
  REALISTIC_GROUNDING_SAMPLES,
  REALISTIC_STYLE_A_REQUIRED_MARKERS,
  REALISTIC_STYLE_B_REQUIRED_MARKERS,
} from "../helpers/planTextNormalize.js";
import { writeTextLayerPdf } from "../helpers/writeTextLayerPdf.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const STYLE_A_PDF = path.resolve(
  ROOT,
  "../fixtures/realistic-residential-framing-plan-text-layer.pdf",
);
const STYLE_B_PDF = path.resolve(
  ROOT,
  "../fixtures/realistic-residential-framing-plan-style-b-text-layer.pdf",
);

function assertAsciiPdfBodyLines(pages: readonly (readonly string[])[]): void {
  for (const [pageIndex, lines] of pages.entries()) {
    for (const [lineIndex, line] of lines.entries()) {
      for (const char of line) {
        assert.ok(
          char.codePointAt(0)! <= 0x7f,
          `Non-ASCII in page ${pageIndex + 1} line ${lineIndex + 1}: ${JSON.stringify(char)} in ${JSON.stringify(line)}`,
        );
      }
    }
  }
}

async function indexedText(pdfPath: string): Promise<string> {
  const planIndex = await indexPlan(pdfPath);
  return planIndex.pages.map((page) => page.textContent).join("\n");
}

describe("realistic synthetic fixture harness (no Claude)", () => {
  it("keeps Style A/B source lines ASCII-safe for text-layer PDF encoding", () => {
    assertAsciiPdfBodyLines(realisticResidentialFramingPlanPages());
    assertAsciiPdfBodyLines(realisticPlanStyleBCompactPages());
    assertNoEnginePropertyCoaching(REALISTIC_RESIDENTIAL_FRAMING_PLAN_TEXT);
  });

  it("round-trips Style A through writeTextLayerPdf → indexPlan with required markers", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "realistic-style-a-"));
    const tempPdf = path.join(dir, "style-a.pdf");
    try {
      await writeTextLayerPdf(tempPdf, realisticResidentialFramingPlanPages());
      const text = await indexedText(tempPdf);
      assertRequiredMarkers(text, REALISTIC_STYLE_A_REQUIRED_MARKERS, "Style A");
      assertNoEnginePropertyCoaching(text);
      assert.equal((await indexPlan(tempPdf)).pages.length, 4);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("round-trips Style B through writeTextLayerPdf → indexPlan with required markers", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "realistic-style-b-"));
    const tempPdf = path.join(dir, "style-b.pdf");
    try {
      await writeTextLayerPdf(tempPdf, realisticPlanStyleBCompactPages());
      const text = await indexedText(tempPdf);
      assertRequiredMarkers(text, REALISTIC_STYLE_B_REQUIRED_MARKERS, "Style B");
      assert.equal((await indexPlan(tempPdf)).pages.length, 4);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("committed Style A/B PDFs index with the same required markers", async () => {
    const styleA = await indexedText(STYLE_A_PDF);
    const styleB = await indexedText(STYLE_B_PDF);
    assertRequiredMarkers(
      styleA,
      REALISTIC_STYLE_A_REQUIRED_MARKERS,
      "committed Style A",
    );
    assertRequiredMarkers(
      styleB,
      REALISTIC_STYLE_B_REQUIRED_MARKERS,
      "committed Style B",
    );
    assert.ok(planTextIncludes(styleA, "2 JACK STUDS"));
    assert.ok(!planTextIncludes(styleA, "joistLayoutLengthFeet"));
  });

  it("grounds representative Evidence originalText samples against indexed Style A", async () => {
    const pageText = await indexedText(STYLE_A_PDF);
    for (const sample of REALISTIC_GROUNDING_SAMPLES) {
      assert.ok(
        isPlanTextGrounded(sample, pageText),
        `Expected grounded sample: ${JSON.stringify(sample)}`,
      );
    }
  });

  it("scores semantic facts and detects forbidden inventions without Claude", () => {
    const evidence: Evidence[] = [
      {
        id: "E-W1-SIZE",
        type: "note",
        relationship: "supports",
        description: "stud size",
        source: {
          page: {
            documentId: null,
            pageNumber: 1,
            sheetId: null,
            sheetTitle: null,
            pageLabel: null,
            revision: null,
          },
          region: null,
          elementLabel: null,
          detailNumber: null,
          sectionNumber: null,
          scheduleName: null,
          noteReference: null,
        },
        originalText: '2x6 SPF STUDS @ 16" O.C.',
        references: [],
        subjectKind: "wall",
        subjectKey: "W1",
        propertyPath: "assembly.studSize",
        candidateValue: "2x6",
      },
      {
        id: "E-D04-JACK-INVENTED",
        type: "note",
        relationship: "supports",
        description: "invented",
        source: {
          page: {
            documentId: null,
            pageNumber: 2,
            sheetId: null,
            sheetTitle: null,
            pageLabel: null,
            revision: null,
          },
          region: null,
          elementLabel: null,
          detailNumber: null,
          sectionNumber: null,
          scheduleName: null,
          noteReference: null,
        },
        originalText: "invented",
        references: [],
        subjectKind: "opening",
        subjectKey: "D04",
        propertyPath: "jackStudCount",
        candidateValue: 2,
      },
    ];

    const scores = scoreExpectedFacts(evidence, REALISTIC_PLAN_EXPECTED_FACTS);
    assert.equal(
      scores.find((score) => score.factId === "wall-w1-stud-size")?.classification,
      "CORRECT",
    );
    assert.ok(
      summarizeFactScores(scores).MISSING > summarizeFactScores(scores).CORRECT,
    );
    const inventions = findForbiddenInventions(
      evidence,
      REALISTIC_PLAN_FORBIDDEN_INVENTIONS,
    );
    assert.ok(inventions.some((hit) => hit.inventionId === "no-d04-jacks"));
  });
});
