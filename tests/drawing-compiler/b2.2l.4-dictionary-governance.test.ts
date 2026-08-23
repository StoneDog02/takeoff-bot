import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  projectDictionarySchema,
  type ProjectDictionary,
} from "../../src/project-interpreter/schemas/projectDictionary.schema.js";
import { DictionaryGovernor } from "../../src/project-interpreter/dictionaryGovernor.js";
import type { CompilerInvestigationFacade } from "../../src/project-interpreter/compilerInvestigationFacade.js";

function mockFacade(overrides?: {
  searchHits?: Array<{ pageNumber: number; text: string }>;
  runExists?: boolean;
  patternHits?: Array<{ pageNumber: number; text: string }>;
}): CompilerInvestigationFacade {
  return {
    searchProjectText: () => overrides?.searchHits ?? [],
    findTextPattern: () => overrides?.patternHits ?? [],
    getPhysicalRun: async () =>
      overrides?.runExists === false
        ? null
        : {
            physicalRunKey: "physical-run:p4:test",
            pageNumber: 4,
            orientation: "H",
            wallAuthority: "high",
            centerline: { x1: 0, y1: 0, x2: 100, y2: 0 },
            lengthPt: 100,
            thicknessPt: 6,
          },
  } as unknown as CompilerInvestigationFacade;
}

function baseDictionary(
  partial: Partial<ProjectDictionary> = {},
): ProjectDictionary {
  return projectDictionarySchema.parse({
    projectId: "test-project",
    generatedAt: new Date().toISOString(),
    interpreterModel: "test",
    experimentBranch: "compiler_heavy",
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

describe("B2.2L.4 dictionary governance (synthetic)", () => {
  it("accepts fail-closed unresolved for SW subtype (GREEN criterion C)", async () => {
    const facade = mockFacade();
    const governor = new DictionaryGovernor(facade);
    const dict = baseDictionary({
      unresolved: [
        {
          id: "unresolved-sw",
          question: "Which runs bind to SW subtypes?",
          reason: "No SW* tags on plan; GRAPHIC_CONVENTION only.",
        },
      ],
      hypotheses: [
        {
          id: "hyp-1",
          status: "hypothesis",
          conventionClass: "heavy-linework",
          claim: "Heavy lines may indicate shear class; subtype unknown.",
          provenance: [
            { kind: "compiler", pageNumber: 4, toolCallId: "t1" },
          ],
        },
      ],
    });

    const report = await governor.govern(dict);
    assert.equal(report.greenOutcome, "GREEN");
    assert.match(String(report.greenCriterion), /subtype|unresolved/i);
  });

  it("rejects graphic rule inferred from schedule-only provenance", async () => {
    const facade = mockFacade();
    const governor = new DictionaryGovernor(facade);
    const dict = baseDictionary({
      hypotheses: [
        {
          id: "hyp-bad",
          status: "established_rule",
          conventionClass: "heavy-linework",
          claim: 'Heavy line means shear wall per "SW1" schedule row.',
          provenance: [
            {
              kind: "artifact",
              artifactPath: "artifacts/schedule-definitions.json",
              pageNumber: 1,
              toolCallId: "t1",
            },
          ],
        },
      ],
    });

    const report = await governor.govern(dict);
    const graphicFail = report.validatorResults.find(
      (r) => r.validator === "verifyGraphicRule" && !r.passed,
    );
    assert.ok(graphicFail);
    assert.ok(report.rejectedHypothesisIds.includes("hyp-bad"));
  });

  it("rejects established_binding SW1 without plan-side text", async () => {
    const facade = mockFacade({ patternHits: [{ pageNumber: 1, text: "SW1" }] });
    const governor = new DictionaryGovernor(facade);
    const dict = baseDictionary({
      bindings: [
        {
          physicalRunKey: "physical-run:p4:wall-1",
          referenceKey: "SW1",
          status: "established_binding",
          mechanism: "TAG",
          provenance: [
            { kind: "compiler", pageNumber: 4, toolCallId: "t1" },
          ],
        },
      ],
    });

    const report = await governor.govern(dict);
    assert.ok(
      report.validatorResults.some(
        (r) => r.validator === "verifySubtypeBinding" && !r.passed,
      ),
    );
    assert.equal(report.greenOutcome, "FAILURE");
  });

  it("verifyTextCitation fails hallucinated quoted legend text", async () => {
    const facade = mockFacade({ searchHits: [] });
    const governor = new DictionaryGovernor(facade);
    const result = await governor.verifyTextCitation(
      "hyp-hallucination",
      'Legend states "ALL EXTERIOR WALLS ARE SW1" on sheet S2.3.',
    );
    assert.equal(result.passed, false);
  });

  it("verifyProvenanceExists requires toolCallId", () => {
    const facade = mockFacade();
    const governor = new DictionaryGovernor(facade);
    const result = governor.verifyProvenanceExists("claim-1", []);
    assert.equal(result.passed, false);
  });

  it("verifyRunOwnership requires PBG run to exist", async () => {
    const facade = mockFacade({ runExists: false });
    const governor = new DictionaryGovernor(facade);
    const dict = baseDictionary({
      bindings: [
        {
          physicalRunKey: "physical-run:p4:missing",
          referenceKey: null,
          status: "hypothesis",
          mechanism: "GRAPHIC_CONVENTION",
          provenance: [
            { kind: "compiler", pageNumber: 4, toolCallId: "t1" },
          ],
        },
      ],
    });
    const report = await governor.govern(dict);
    assert.ok(
      report.validatorResults.some(
        (r) => r.validator === "verifyRunOwnership" && !r.passed,
      ),
    );
  });
});
