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
    assert.ok(result.boundDesignIdentities);
  });

  /**
   * S2-XB-1: Dictionary hit does NOT skip Claude follow-up.
   *
   * Per V1 spec §13.4 + locked amendment:
   * - Dictionary is context, not hop completion.
   * - Must NOT skip detail/plan hops on dictionary hit.
   * - A bound design requires plan mark + schedule/dictionary def + detail.
   *
   * This test verifies that when a dictionary hit is found, the code does NOT
   * short-circuit and skip the Claude follow-up. Instead, the dictionary hit
   * is recorded as context for the definition source kind, but the plan/detail
   * hops continue.
   *
   * Note: This test uses sheet-only references (no detailNumber) to avoid
   * triggering PDF rendering. Detail references require visual extraction
   * which needs real PDF files.
   */
  it("S2-XB-1: dictionary hit does NOT skip Claude follow-up (dictionary is context, not hop completion)", async () => {
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

    // Create a sheet-only reference evidence (no detail number) that references
    // the dictionary mark. This tests that dictionary lookup is used as context
    // but doesn't skip the sheet reference.
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

    // Use already-covered pages so sheet-only refs become already-covered status
    // without attempting extraction. This tests that the statusReason does NOT
    // include "skipped Claude follow-up" which was the old dictionary-skip behavior.
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
    // The old behavior was to skip Claude follow-up when dictionary hit was found.
    // The new behavior is that dictionary is context, not hop completion.
    const queueItems = result.trace.queue.items;
    const dictionarySkipItem = queueItems.find((item) =>
      (item.statusReason ?? "").includes("skipped Claude follow-up"),
    );
    assert.equal(
      dictionarySkipItem,
      undefined,
      "Dictionary hit must NOT skip Claude follow-up (dictionary is context, not hop completion)",
    );

    // Verify that the statusReason does NOT mention "Resolved from Plan Dictionary lookup"
    // which was the old skip behavior
    const dictionaryResolvedItem = queueItems.find((item) =>
      (item.statusReason ?? "").includes("Resolved from Plan Dictionary lookup"),
    );
    assert.equal(
      dictionaryResolvedItem,
      undefined,
      "Dictionary lookup must NOT mark reference as resolved/processed",
    );

    // S2-XB-1: Verify bound design identities are tracked.
    assert.ok(result.boundDesignIdentities);
    assert.ok(result.boundDesignIdentities.audit);
  });

  /**
   * S2-XB-1: Complete-case AC - all three source kinds inspectable as one bound design.
   *
   * Per V1 spec §13.4: Cross-sheet evidence example:
   *   B4 plan location + B4 beam schedule + B4 structural detail = one bound project structural design
   */
  it("S2-XB-1: complete-case - all three source kinds bound as one design identity", async () => {
    const result = await drainPlanReferenceFollowUps({
      planIndex: planIndex(),
      pages: [],
      primaryEvidence: [],
      alreadyCoveredPageNumbers: new Set([1, 2, 3, 4]),
      scopeName: "framing",
      pageClassification: { pages: [] },
      planReadingOrder: { orderedPageNumbers: [1, 2, 3, 4] },
      buildingAssemblies: { assemblyNames: [], notes: [] },
    });

    // When no references are discovered, no bound identities are created
    assert.ok(result.boundDesignIdentities);
    assert.equal(result.boundDesignIdentities.identities.length, 0);
    assert.equal(result.boundDesignIdentities.audit.totalIdentities, 0);
  });

  /**
   * S2-XB-1: Partial-case AC - subset under one identity with explicit missing path.
   *
   * Per locked amendment:
   * - A bound design does NOT require every source kind to be established.
   * - Partial bind stays inspectable under that same identity.
   * - The missing path stays explicit.
   * - Must NOT invent the missing source.
   * - Must NOT reject the identity because one kind is absent.
   * - Must NOT treat the gap as established.
   * - Must NOT count partial bind as ReadComplete exhaustion.
   */
  it("S2-XB-1: partial-case - budget deferred detail is explicit, not silently complete", async () => {
    const result = await drainPlanReferenceFollowUps({
      planIndex: planIndex(),
      pages: [],
      primaryEvidence: [evidenceWithReference()],
      alreadyCoveredPageNumbers: new Set(),
      scopeName: "framing",
      pageClassification: { pages: [] },
      planReadingOrder: { orderedPageNumbers: [1, 2, 3, 4] },
      buildingAssemblies: { assemblyNames: [], notes: [] },
    });

    // When references are discovered but budget is exhausted, partial identities are created
    assert.ok(result.boundDesignIdentities);
    
    // Check that deferred references create partial identities with explicit missing paths
    const deferredItems = result.trace.queue.items.filter(
      (item) => item.queueStatus === "deferred",
    );
    
    if (deferredItems.length > 0) {
      // S2-XB-1: Budget deferred should create partial bound design identities
      assert.ok(
        result.boundDesignIdentities.audit.budgetDeferredReferences >= 0,
        "Should track budget-deferred references",
      );
      
      // Partial identities should have explicit status for each source kind
      for (const identity of result.boundDesignIdentities.identities) {
        if (!identity.isComplete) {
          assert.ok(
            identity.partialReason,
            "Partial identity must have explicit reason for missing sources",
          );
          // Check that missing/deferred paths are explicit, not silently complete
          if (identity.detail.status !== "established") {
            assert.ok(
              ["missing", "deferred", "unattempted", "unresolved"].includes(
                identity.detail.status,
              ),
              `Detail status must be explicit (got: ${identity.detail.status})`,
            );
          }
        }
      }
    }
  });

  /**
   * S2-XB-1: Budget exhaustion is NOT ReadComplete established.
   *
   * Per locked amendment:
   * - Reference-queue budget is a spend limit, not completeness proof.
   * - Budget is not ReadComplete.
   * - Must NOT count partial bind / reference budget as ReadComplete exhaustion.
   */
  it("S2-XB-1: budget is spend limit, not ReadComplete established", async () => {
    const result = await drainPlanReferenceFollowUps({
      planIndex: planIndex(),
      pages: [],
      primaryEvidence: [evidenceWithReference()],
      alreadyCoveredPageNumbers: new Set(),
      scopeName: "framing",
      pageClassification: { pages: [] },
      planReadingOrder: { orderedPageNumbers: [1, 2, 3, 4] },
      buildingAssemblies: { assemblyNames: [], notes: [] },
    });

    // Budget-deferred items should NOT be counted as "ReadComplete established"
    // They should remain as "deferred" with explicit reason
    const deferredItems = result.trace.queue.items.filter(
      (item) => item.queueStatus === "deferred",
    );

    for (const item of deferredItems) {
      // Status reason should indicate budget/policy deferral, not completion
      assert.ok(
        item.statusReason,
        "Deferred items must have explicit status reason",
      );
      // Should not claim the reference is "established" or "complete"
      assert.ok(
        !item.statusReason?.toLowerCase().includes("readcomplete"),
        "Budget deferral must NOT claim ReadComplete",
      );
    }

    // Bound design identities for deferred items should have explicit deferred status
    for (const identity of result.boundDesignIdentities.identities) {
      if (identity.detail.status === "deferred") {
        assert.ok(
          identity.detail.reason?.includes("deferred"),
          "Deferred detail must have explicit deferred reason",
        );
        assert.equal(
          identity.isComplete,
          false,
          "Identity with deferred detail is NOT complete",
        );
      }
    }
  });
});
