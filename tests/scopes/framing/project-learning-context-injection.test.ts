import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import type { CompiledDrawingPage } from "../../../src/drawing-compiler/schemas/compiledDrawingPage.schema.js";
import type { ExtractionPageBundle } from "../../../src/plans/ExtractionPageBundle.js";
import type { GovernedProjectDictionary } from "../../../src/project-interpreter/schemas/projectDictionary.schema.js";
import { buildExtractionProjectContext } from "../../../src/scopes/framing/extraction/buildExtractionProjectContext.js";
import {
  KNOWN_DEFINITIONS_CAP,
  selectKnownDefinitionsForWorkUnit,
  shouldSkipDefinitionContext,
} from "../../../src/scopes/framing/extraction/selectKnownDefinitionsForWorkUnit.js";

const fixtureDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/project-learning",
);

const fixture = JSON.parse(
  readFileSync(path.join(fixtureDir, "t-r1-c2-sw-wb.json"), "utf8"),
) as {
  validatedDefinitions: Array<{
    semanticTypeKey: string;
    sourcePage: number;
    definitionKind: string;
    properties: Record<string, string>;
  }>;
  candidateKeys: string[];
};

function planBundle(intent: string): ExtractionPageBundle {
  return {
    bundleId: `test:${intent}`,
    scopeName: "framing",
    intent,
    orderedPageNumbers: [4, 1],
    members: [
      {
        pageNumber: 4,
        role: "primary",
        visualDetailLevel: "full-page-and-tiles",
        sheetId: null,
        label: null,
        reason: "framing-plan primary",
      },
      {
        pageNumber: 1,
        role: "global",
        visualDetailLevel: "full-page",
        sheetId: null,
        label: null,
        reason: "schedule global",
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

function schedulePrimaryBundle(): ExtractionPageBundle {
  return {
    bundleId: "test:schedule-only",
    scopeName: "framing",
    intent: "structural-members",
    orderedPageNumbers: [1],
    members: [
      {
        pageNumber: 1,
        role: "primary",
        visualDetailLevel: "full-page",
        sheetId: null,
        label: null,
        reason: "schedule sheet primary",
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

function dictionaryFromFixture(): GovernedProjectDictionary {
  const acceptedDefinitionKeys = fixture.validatedDefinitions.map(
    (d) => d.semanticTypeKey,
  );
  return {
    projectId: "beckstead-fixture",
    generatedAt: new Date().toISOString(),
    interpreterModel: "fixture",
    experimentBranch: "hybrid",
    observations: [],
    hypotheses: [],
    definitions: fixture.validatedDefinitions.map((d) => ({
      semanticTypeKey: d.semanticTypeKey,
      sourcePage: d.sourcePage,
      properties: Object.entries(d.properties).map(([propertyPath, rawText]) => ({
        propertyPath,
        rawText,
      })),
      status: "definition" as const,
      provenance: [
        {
          kind: "artifact" as const,
          toolCallId: "project-learning-fixture",
          pageNumber: d.sourcePage,
          artifactPath: `project-learning:${d.semanticTypeKey}`,
        },
      ],
    })),
    bindings: [],
    unresolved: [],
    contradictions: [],
    metrics: { toolCalls: 0, tokens: 0, durationMs: 0 },
    governance: {
      evaluatedAt: new Date().toISOString(),
      passRate: 1,
      acceptedHypothesisIds: [],
      rejectedHypothesisIds: [],
      acceptedBindingIds: [],
      rejectedBindingIds: [],
      acceptedDefinitionKeys,
      rejectedDefinitionKeys: [],
      validatorResults: [],
      greenOutcome: "GREEN",
      greenCriterion: "fixture",
    },
  };
}

function compiledPageWithKeys(
  pageNumber: number,
  keys: string[],
): CompiledDrawingPage {
  return {
    pageNumber,
    semanticMarkRecovery: {
      observations: keys.map((key, index) => ({
        observationId: `obs-${index}`,
        normalizedKey: key,
        rawText: key,
      })),
    },
    semanticBinding: { ownershipAssociations: [], bindings: [] },
    text: { primitives: [] },
  } as unknown as CompiledDrawingPage;
}

describe("project learning context injection", () => {
  it("includes SW+WB co-occurrence keys for wall-framing (t-r1-c2-like)", () => {
    const dictionary = dictionaryFromFixture();
    const known = selectKnownDefinitionsForWorkUnit({
      intent: "wall-framing",
      bundle: planBundle("wall-framing"),
      dictionary,
      compiledPages: [
        compiledPageWithKeys(4, fixture.candidateKeys),
      ],
      candidateKeysOverride: fixture.candidateKeys,
    });

    const keys = known.map((d) => d.semanticTypeKey).sort();
    assert.deepEqual(keys, ["SW2", "WB2-10DF", "WB3-10DF"].sort());
    assert.ok(known.every((d) => d.validationStatus === "validated"));
    assert.ok(known.some((d) => d.definitionKind === "shear-wall"));
    assert.ok(known.some((d) => d.definitionKind === "header"));
  });

  it("does not drop WB when intent is wall-framing or SW when floor-framing", () => {
    const dictionary = dictionaryFromFixture();
    for (const intent of ["wall-framing", "floor-framing"] as const) {
      const known = selectKnownDefinitionsForWorkUnit({
        intent,
        bundle: planBundle(intent),
        dictionary,
        compiledPages: [],
        candidateKeysOverride: fixture.candidateKeys,
      });
      assert.equal(known.length, 3, intent);
      assert.ok(known.some((d) => d.semanticTypeKey === "SW2"), intent);
      assert.ok(known.some((d) => d.semanticTypeKey.startsWith("WB")), intent);
    }
  });

  it("caps empty-key multi-family fallback at KNOWN_DEFINITIONS_CAP", () => {
    const dictionary = dictionaryFromFixture();
    const many = Array.from({ length: 30 }, (_, i) => ({
      semanticTypeKey: i % 2 === 0 ? `SW${i}` : `WB${i}-10DF`,
      sourcePage: 1,
      properties: [{ propertyPath: "x", rawText: "y" }],
      status: "definition" as const,
      provenance: [
        {
          kind: "artifact" as const,
          toolCallId: "project-learning-fixture",
          pageNumber: 1,
          artifactPath: `project-learning:bulk-${i}`,
        },
      ],
    }));
    const fat: GovernedProjectDictionary = {
      ...dictionary,
      definitions: many,
      governance: {
        ...dictionary.governance,
        acceptedDefinitionKeys: many.map((d) => d.semanticTypeKey),
      },
    };

    const known = selectKnownDefinitionsForWorkUnit({
      intent: "wall-framing",
      bundle: planBundle("wall-framing"),
      dictionary: fat,
      compiledPages: [compiledPageWithKeys(4, [])],
    });
    assert.ok(known.length <= KNOWN_DEFINITIONS_CAP);
    assert.equal(known.length, KNOWN_DEFINITIONS_CAP);
  });

  it("skips knownDefinitions for schedule-primary work units", () => {
    const dictionary = dictionaryFromFixture();
    const bundle = schedulePrimaryBundle();
    assert.equal(shouldSkipDefinitionContext({ bundle }), true);
    const known = selectKnownDefinitionsForWorkUnit({
      intent: "structural-members",
      bundle,
      dictionary,
      compiledPages: [],
      candidateKeysOverride: fixture.candidateKeys,
    });
    assert.deepEqual(known, []);
  });

  it("buildExtractionProjectContext wires knownDefinitions for wall-framing", () => {
    const context = buildExtractionProjectContext({
      intent: "wall-framing",
      bundle: planBundle("wall-framing"),
      dictionary: dictionaryFromFixture(),
      compiledPages: [],
      buildingAssemblies: { assemblyNames: [], notes: [] },
      candidateKeysOverride: fixture.candidateKeys,
    });
    assert.equal(context.knownDefinitions.length, 3);
    assert.equal(context.dictionaryBindings.length, 0);
    assert.equal(context.contextDisclaimer, "CONTEXT ONLY — not plan evidence");
  });

  it("never includes harvested-only keys without validated dictionary entries", () => {
    const dictionary = dictionaryFromFixture();
    const known = selectKnownDefinitionsForWorkUnit({
      intent: "wall-framing",
      bundle: planBundle("wall-framing"),
      dictionary,
      compiledPages: [],
      candidateKeysOverride: ["SW99", "WB99-NOPE"],
    });
    assert.deepEqual(known, []);
  });
});
