import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildFailureTaxonomy,
  pickTopBlocker,
} from "../../src/scopes/framing/audit/buildFailureTaxonomy.js";
import type { AutomationCoverage } from "../../src/scopes/framing/audit/auditMetrics.schema.js";
import type { SemanticsSummary } from "../../src/scopes/framing/audit/auditMetrics.schema.js";
import {
  buildBlockerComparison,
  buildCounterfactualUnlocks,
} from "../../src/scopes/framing/audit/materialUnlockAnalysis.js";

describe("B2.2M.2 dependency-aware blocker ranking", () => {
  const automation: AutomationCoverage = {
    denominatorExplanation: "test",
    segmentsWithLength: 5,
    segmentsWithFullWallAssemblyForStuds: 0,
    segmentsCalculableStuds: 0,
    segmentsCalculablePlates: 0,
    materialCategoriesPresent: [],
    materialCategoriesAbsent: ["lumber"],
  };

  const semantics: SemanticsSummary = {
    evidenceByPassId: {
      "b2.2l.3-definition": 4,
      "project-orientation-binding": 2,
    },
    scheduleDefinitionsOnCompile: 1,
    projectDictionaryBindings: 1,
    semanticBindingsEmit: 0,
    dereferenceEmit: 0,
    wallsWithSemanticTypeKey: 0,
    groundTruthChecks: [],
  };

  const artifacts = {
    compiledPages: { pages: [{ pageNumber: 1 }] },
    evidence: [],
    wallFraming: { walls: [], segments: [] },
    openings: { openings: [] },
    structuralMembers: null,
    floorFraming: { systems: [], areas: [] },
    roofFraming: null,
    sheathing: null,
    projectDictionary: null,
    validation: null,
    calculations: null,
    takeoff: null,
  } as never;

  it("ranks stud/plate CALCULATION_BLOCKED above openings when length exists", () => {
    const taxonomy = buildFailureTaxonomy("A", artifacts, automation, semantics);
    const top = pickTopBlocker(taxonomy, automation);
    assert.ok(top);
    assert.equal(top.rankingMethod, "dependency_aware_v1");
    assert.match(top.summary, /Stud and plate/i);
    assert.equal(top.failureClass, "CALCULATION_BLOCKED");
  });

  it("counterfactual shows openings alone unlock zero lumber", () => {
    const scenarios = buildCounterfactualUnlocks();
    const openings = scenarios.find((s) => s.id === "openings_perfect");
    const assembly = scenarios.find((s) => s.id === "wall_assembly_basics_perfect");
    assert.equal(openings?.aloneProducesCustomerQuantity, false);
    assert.equal(assembly?.aloneProducesCustomerQuantity, true);
    assert.equal(assembly?.segmentsCalculableStuds, 5);
  });

  it("blocker comparison recommends wall assembly", () => {
    const rows = buildBlockerComparison();
    const winner = rows.find((r) => r.recommendation === "pursue");
    assert.equal(winner?.candidateId, "wall_assembly_basics");
  });
});
