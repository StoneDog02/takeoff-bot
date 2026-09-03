import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  matchPropertyToTruth,
} from "../../src/compiler/semantic-definitions/extractScheduleFromRowBands.js";
import { extractScheduleFromRowBands } from "../../src/compiler/semantic-definitions/extractScheduleFromRowBands.js";
import { extractSegments } from "../../src/compiler/sgg/extractSegments.js";

const PDF = "tests/fixtures/beckstead-residence-plans.pdf";

describe("B2.2L.6 schedule extraction", () => {
  it("normalizeForScheduleMatch compares OCR-tolerant substrings", () => {
    assert.equal(
      matchPropertyToTruth("7/16\" OSB SHEATHING", "7/16"),
      true,
    );
    assert.equal(
      matchPropertyToTruth("ED 8 NAILS", "8"),
      true,
    );
  });

  it("rejects malformed SW keys in markKeyFromText path via row-band scan", async () => {
    const seg = await extractSegments(PDF, 1);
    const result = await extractScheduleFromRowBands({
      pdfPath: PDF,
      pageNumber: 1,
      pageWidth: seg.pageWidth,
      pageHeight: seg.pageHeight,
    });

    for (const def of result.block.definitions) {
      assert.match(def.semanticTypeKey, /^SW\d/i);
      assert.ok(def.provenance.extractionMethod === "row-band-ocr");
      assert.ok(def.properties.length >= 1);
      for (const prop of def.properties) {
        assert.ok(prop.rawText.length > 0);
        assert.ok(prop.cellBbox);
      }
    }
  });

  it("extracts at least one Beckstead shear-wall row with framing properties", async () => {
    const seg = await extractSegments(PDF, 1);
    const result = await extractScheduleFromRowBands({
      pdfPath: PDF,
      pageNumber: 1,
      pageWidth: seg.pageWidth,
      pageHeight: seg.pageHeight,
    });

    assert.ok(result.block.definitions.length >= 1);
    const withProps = result.block.definitions.find((d) => d.properties.length >= 2);
    assert.ok(withProps, "expected at least one row with 2+ properties");
    assert.ok(
      withProps!.properties.some((p) =>
        p.propertyPath.includes("sheathingType"),
      ),
    );
  });
});
