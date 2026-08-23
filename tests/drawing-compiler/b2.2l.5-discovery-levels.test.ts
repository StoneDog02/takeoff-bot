import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  evaluateDiscoveryLevels,
  mapLevelsToRecommendation,
} from "../../src/project-interpreter/evaluateDiscoveryLevels.js";
import {
  projectDictionarySchema,
  type ProjectDictionary,
} from "../../src/project-interpreter/schemas/projectDictionary.schema.js";
import type { GovernanceReport } from "../../src/project-interpreter/dictionaryGovernor.js";

function baseDict(partial: Partial<ProjectDictionary> = {}): ProjectDictionary {
  return projectDictionarySchema.parse({
    projectId: "test",
    generatedAt: new Date().toISOString(),
    interpreterModel: "test",
    experimentBranch: "hybrid",
    observations: [],
    hypotheses: [],
    definitions: [],
    bindings: [],
    unresolved: [],
    contradictions: [],
    metrics: { toolCalls: 0, tokens: 0, durationMs: 0 },
    ...partial,
  });
}

function mockGovernance(
  partial: Partial<GovernanceReport> = {},
): GovernanceReport {
  return {
    evaluatedAt: new Date().toISOString(),
    passRate: 1,
    acceptedHypothesisIds: [],
    rejectedHypothesisIds: [],
    acceptedBindingIds: [],
    rejectedBindingIds: [],
    validatorResults: [],
    greenOutcome: null,
    greenCriterion: null,
    dictionary: baseDict(),
    ...partial,
  };
}

describe("B2.2L.5 discovery level evaluation", () => {
  it("detects L2 discovery when live adds new hypothesis", () => {
    const seed = baseDict({
      hypotheses: [
        {
          id: "hyp-seed",
          status: "hypothesis",
          conventionClass: "heavy-linework",
          claim: "Seed claim only.",
          provenance: [{ kind: "compiler", pageNumber: 4, toolCallId: "t1" }],
        },
      ],
    });
    const live = baseDict({
      hypotheses: [
        ...seed.hypotheses,
        {
          id: "hyp-new",
          status: "hypothesis",
          conventionClass: "keyed-note",
          claim: 'Keyed note "SW_" indicates shear wall locations.',
          provenance: [
            { kind: "vision_region", pageNumber: 1, toolCallId: "toolu_1" },
          ],
        },
      ],
    });
    const levels = evaluateDiscoveryLevels({
      seedBaseline: seed,
      liveDictionary: live,
      governanceReport: mockGovernance({ dictionary: live }),
    });
    assert.equal(levels.level2Discovery, true);
    assert.equal(levels.newHypotheses.length, 1);
  });

  it("maps L3 governed discovery to recommendation A", () => {
    const levels = {
      level1Safe: true,
      level2Discovery: true,
      level3GovernedDiscovery: true,
      level1Notes: [],
      level2Notes: [],
      level3Notes: [],
      newObservations: [],
      newHypotheses: [],
      newDefinitions: [],
      newBindings: [],
      governorAcceptedNewIds: ["hyp-new"],
      governorRejectedNewIds: [],
      noDiscovery: false,
    };
    assert.equal(mapLevelsToRecommendation(levels, true), "A");
  });

  it("maps no discovery to NO_DISCOVERY", () => {
    const levels = evaluateDiscoveryLevels({
      seedBaseline: baseDict(),
      liveDictionary: baseDict(),
      governanceReport: mockGovernance(),
    });
    assert.equal(levels.noDiscovery, true);
    assert.equal(mapLevelsToRecommendation(levels, true), "NO_DISCOVERY");
  });
});
