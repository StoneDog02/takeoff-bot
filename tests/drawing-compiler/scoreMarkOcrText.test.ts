import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";

import { scoreMarkOcrText } from "../../src/drawing-compiler/semantic-mark-recovery/scoreMarkOcrText.js";

describe("scoreMarkOcrText", () => {
  it("accepts type identifiers and rejects imperial dimensions", () => {
    const sw = scoreMarkOcrText("SW2", 85);
    assert.ok(sw?.isTypeIdentifier);
    assert.equal(sw?.normalizedKey, "SW2");

    const dim = scoreMarkOcrText("12'-6\"", 90);
    assert.equal(dim, null);
  });

  it("normalizes wall type tokens from OCR", () => {
    const token = scoreMarkOcrText("SW5", 70);
    assert.ok(token?.isTypeIdentifier);
    assert.equal(token?.normalizedKey, "SW5");
  });
});
