import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Evidence } from "../../src/core/schemas/evidence.schema.js";
import { collectKnownSubjects } from "../../src/framing/extract/runFramingExtractionPasses.js";
import { buildExtractionProjectContext } from "../../src/framing/extract/buildExtractionProjectContext.js";
import type { ExtractionPageBundle } from "../../src/pdf/ExtractionPageBundle.js";

function memberEvidence(subjectKey: string): Evidence {
  return {
    id: `E-${subjectKey}-SIZE`,
    type: "note",
    relationship: "supports",
    description: "size",
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
      tileId: null,
      elementLabel: null,
      detailNumber: null,
      sectionNumber: null,
      scheduleName: null,
      noteReference: null,
    },
    originalText: `${subjectKey} (2)-1.75"x11.875"`,
    references: [],
    subjectKind: "structural-member",
    subjectKey,
    propertyPath: "size",
    candidateValue: '(2)-1.75"x11.875"',
    extractionPassId: "pass:1",
    bundleId: "bundle:1",
  };
}

function regionBundle(): ExtractionPageBundle {
  return {
    bundleId: "test:region-2",
    scopeName: "framing",
    intent: "wall-framing",
    regionId: "region:sheet:p4",
    identifiedSystems: ["wall-framing"],
    requiredInputs: ["lengthFeet"],
    orderedPageNumbers: [4],
    members: [
      {
        pageNumber: 4,
        role: "primary",
        visualDetailLevel: "full-page",
        sheetId: "S2.3",
        label: "Main floor",
        reason: "main floor",
      },
    ],
    routingNotes: [],
    imageBudget: {
      maxImages: 4,
      estimatedImages: 1,
      tilesPerDetailedPage: 0,
    },
  };
}

describe("progressive identity across region reads", () => {
  it("injects pass-1 subjectKeys into the next region context", () => {
    const knownSubjects = collectKnownSubjects([memberEvidence("WB2")]);
    assert.equal(knownSubjects[0]?.subjectKey, "WB2");

    const context = buildExtractionProjectContext({
      intent: "wall-framing",
      bundle: regionBundle(),
      dictionary: null,
      compiledPages: [],
      buildingAssemblies: { assemblyNames: [], notes: [] },
      knownSubjects,
    });
    assert.equal(context.knownSubjects.length, 1);
    assert.equal(context.knownSubjects[0]?.subjectKey, "WB2");
  });
});
