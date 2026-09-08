import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Evidence } from "../../src/core/schemas/evidence.schema.js";
import type { PlanIndex } from "../../src/pdf/PlanIndex.js";
import type { GovernedProjectDictionary } from "../../src/project-reading/schemas/projectDictionary.schema.js";
import { drainPlanReferenceFollowUps } from "../../src/framing/extract/drainPlanReferenceFollowUps.js";

function planIndex(): PlanIndex {
  return {
    pdfPath: "/tmp/synthetic.pdf",
    totalPages: 4,
    indexedAt: "2026-01-01T00:00:00.000Z",
    sourceContentHash: "c".repeat(64),
    pages: [1, 2, 3, 4].map((pageNumber) => ({
      pageNumber,
      sheetId: String(pageNumber),
      label: `L${pageNumber}`,
      textContent: "",
    })),
  };
}

function evidenceWithReference(): Evidence {
  return {
    id: "E-REF-1",
    type: "note",
    relationship: "supports",
    description: "see detail",
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
    originalText: "SEE DETAIL 5/S5.2",
    references: [],
    subjectKind: "wall",
    subjectKey: "SW5",
    propertyPath: "detailReference",
    candidateValue: "5/S5.2",
    extractionPassId: "pass:primary",
    bundleId: "bundle:primary",
  };
}

describe("drainPlanReferenceFollowUps (D2)", () => {
  it("inventories references without follow-up passes when queue is drained by coverage", async () => {
    const result = await drainPlanReferenceFollowUps({
      planIndex: planIndex(),
      pages: [],
      primaryEvidence: [evidenceWithReference()],
      alreadyCoveredPageNumbers: new Set([1, 2]),
      scopeName: "framing",
      pageClassification: { pages: [] },
      planReadingOrder: { orderedPageNumbers: [1, 2, 3, 4] },
      buildingAssemblies: { assemblyNames: [], notes: [] },
    });

    assert.ok(result.trace.inventoryReferenceCount >= 1);
    assert.equal(result.passes.length, 0);
    assert.ok(result.trace.followUp.queueDrained);
  });

  it("skips Claude follow-up when the referenced mark is already in the Plan Dictionary", async () => {
    const dict: GovernedProjectDictionary = {
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

    let apiCalls = 0;
    const result = await drainPlanReferenceFollowUps({
      planIndex: {
        ...planIndex(),
        pages: planIndex().pages.map((page) =>
          page.pageNumber === 4
            ? { ...page, sheetId: "S5.2", label: "S5.2" }
            : page,
        ),
      },
      pages: [
        {
          pageNumber: 4,
          sheetId: "S5.2",
          label: "S5.2",
          pageKind: "detail",
          scopeHints: ["floor", "framing"],
          contentRoles: ["detail"],
          discipline: "structural",
          pageType: "detail",
          relevantToFraming: true,
          needsVisualClassification: false,
          classificationMethod: "text",
          titleOrLabel: "S5.2",
          evidenceText: "S5.2",
          classificationReason: "fixture",
          confidenceLabel: "high",
        },
      ],
      primaryEvidence: [
        {
          ...evidenceWithReference(),
          subjectKey: "WB2-11.88LVL",
          originalText: "SEE DETAIL 5/S5.2 WB2-11.88LVL",
        },
      ],
      alreadyCoveredPageNumbers: new Set(),
      scopeName: "framing",
      pageClassification: { pages: [] },
      planReadingOrder: { orderedPageNumbers: [1, 2, 3, 4] },
      buildingAssemblies: { assemblyNames: [], notes: [] },
      projectDictionary: dict,
      onApiCall: () => {
        apiCalls += 1;
      },
    });

    assert.equal(apiCalls, 0);
    assert.equal(result.passes.length, 0);
    assert.ok(
      result.trace.queue.items.some((item) =>
        (item.statusReason ?? "").includes("Plan Dictionary lookup"),
      ),
    );
  });
});
