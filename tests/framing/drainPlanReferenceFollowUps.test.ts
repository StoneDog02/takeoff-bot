import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Evidence } from "../../src/core/schemas/evidence.schema.js";
import type { PlanIndex } from "../../src/pdf/PlanIndex.js";
import type { GovernedProjectDictionary } from "../../src/project-reading/schemas/projectDictionary.schema.js";
import {
  drainPlanReferenceFollowUps,
  type ExtractEvidenceFn,
} from "../../src/framing/extract/drainPlanReferenceFollowUps.js";

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

function evidenceWithDetailReference(): Evidence {
  return {
    id: "E-REF-1",
    type: "note",
    relationship: "supports",
    description: "see detail",
    source: {
      page: {
        documentId: null,
        pageNumber: 1,
        sheetId: "S1",
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

function dictionaryWithDefinition(semanticTypeKey: string): GovernedProjectDictionary {
  return {
    projectId: "test",
    generatedAt: "2026-01-01T00:00:00.000Z",
    interpreterModel: "test",
    experimentBranch: "hybrid",
    observations: [],
    hypotheses: [],
    definitions: [
      {
        semanticTypeKey,
        sourcePage: 2,
        properties: [{ propertyPath: "size", rawText: "test-size" }],
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
      acceptedDefinitionKeys: [semanticTypeKey],
      rejectedDefinitionKeys: [],
      validatorResults: [],
      greenOutcome: "GREEN",
      greenCriterion: "test",
    },
  };
}

function mockExtractEvidence(): ExtractEvidenceFn {
  return async () => ({ evidence: [] });
}

describe("drainPlanReferenceFollowUps (D2)", () => {
  it("inventories references without follow-up passes when queue is drained by coverage", async () => {
    const result = await drainPlanReferenceFollowUps({
      planIndex: planIndex(),
      pages: [],
      primaryEvidence: [evidenceWithDetailReference()],
      alreadyCoveredPageNumbers: new Set([1, 2]),
      scopeName: "framing",
      pageClassification: { pages: [] },
      planReadingOrder: { orderedPageNumbers: [1, 2, 3, 4] },
      buildingAssemblies: { assemblyNames: [], notes: [] },
    });

    assert.ok(result.trace.inventoryReferenceCount >= 1);
    assert.equal(result.passes.length, 0);
    assert.ok(result.trace.followUp.queueDrained);
    assert.ok(result.boundDesignIdentities);
  });

  /**
   * S2-XB-1: Dictionary hit does NOT skip Claude follow-up.
   *
   * Per V1 spec §13.4 + locked amendment:
   * - Dictionary is context, not hop completion.
   * - Must NOT skip detail/plan hops on dictionary hit.
   */
  it("S2-XB-1: dictionary hit does NOT skip Claude follow-up (dictionary is context, not hop completion)", async () => {
    const dict = dictionaryWithDefinition("WB2-11.88LVL");

    const sheetOnlyEvidence: Evidence = {
      id: "E-REF-SHEET",
      type: "schedule",
      relationship: "supports",
      description: "beam schedule reference",
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
      originalText: "WB2-11.88LVL SEE SHEET S5.2",
      references: [],
      subjectKind: "structural-member",
      subjectKey: "WB2-11.88LVL",
      propertyPath: "sheetReference",
      candidateValue: "S5.2",
      extractionPassId: "pass:primary",
      bundleId: "bundle:primary",
    };

    const result = await drainPlanReferenceFollowUps({
      planIndex: {
        ...planIndex(),
        pages: planIndex().pages.map((page) =>
          page.pageNumber === 4
            ? { ...page, sheetId: "S5.2", label: "S5.2" }
            : page,
        ),
      },
      pages: [],
      primaryEvidence: [sheetOnlyEvidence],
      alreadyCoveredPageNumbers: new Set([1, 2, 3, 4]),
      scopeName: "framing",
      pageClassification: { pages: [] },
      planReadingOrder: { orderedPageNumbers: [1, 2, 3, 4] },
      buildingAssemblies: { assemblyNames: [], notes: [] },
      projectDictionary: dict,
    });

    // S2-XB-1: Dictionary hit should NOT have marked as "processed" and skipped.
    const queueItems = result.trace.queue.items;
    const dictionarySkipItem = queueItems.find((item) =>
      (item.statusReason ?? "").includes("skipped Claude follow-up"),
    );
    assert.equal(
      dictionarySkipItem,
      undefined,
      "Dictionary hit must NOT skip Claude follow-up (dictionary is context, not hop completion)",
    );

    const dictionaryResolvedItem = queueItems.find((item) =>
      (item.statusReason ?? "").includes("Resolved from Plan Dictionary lookup"),
    );
    assert.equal(
      dictionaryResolvedItem,
      undefined,
      "Dictionary lookup must NOT mark reference as resolved/processed",
    );
  });

  /**
   * S2-XB-1: Complete-case AC - all three source kinds inspectable as one bound design.
   *
   * Per V1 spec §13.4: Cross-sheet evidence example:
   *   B4 plan location + B4 beam schedule + B4 structural detail = one bound project structural design
   *
   * This test uses a mock extractor to simulate successful extraction without Claude.
   */
  it("S2-XB-1: complete-case - planMark + definition + detail all established, isComplete === true", async () => {
    // Evidence with a detail reference that will resolve to a specific page/detail
    const evidence: Evidence = {
      id: "E-REF-COMPLETE",
      type: "note",
      relationship: "supports",
      description: "see detail",
      source: {
        page: {
          documentId: null,
          pageNumber: 1,
          sheetId: "S1",
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
      originalText: "B4 SEE DETAIL 5/S5.2",
      references: [],
      subjectKind: "structural-member",
      subjectKey: "B4",
      propertyPath: "detailReference",
      candidateValue: "5/S5.2",
      extractionPassId: "pass:primary",
      bundleId: "bundle:primary",
    };

    // Dictionary with B4 definition
    const dict = dictionaryWithDefinition("B4");

    // Plan index with S5.2 sheet - use non-empty textContent to skip visual rendering
    const index: PlanIndex = {
      ...planIndex(),
      pages: [
        { pageNumber: 1, sheetId: "S1", label: "S1", textContent: "floor plan" },
        { pageNumber: 2, sheetId: "S5.2", label: "S5.2", textContent: "detail 5" },
      ],
    };

    const result = await drainPlanReferenceFollowUps({
      planIndex: index,
      pages: [
        {
          pageNumber: 2,
          sheetId: "S5.2",
          label: "S5.2",
          pageKind: "detail",
          scopeHints: ["framing"],
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
      primaryEvidence: [evidence],
      alreadyCoveredPageNumbers: new Set([1]),
      scopeName: "framing",
      pageClassification: { pages: [] },
      planReadingOrder: { orderedPageNumbers: [1, 2] },
      buildingAssemblies: { assemblyNames: [], notes: [] },
      projectDictionary: dict,
      extractEvidence: mockExtractEvidence(),
    });

    // Complete-case: must have exactly one bound design identity
    assert.equal(
      result.boundDesignIdentities.identities.length,
      1,
      "Complete-case must create exactly one bound design identity",
    );

    const identity = result.boundDesignIdentities.identities[0]!;

    // Assert all three source kinds are established
    assert.equal(
      identity.planMark.status,
      "established",
      "planMark must be established",
    );
    assert.equal(
      identity.definition.status,
      "established",
      "definition must be established (from dictionary)",
    );
    assert.equal(
      identity.detail.status,
      "established",
      "detail must be established (from successful extraction)",
    );

    // Assert isComplete is true
    assert.equal(
      identity.isComplete,
      true,
      "isComplete must be true when all three source kinds are established",
    );

    // Assert subject key matches
    assert.equal(identity.subjectKey, "B4");
    assert.equal(identity.subjectKind, "structural-member");

    // Assert partialReason is null for complete identity
    assert.equal(
      identity.partialReason,
      null,
      "Complete identity must have null partialReason",
    );

    // Audit should reflect complete identity
    assert.equal(result.boundDesignIdentities.audit.completeIdentities, 1);
    assert.equal(result.boundDesignIdentities.audit.partialIdentities, 0);
  });

  /**
   * S2-XB-1: Partial-case AC - subset under one identity with explicit missing path.
   *
   * Per locked amendment:
   * - A bound design does NOT require every source kind to be established.
   * - Partial bind stays inspectable under that same identity.
   * - The missing path stays explicit.
   * - isComplete === false when any source kind is not established.
   * - partialReason names the detail gap.
   */
  it("S2-XB-1: partial-case - planMark + definition established, detail deferred; isComplete === false with explicit partialReason", async () => {
    // Evidence with a detail reference
    const evidence: Evidence = {
      id: "E-REF-PARTIAL",
      type: "note",
      relationship: "supports",
      description: "see detail",
      source: {
        page: {
          documentId: null,
          pageNumber: 1,
          sheetId: "S1",
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
      originalText: "WB2 SEE DETAIL 5/S5.2",
      references: [],
      subjectKind: "structural-member",
      subjectKey: "WB2",
      propertyPath: "detailReference",
      candidateValue: "5/S5.2",
      extractionPassId: "pass:primary",
      bundleId: "bundle:primary",
    };

    // Dictionary with WB2 definition
    const dict = dictionaryWithDefinition("WB2");

    // Plan index with S5.2 sheet - use non-empty textContent to skip visual rendering
    const index: PlanIndex = {
      ...planIndex(),
      pages: [
        { pageNumber: 1, sheetId: "S1", label: "S1", textContent: "floor plan" },
        { pageNumber: 2, sheetId: "S5.2", label: "S5.2", textContent: "detail 5" },
      ],
    };

    // Use a failing mock extractor to simulate extraction failure -> partial identity
    const failingExtractor: ExtractEvidenceFn = async () => {
      throw new Error("Simulated extraction failure for partial-case test");
    };

    const result = await drainPlanReferenceFollowUps({
      planIndex: index,
      pages: [
        {
          pageNumber: 2,
          sheetId: "S5.2",
          label: "S5.2",
          pageKind: "detail",
          scopeHints: ["framing"],
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
      primaryEvidence: [evidence],
      alreadyCoveredPageNumbers: new Set([1]),
      scopeName: "framing",
      pageClassification: { pages: [] },
      planReadingOrder: { orderedPageNumbers: [1, 2] },
      buildingAssemblies: { assemblyNames: [], notes: [] },
      projectDictionary: dict,
      extractEvidence: failingExtractor,
    });

    // Partial-case: must have at least one bound design identity
    assert.ok(
      result.boundDesignIdentities.identities.length >= 1,
      "Partial-case must create at least one bound design identity",
    );

    const identity = result.boundDesignIdentities.identities[0]!;

    // Assert planMark is established
    assert.equal(
      identity.planMark.status,
      "established",
      "planMark must be established from originating evidence",
    );

    // Assert definition is established (from dictionary)
    assert.equal(
      identity.definition.status,
      "established",
      "definition must be established from dictionary lookup",
    );

    // Assert detail is NOT established (deferred/missing/unattempted/unresolved)
    assert.ok(
      ["missing", "deferred", "unattempted", "unresolved"].includes(identity.detail.status),
      `detail must be missing/deferred/unattempted/unresolved, got: ${identity.detail.status}`,
    );

    // Assert isComplete is false
    assert.equal(
      identity.isComplete,
      false,
      "isComplete must be false when detail is not established",
    );

    // Assert partialReason explicitly names the detail gap
    assert.ok(
      identity.partialReason !== null,
      "partialReason must not be null for partial identity",
    );
    assert.ok(
      identity.partialReason!.includes("detail"),
      `partialReason must mention detail gap, got: ${identity.partialReason}`,
    );

    // Assert subject key
    assert.equal(identity.subjectKey, "WB2");
    assert.equal(identity.subjectKind, "structural-member");

    // Audit should reflect partial identity
    assert.equal(result.boundDesignIdentities.audit.partialIdentities, 1);
    assert.equal(result.boundDesignIdentities.audit.completeIdentities, 0);
  });

  /**
   * S2-XB-1: Budget exhaustion is NOT ReadComplete established.
   *
   * Per locked amendment:
   * - Reference-queue budget is a spend limit, not completeness proof.
   * - Budget is not ReadComplete.
   * - Budget-deferred references have explicit deferred status.
   */
  it("S2-XB-1: budget is spend limit, not ReadComplete established", async () => {
    const result = await drainPlanReferenceFollowUps({
      planIndex: planIndex(),
      pages: [],
      primaryEvidence: [evidenceWithDetailReference()],
      alreadyCoveredPageNumbers: new Set(),
      scopeName: "framing",
      pageClassification: { pages: [] },
      planReadingOrder: { orderedPageNumbers: [1, 2, 3, 4] },
      buildingAssemblies: { assemblyNames: [], notes: [] },
    });

    // Budget-deferred items should NOT claim ReadComplete
    const deferredItems = result.trace.queue.items.filter(
      (item) => item.queueStatus === "deferred",
    );

    for (const item of deferredItems) {
      assert.ok(item.statusReason, "Deferred items must have explicit status reason");
      assert.ok(
        !item.statusReason?.toLowerCase().includes("readcomplete"),
        "Budget deferral must NOT claim ReadComplete",
      );
    }

    // Bound design identities for deferred items should have explicit deferred status
    for (const identity of result.boundDesignIdentities.identities) {
      if (identity.detail.status === "deferred") {
        assert.ok(
          identity.detail.reason?.toLowerCase().includes("deferred"),
          "Deferred detail must have explicit deferred reason",
        );
        assert.equal(
          identity.isComplete,
          false,
          "Identity with deferred detail is NOT complete",
        );
      }
    }

    // Audit should track budget-deferred references
    assert.ok(
      result.boundDesignIdentities.audit.budgetDeferredReferences > 0 ||
        result.boundDesignIdentities.identities.length === 0,
      "Budget deferred references should be tracked in audit",
    );
  });
});
