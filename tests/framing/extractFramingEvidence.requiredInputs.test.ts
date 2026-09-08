import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ExtractionPageBundle } from "../../src/pdf/ExtractionPageBundle.js";
import { buildExtractionProjectContext } from "../../src/framing/extract/buildExtractionProjectContext.js";
import {
  buildExtractionPreamble,
  buildSystemPrompt,
} from "../../src/framing/prompts/extractFramingEvidence.js";

function regionBundle(): ExtractionPageBundle {
  return {
    bundleId: "bundle:framing:floor-framing:p3-1",
    scopeName: "framing",
    intent: "floor-framing",
    regionId: "region:sheet:p3",
    identifiedSystems: [
      "floor-framing",
      "wall-framing",
      "openings",
      "structural-members",
    ],
    requiredInputs: [
      "quantity",
      "dimensions.roughWidthFeet",
      "dimensions.roughHeightFeet",
      "parentWallTag",
      "size",
      "lengthFeet",
    ],
    orderedPageNumbers: [3],
    members: [
      {
        pageNumber: 3,
        role: "primary",
        visualDetailLevel: "full-page",
        sheetId: "S2.2",
        label: "Crawl",
        reason: "crawl primary",
      },
    ],
    routingNotes: [
      "Construction region: whole framing sheet page 3 (one primary, not 6-intent fan-out).",
    ],
    imageBudget: {
      maxImages: 4,
      estimatedImages: 1,
      tilesPerDetailedPage: 0,
    },
  };
}

describe("extractFramingEvidence required-input contract", () => {
  it("tells region reads to emit two labeled openings as two subjectKeys", () => {
    const bundle = regionBundle();
    const context = buildExtractionProjectContext({
      intent: "floor-framing",
      bundle,
      dictionary: null,
      compiledPages: [],
      buildingAssemblies: { assemblyNames: [], notes: [] },
    });
    const preamble = buildExtractionPreamble(
      { assemblyNames: [], notes: [] },
      bundle,
      context,
    );
    const system = buildSystemPrompt("");

    assert.match(preamble, /Identified systems on this sheet/);
    assert.match(preamble, /openings/);
    assert.match(preamble, /structural-members/);
    assert.match(preamble, /Two labeled openings → two subjectKeys/);
    assert.match(preamble, /parentWallTag/);
    assert.match(system, /two labeled openings → two subjectKeys/);
    assert.match(system, /routing intent sequences the pass/);
  });

  it("documents required-input follow-up as completeness-only, not identity restubs", () => {
    const bundle = regionBundle();
    const context = buildExtractionProjectContext({
      intent: "floor-framing",
      bundle,
      dictionary: null,
      compiledPages: [],
      buildingAssemblies: { assemblyNames: [], notes: [] },
      requiredInputFollowUp: {
        systems: ["openings", "structural-members"],
        missingPropertyPaths: ["parentWallTag", "quantity", "size"],
      },
    });
    const preamble = buildExtractionPreamble(
      { assemblyNames: [], notes: [] },
      bundle,
      context,
    );
    const system = buildSystemPrompt("");
    assert.match(preamble, /required-input follow-up on the SAME sheet\/bundle/);
    assert.match(preamble, /Completeness-only/);
    assert.match(preamble, /reuse knownSubjects subjectKeys/i);
    assert.match(preamble, /Do not re-emit category or openingType/);
    assert.match(preamble, /Omit unprinted completeness paths/);
    assert.doesNotMatch(preamble, /Search again for printed opening marks/);
    assert.doesNotMatch(
      preamble,
      /Emit one opening subjectKey per distinct labeled mark/,
    );
    assert.doesNotMatch(
      preamble,
      /When printed, emit category, size, and lengthFeet/,
    );
    assert.match(system, /requiredInputFollowUp/);
    assert.match(system, /do not\s+re-emit category or openingType/);
  });
});
