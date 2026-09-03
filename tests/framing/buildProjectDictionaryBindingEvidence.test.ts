import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BINDING_AUTHORITY_GRADE_PROPERTY_PATH,
  SEMANTIC_TYPE_KEY_PROPERTY_PATH,
} from "../../src/framing/geometry/semanticBindingConstants.js";
import {
  assignProjectDictionaryBindingEvidence,
  buildProjectDictionaryBindingEvidence,
  PROJECT_DICTIONARY_BINDING_BUNDLE_ID,
  PROJECT_DICTIONARY_BINDING_PASS_ID,
} from "../../src/framing/geometry/buildProjectDictionaryBindingEvidence.js";
import type { GovernedProjectDictionary } from "../../src/project-reading/schemas/projectDictionary.schema.js";

function minimalDictionary(
  bindings: GovernedProjectDictionary["bindings"],
): GovernedProjectDictionary {
  return {
    projectId: "test",
    generatedAt: new Date().toISOString(),
    interpreterModel: "test",
    experimentBranch: "compiler_heavy",
    observations: [],
    hypotheses: [],
    definitions: [],
    bindings,
    unresolved: [],
    contradictions: [],
    metrics: {
      toolCalls: 0,
      tokens: 0,
      durationMs: 0,
    },
    governance: {
      evaluatedAt: new Date().toISOString(),
      passRate: 1,
      acceptedHypothesisIds: [],
      rejectedHypothesisIds: [],
      acceptedBindingIds: [],
      rejectedBindingIds: [],
      validatorResults: [],
      greenOutcome: "GREEN",
      greenCriterion: "test",
    },
  };
}

describe("buildProjectDictionaryBindingEvidence", () => {
  it("emits class binding on wallType and isShearOrBraced, not semanticTypeKey", () => {
    const records = assignProjectDictionaryBindingEvidence({
      physicalRunKey: "physical-run:p4:74b4eaebc40a",
      referenceKey: "shear-wall",
      status: "established_binding",
      mechanism: "graphic-convention",
      provenance: [
        {
          kind: "compiler",
          pageNumber: 4,
          toolCallId: "orientation-line-style-audit",
        },
      ],
    });

    assert.equal(records.length, 2);
    const paths = records.map((r) => r.propertyPath);
    assert.ok(paths.includes("wallType"));
    assert.ok(paths.includes("isShearOrBraced"));
    assert.ok(!paths.includes(SEMANTIC_TYPE_KEY_PROPERTY_PATH));

    const wallType = records.find((r) => r.propertyPath === "wallType");
    assert.equal(wallType?.candidateValue, "shear-wall");
    assert.equal(wallType?.extractionPassId, PROJECT_DICTIONARY_BINDING_PASS_ID);
    assert.equal(wallType?.bundleId, PROJECT_DICTIONARY_BINDING_BUNDLE_ID);
  });

  it("emits subtype binding on semanticTypeKey for SW* reference keys", () => {
    const records = assignProjectDictionaryBindingEvidence({
      physicalRunKey: "physical-run:p4:test",
      referenceKey: "SW2",
      status: "established_binding",
      mechanism: "graphic-convention",
      provenance: [
        {
          kind: "compiler",
          pageNumber: 4,
          toolCallId: "test",
        },
      ],
    });

    assert.equal(records.length, 2);
    const typeRecord = records.find(
      (r) => r.propertyPath === SEMANTIC_TYPE_KEY_PROPERTY_PATH,
    );
    assert.equal(typeRecord?.candidateValue, "SW2");
    const grade = records.find(
      (r) => r.propertyPath === BINDING_AUTHORITY_GRADE_PROPERTY_PATH,
    );
    assert.equal(grade?.candidateValue, "B");
  });

  it("does not emit rejected or unresolved bindings", () => {
    const dictionary = minimalDictionary([
      {
        physicalRunKey: "physical-run:p4:rejected",
        referenceKey: "shear-wall",
        status: "rejected",
        mechanism: "graphic-convention",
        provenance: [{ kind: "compiler", pageNumber: 4, toolCallId: "t" }],
      },
      {
        physicalRunKey: "physical-run:p4:hyp",
        referenceKey: "shear-wall",
        status: "hypothesis",
        mechanism: "graphic-convention",
        provenance: [{ kind: "compiler", pageNumber: 4, toolCallId: "t" }],
      },
    ]);

    assert.equal(buildProjectDictionaryBindingEvidence(dictionary).length, 0);
  });
});
