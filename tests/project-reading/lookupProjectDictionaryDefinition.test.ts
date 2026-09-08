import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  lookupProjectDictionaryDefinition,
  lookupProjectDictionaryDefinitionFromTexts,
} from "../../src/project-reading/lookupProjectDictionaryDefinition.js";
import type { GovernedProjectDictionary } from "../../src/project-reading/schemas/projectDictionary.schema.js";

function dictionary(): GovernedProjectDictionary {
  return {
    projectId: "test",
    generatedAt: "2026-01-01T00:00:00.000Z",
    interpreterModel: "test",
    experimentBranch: "hybrid",
    observations: [],
    hypotheses: [],
    definitions: [
      {
        semanticTypeKey: "WB2-11.88LVL",
        sourcePage: 1,
        properties: [{ propertyPath: "size", rawText: '(2)-1.75"x11.875"' }],
        status: "definition",
        provenance: [{ kind: "compiler", toolCallId: "t1" }],
      },
    ],
    bindings: [],
    unresolved: [],
    contradictions: [],
    metrics: { toolCalls: 0, tokens: 0, durationMs: 0 },
    governance: {
      evaluatedAt: "2026-01-01T00:00:00.000Z",
      passRate: 1,
      acceptedHypothesisIds: [],
      rejectedHypothesisIds: [],
      acceptedBindingIds: [],
      rejectedBindingIds: [],
      acceptedDefinitionKeys: ["WB2-11.88LVL"],
      rejectedDefinitionKeys: [],
      validatorResults: [],
      greenOutcome: "GREEN",
      greenCriterion: "test",
    },
  };
}

describe("lookupProjectDictionaryDefinition", () => {
  it("finds a validated WB2 mark", () => {
    const hit = lookupProjectDictionaryDefinition(dictionary(), "WB2-11.88LVL");
    assert.equal(hit?.properties[0]?.rawText, '(2)-1.75"x11.875"');
  });

  it("returns null for unknown marks", () => {
    assert.equal(lookupProjectDictionaryDefinition(dictionary(), "WB99"), null);
  });

  it("extracts a mark token from follow-up text", () => {
    const hit = lookupProjectDictionaryDefinitionFromTexts(dictionary(), [
      "SEE SCHEDULE MARK WB2-11.88LVL AT HEADER",
    ]);
    assert.equal(hit?.semanticTypeKey, "WB2-11.88LVL");
  });
});
