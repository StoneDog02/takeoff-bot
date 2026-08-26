import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ExtractionPageBundle } from "../../../src/plans/ExtractionPageBundle.js";
import {
  auditExtractionProjectContext,
  buildExtractionProjectContext,
  hashExtractionProjectContext,
} from "../../../src/scopes/framing/extraction/buildExtractionProjectContext.js";

function bundleForIntent(intent: string): ExtractionPageBundle {
  return {
    bundleId: `test:${intent}`,
    scopeName: "framing",
    intent,
    orderedPageNumbers: [3, 1, 4],
    members: [
      {
        pageNumber: 3,
        role: "primary",
        visualDetailLevel: "full-page-and-tiles",
        sheetId: null,
        label: null,
        reason: "test",
      },
      {
        pageNumber: 1,
        role: "global",
        visualDetailLevel: "full-page",
        sheetId: null,
        label: null,
        reason: "test",
      },
    ],
    routingNotes: [],
    imageBudget: {
      maxImages: 20,
      estimatedImages: 5,
      tilesPerDetailedPage: 4,
    },
  };
}

describe("buildExtractionProjectContext", () => {
  it("returns empty context slice for wall-framing intent", () => {
    const context = buildExtractionProjectContext({
      intent: "wall-framing",
      bundle: bundleForIntent("wall-framing"),
      dictionary: null,
      compiledPages: [],
      buildingAssemblies: { assemblyNames: ["Exterior Wood Stud Wall"], notes: [] },
    });

    assert.equal(context.intent, "wall-framing");
    assert.deepEqual(context.knownSystemTags, []);
    assert.deepEqual(context.knownAreaTags, []);
    assert.deepEqual(context.dictionaryBindings, []);
    assert.deepEqual(context.crossPageNotes, []);
    assert.equal(context.contextDisclaimer, "CONTEXT ONLY — not plan evidence");
  });

  it("includes floor dictionary tags for floor-framing intent", () => {
    const context = buildExtractionProjectContext({
      intent: "floor-framing",
      bundle: bundleForIntent("floor-framing"),
      dictionary: {
        projectId: "test",
        generatedAt: new Date().toISOString(),
        interpreterModel: "test",
        experimentBranch: "hybrid",
        observations: [
          {
            id: "obs-1",
            claim: "FFS-MAIN-FLOOR-SYSTEM on sheet 4",
            provenance: [{ kind: "artifact", toolCallId: "t1", pageNumber: 4 }],
          },
        ],
        hypotheses: [],
        definitions: [],
        bindings: [],
        unresolved: [],
        contradictions: [],
        metrics: { toolCalls: 0, tokens: 0, durationMs: 0 },
      },
      compiledPages: [],
      buildingAssemblies: { assemblyNames: [], notes: [] },
    });

    assert.ok(context.knownSystemTags.includes("FFS-MAIN-FLOOR-SYSTEM"));
    const audit = auditExtractionProjectContext(context);
    assert.equal(audit.contextSliceHash, hashExtractionProjectContext(context));
  });

  it("excludes wall SW bindings from sheathing context", () => {
    const context = buildExtractionProjectContext({
      intent: "sheathing",
      bundle: bundleForIntent("sheathing"),
      dictionary: {
        projectId: "test",
        generatedAt: new Date().toISOString(),
        interpreterModel: "test",
        experimentBranch: "hybrid",
        observations: [],
        hypotheses: [],
        definitions: [],
        bindings: [
          {
            physicalRunKey: "WS-001",
            referenceKey: "SW4",
            status: "established_binding",
            mechanism: "graphic-convention",
            provenance: [{ kind: "artifact", toolCallId: "t1", pageNumber: 1 }],
          },
        ],
        unresolved: [],
        contradictions: [],
        metrics: { toolCalls: 0, tokens: 0, durationMs: 0 },
      },
      compiledPages: [],
      buildingAssemblies: { assemblyNames: [], notes: [] },
    });

    assert.equal(context.dictionaryBindings.length, 0);
  });
});
