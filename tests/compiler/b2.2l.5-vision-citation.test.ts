import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DictionaryGovernor } from "../../src/project-reading/dictionaryGovernor.js";
import type { CompilerInvestigationFacade } from "../../src/project-reading/compilerInvestigationFacade.js";

function mockFacadeWithVisionOcr(
  ocrByToolCallId: Record<string, string>,
): CompilerInvestigationFacade {
  return {
    searchProjectText: () => [],
    findTextPattern: () => [],
    getRegionOcrEntry: (id: string) => {
      const ocrText = ocrByToolCallId[id];
      if (!ocrText) return null;
      return {
        toolCallId: id,
        pageNumber: 1,
        bbox: { x0: 0, y0: 0, x1: 100, y1: 100 },
        imagePath: "/tmp/r.png",
        ocrText,
      };
    },
    getPhysicalRun: async () => null,
  } as unknown as CompilerInvestigationFacade;
}

describe("B2.2L.5 vision citation governance", () => {
  it("verifyVisionRegionCitation passes when quote matches region OCR", () => {
    const facade = mockFacadeWithVisionOcr({
      "toolu_legend1": "8. SW_ INDICATES SHEARWALL. SEE SCHEDULE.",
    });
    const governor = new DictionaryGovernor(facade);
    const result = governor.verifyVisionRegionCitation(
      "hyp-legend",
      'Keyed note states "SW_ INDICATES SHEARWALL" on sheet S1.1.',
      [
        {
          kind: "vision_region",
          pageNumber: 1,
          toolCallId: "toolu_legend1",
        },
      ],
    );
    assert.equal(result.passed, true);
  });

  it("verifyVisionRegionCitation fails when quote absent from region OCR", () => {
    const facade = mockFacadeWithVisionOcr({
      "toolu_legend1": "GENERAL NOTES ONLY",
    });
    const governor = new DictionaryGovernor(facade);
    const result = governor.verifyVisionRegionCitation(
      "hyp-bad",
      'Legend says "ALL EXTERIOR WALLS ARE SW1".',
      [
        {
          kind: "vision_region",
          pageNumber: 1,
          toolCallId: "toolu_legend1",
        },
      ],
    );
    assert.equal(result.passed, false);
  });

  it("verifyTextCitation falls back to vision OCR cache", async () => {
    const facade = mockFacadeWithVisionOcr({
      "toolu_note": "SW_ INDICATES SHEARWALL",
    });
    const governor = new DictionaryGovernor(facade);
    const result = await governor.verifyTextCitation(
      "hyp-1",
      'Note text includes "SW_ INDICATES" per general notes.',
      [
        {
          kind: "vision_region",
          pageNumber: 1,
          toolCallId: "toolu_note",
        },
      ],
    );
    assert.equal(result.passed, true);
  });
});
