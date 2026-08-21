import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Evidence } from "../../src/core/schemas/evidence.schema.js";
import {
  classifyExpectedFact,
  findForbiddenInventions,
  scoreExpectedFacts,
  summarizeFactScores,
} from "../helpers/extractionQuality.js";
import type { ExpectedSemanticFact } from "../fixtures/realisticResidentialFramingPlan.js";
import { REALISTIC_PLAN_FORBIDDEN_INVENTIONS } from "../fixtures/realisticResidentialFramingPlan.js";

function evidence(partial: {
  id: string;
  subjectKey: string;
  propertyPath: string;
  candidateValue: string | number | boolean | null;
  subjectKind?: Evidence["subjectKind"];
}): Evidence {
  return {
    id: partial.id,
    type: "note",
    relationship: "supports",
    description: "test",
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
    originalText: "fixture text",
    references: [],
    subjectKind: partial.subjectKind ?? "wall",
    subjectKey: partial.subjectKey,
    propertyPath: partial.propertyPath,
    candidateValue: partial.candidateValue,
  };
}

describe("extractionQuality helpers", () => {
  it("classifies CORRECT / MISSING / MISATTRIBUTED / CONFLICTED", () => {
    const fact: ExpectedSemanticFact = {
      id: "wall-length",
      domain: "wall",
      subjectKey: "W1",
      propertyPath: "lengthFeet",
      expectedValue: 24,
      sourceHint: "24'",
    };

    assert.equal(
      classifyExpectedFact(
        [evidence({ id: "E1", subjectKey: "W1", propertyPath: "lengthFeet", candidateValue: 24 })],
        fact,
      ).classification,
      "CORRECT",
    );

    assert.equal(classifyExpectedFact([], fact).classification, "MISSING");

    assert.equal(
      classifyExpectedFact(
        [
          evidence({
            id: "E2",
            subjectKey: "W2",
            propertyPath: "lengthFeet",
            candidateValue: 24,
          }),
        ],
        fact,
      ).classification,
      "MISATTRIBUTED",
    );

    assert.equal(
      classifyExpectedFact(
        [
          evidence({
            id: "E3",
            subjectKey: "W1",
            propertyPath: "lengthFeet",
            candidateValue: 24,
          }),
          evidence({
            id: "E4",
            subjectKey: "W1",
            propertyPath: "lengthFeet",
            candidateValue: 20,
          }),
        ],
        fact,
      ).classification,
      "CONFLICTED",
    );
  });

  it("treats N-S and north-south as the same span direction", () => {
    const fact: ExpectedSemanticFact = {
      id: "span",
      domain: "floor",
      subjectKey: "BAY A",
      propertyPath: "spanDirection",
      expectedValue: "north-south",
      sourceHint: "SPAN N-S",
    };
    assert.equal(
      classifyExpectedFact(
        [
          evidence({
            id: "E-SPAN",
            subjectKey: "BAY A",
            propertyPath: "spanDirection",
            candidateValue: "N-S",
            subjectKind: "floor-framing-area",
          }),
        ],
        fact,
      ).classification,
      "CORRECT",
    );
  });

  it("scores wallType via production wood-stud class (not substring)", () => {
    const fact: ExpectedSemanticFact = {
      id: "wall-w1-type",
      domain: "wall",
      subjectKey: "W1",
      propertyPath: "wallType",
      expectedValue: "wood stud",
      sourceHint: "WOOD STUD",
    };

    assert.equal(
      classifyExpectedFact(
        [
          evidence({
            id: "E-WT",
            subjectKey: "W1",
            propertyPath: "wallType",
            candidateValue: "wood stud wall",
          }),
        ],
        fact,
      ).classification,
      "CORRECT",
    );

    assert.equal(
      classifyExpectedFact(
        [
          evidence({
            id: "E-METAL",
            subjectKey: "W1",
            propertyPath: "wallType",
            candidateValue: "metal stud",
          }),
        ],
        fact,
      ).classification,
      "UNEXPECTED",
    );

    assert.equal(
      classifyExpectedFact(
        [
          evidence({
            id: "E-CMU",
            subjectKey: "W1",
            propertyPath: "wallType",
            candidateValue: "concrete masonry",
          }),
        ],
        fact,
      ).classification,
      "UNEXPECTED",
    );
  });

  it("scores joistType via production I-joist class", () => {
    const fact: ExpectedSemanticFact = {
      id: "floor-sys-joist-type",
      domain: "floor",
      subjectKey: "FLOOR SYS",
      propertyPath: "assembly.joistType",
      expectedValue: "i-joist",
      sourceHint: "I-JOISTS",
      subjectKind: "floor-framing-system",
    };

    assert.equal(
      classifyExpectedFact(
        [
          evidence({
            id: "E-IJ",
            subjectKey: "FLOOR SYS",
            propertyPath: "assembly.joistType",
            candidateValue: "I-JOISTS",
            subjectKind: "floor-framing-system",
          }),
        ],
        fact,
      ).classification,
      "CORRECT",
    );

    for (const bad of ["floor-truss", "dimensional-lumber", "metal joist"]) {
      assert.equal(
        classifyExpectedFact(
          [
            evidence({
              id: `E-BAD-${bad}`,
              subjectKey: "FLOOR SYS",
              propertyPath: "assembly.joistType",
              candidateValue: bad,
              subjectKind: "floor-framing-system",
            }),
          ],
          fact,
        ).classification,
        "UNEXPECTED",
        bad,
      );
    }
  });

  it("scores framingType via production stick common-rafter class", () => {
    const fact: ExpectedSemanticFact = {
      id: "roof-sys-type",
      domain: "roof",
      subjectKey: "ROOF SYS",
      propertyPath: "assembly.framingType",
      expectedValue: "stick",
      sourceHint: "STICK FRAMED",
      subjectKind: "roof-framing-system",
    };

    assert.equal(
      classifyExpectedFact(
        [
          evidence({
            id: "E-ST",
            subjectKey: "ROOF SYS",
            propertyPath: "assembly.framingType",
            candidateValue: "STICK FRAMED",
            subjectKind: "roof-framing-system",
          }),
        ],
        fact,
      ).classification,
      "CORRECT",
    );

    for (const bad of ["roof-truss", "truss", "metal rafter"]) {
      assert.equal(
        classifyExpectedFact(
          [
            evidence({
              id: `E-BAD-${bad}`,
              subjectKey: "ROOF SYS",
              propertyPath: "assembly.framingType",
              candidateValue: bad,
              subjectKind: "roof-framing-system",
            }),
          ],
          fact,
        ).classification,
        "UNEXPECTED",
        bad,
      );
    }
  });

  it("scores sheathing application via production canonicalizer", () => {
    const fact: ExpectedSemanticFact = {
      id: "sheathing-sys-application",
      domain: "sheathing",
      subjectKey: "WALL SH SYS",
      propertyPath: "application",
      expectedValue: "wall",
      sourceHint: "EXTERIOR WALLS",
    };

    for (const candidate of [
      "EXTERIOR WALLS",
      "EXT WALL",
      "EXT WALLS",
      "INT WALL",
      "INT WALLS",
    ]) {
      assert.equal(
        classifyExpectedFact(
          [
            evidence({
              id: `E-APP-${candidate}`,
              subjectKey: "WALL SH SYS",
              propertyPath: "application",
              candidateValue: candidate,
              subjectKind: "sheathing-system",
            }),
          ],
          fact,
        ).classification,
        "CORRECT",
        candidate,
      );
    }

    assert.equal(
      classifyExpectedFact(
        [
          evidence({
            id: "E-BAD",
            subjectKey: "WALL SH SYS",
            propertyPath: "application",
            candidateValue: "sidewall",
            subjectKind: "sheathing-system",
          }),
        ],
        fact,
      ).classification,
      "UNEXPECTED",
    );
  });

  it("does not treat free-text substring containment as equality", () => {
    const fact: ExpectedSemanticFact = {
      id: "wall-material",
      domain: "wall",
      subjectKey: "W1",
      propertyPath: "assembly.material",
      expectedValue: "dimensional lumber",
      sourceHint: "DIMENSIONAL LUMBER",
    };
    assert.equal(
      classifyExpectedFact(
        [
          evidence({
            id: "E-MAT",
            subjectKey: "W1",
            propertyPath: "assembly.material",
            candidateValue: "not dimensional lumber related phrasing",
          }),
        ],
        fact,
      ).classification,
      "UNEXPECTED",
    );
  });

  it("detects forbidden jack and sheathing SF inventions", () => {
    const hits = findForbiddenInventions(
      [
        evidence({
          id: "E-D04-J",
          subjectKey: "D04",
          propertyPath: "jackStudCount",
          candidateValue: 2,
          subjectKind: "opening",
        }),
        evidence({
          id: "E-SH-SF",
          subjectKey: "WALL SH A",
          propertyPath: "areaSquareFeet",
          candidateValue: 900,
          subjectKind: "sheathing-area",
        }),
      ],
      REALISTIC_PLAN_FORBIDDEN_INVENTIONS,
    );

    assert.ok(hits.some((hit) => hit.inventionId === "no-d04-jacks"));
    assert.ok(hits.some((hit) => hit.inventionId === "no-sheathing-sf"));
  });

  it("summarizes score classes", () => {
    const facts: ExpectedSemanticFact[] = [
      {
        id: "a",
        domain: "wall",
        subjectKey: "W1",
        propertyPath: "lengthFeet",
        expectedValue: 24,
        sourceHint: "",
      },
      {
        id: "b",
        domain: "wall",
        subjectKey: "W1",
        propertyPath: "assembly.studSize",
        expectedValue: "2x6",
        sourceHint: "",
      },
    ];
    const scores = scoreExpectedFacts(
      [
        evidence({
          id: "E1",
          subjectKey: "W1",
          propertyPath: "lengthFeet",
          candidateValue: 24,
        }),
      ],
      facts,
    );
    assert.deepEqual(summarizeFactScores(scores), {
      CORRECT: 1,
      MISSING: 1,
      CONFLICTED: 0,
      UNEXPECTED: 0,
      MISATTRIBUTED: 0,
    });
  });

  it("replays retained Milestone H live Evidence through production-aligned scorer", async () => {
    const { readFile } = await import("node:fs/promises");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const { REALISTIC_PLAN_EXPECTED_FACTS } = await import(
      "../fixtures/realisticResidentialFramingPlan.js"
    );

    const fixturePath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../fixtures/realistic-residential-live-evidence-milestone-h-scoring.json",
    );
    const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as {
      evidence: Evidence[];
    };

    const scores = scoreExpectedFacts(
      fixture.evidence,
      REALISTIC_PLAN_EXPECTED_FACTS,
    );
    const summary = summarizeFactScores(scores);
    assert.equal(
      summary.CORRECT,
      REALISTIC_PLAN_EXPECTED_FACTS.length,
      JSON.stringify(summary),
    );
    assert.equal(summary.MISSING, 0);
    assert.equal(summary.CONFLICTED, 0);
    assert.equal(summary.UNEXPECTED, 0);
    assert.equal(summary.MISATTRIBUTED, 0);

    for (const factId of [
      "wall-w1-type",
      "floor-sys-joist-type",
      "roof-sys-type",
      "sheathing-sys-application",
    ]) {
      assert.equal(
        scores.find((score) => score.factId === factId)?.classification,
        "CORRECT",
        factId,
      );
    }
  });
});
