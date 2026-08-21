import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  compactPlanText,
  isPlanTextGrounded,
  normalizePlanText,
  planTextIncludes,
} from "../helpers/planTextNormalize.js";

describe("planTextNormalize", () => {
  it("normalizes curly quotes, dashes, and whitespace", () => {
    assert.equal(
      normalizePlanText("BAY A = 20\u2019-0\"   E-W"),
      "bay a = 20'-0\" e-w",
    );
    assert.equal(normalizePlanText("A\u2014B"), "a-b");
    assert.equal(compactPlanText("4'-0\""), "4-0");
  });

  it("matches markers despite quote/whitespace differences", () => {
    const indexed = 'BAY A = 20\u2019-0" E-W\nGABLE LENGTH 20\u2019-0"';
    assert.ok(planTextIncludes(indexed, "BAY A = 20'-0\" E-W"));
    assert.ok(planTextIncludes(indexed, "GABLE LENGTH 20'-0\""));
  });

  it("grounds paraphrases with ellipsis and feet-inch punctuation", () => {
    const page = [
      "MARK  TYPE    ROUGH OPENING     QTY  WALL  HEADER  NOTES",
      'W3    WINDOW  4\u2019-0" x 5\u2019-0"      1    W1    H2      2 JACK STUDS',
      'W1 HT 9\u2019-0" 3 PLATES',
    ].join("\n");
    assert.ok(isPlanTextGrounded("W3 WINDOW ... 1 W1 H2", page));
    assert.ok(isPlanTextGrounded("ROUGH OPENING 4'-0\" x 5'-0\"", page));
    assert.ok(isPlanTextGrounded("HT 9\u2019-0\"", page));
  });
});
