import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildPlanReferenceQueue,
  mergePlanReferencesIntoQueue,
  selectNextReadyQueueItem,
} from "../../src/plans/buildPlanReferenceQueue.js";
import { navigationKeyForReference } from "../../src/plans/PlanReferenceQueue.js";
import type { PlanReference } from "../../src/plans/PlanReference.js";
import {
  createEmptyReferenceTraversalSpend,
  isPlanReferenceQueueDrained,
  referenceBudgetBlockReason,
} from "../../src/plans/referenceTraversalBudget.js";

function ref(input: {
  id: string;
  text: string;
  sheet: string | null;
  detail: string | null;
  page: number | null;
  status: PlanReference["status"];
  kind?: PlanReference["kind"];
  subjectKey: string;
  evidenceId: string;
  sourcePage?: number;
  from?: string | null;
  to?: string | null;
}): PlanReference {
  return {
    id: input.id,
    originalText: input.text,
    kind: input.kind ?? (input.detail ? "detail" : "sheet"),
    status: input.status,
    detailNumber: input.detail,
    detailNumberFrom: input.from ?? null,
    detailNumberTo: input.to ?? null,
    targetSheetId: input.sheet,
    targetPageNumber: input.page,
    source: {
      page: {
        documentId: null,
        pageNumber: input.sourcePage ?? 1,
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
    originatingEvidenceId: input.evidenceId,
    originatingSubjectKind: "wall",
    originatingSubjectKey: input.subjectKey,
    notes: [],
  };
}

describe("reference queue drain and hard budgets", () => {
  it("is drained when every item is terminal/deferred and no ready remains", () => {
    const queue = buildPlanReferenceQueue({
      references: [
        ref({
          id: "A",
          text: "5/S5.2",
          sheet: "S5.2",
          detail: "5",
          page: 2,
          status: "resolved",
          subjectKey: "SW5",
          evidenceId: "E1",
        }),
        ref({
          id: "B",
          text: "6 thru 9/S6.1",
          sheet: "S6.1",
          detail: null,
          page: 3,
          status: "ambiguous",
          kind: "detail",
          subjectKey: "G",
          evidenceId: "E2",
          from: "6",
          to: "9",
        }),
      ],
      processedNavigationKeys: new Set([
        navigationKeyForReference({
          targetSheetId: "S5.2",
          detailNumber: "5",
          kind: "detail",
        }),
      ]),
      budget: { maxReferenceHops: 1 },
    });
    assert.equal(isPlanReferenceQueueDrained(queue), true);
    assert.equal(selectNextReadyQueueItem(queue), null);
  });

  it("hard budget gates defer rather than allow uncontrolled calls", () => {
    const budget = {
      maxReferenceHops: 1,
      maxReferencedPages: 3,
      maxApiCalls: 4,
      maxLocalizationCalls: 1,
      maxEvidenceExtractionCalls: 1,
      maxRepairCalls: 2,
      maxImages: 5,
      maxDepth: 1,
    };
    const spend = createEmptyReferenceTraversalSpend();
    spend.localizationAttempts = 1;
    assert.match(
      referenceBudgetBlockReason(budget, spend, "localize") ?? "",
      /maxLocalizationCalls/,
    );
    spend.totalApiCalls = 4;
    assert.match(
      referenceBudgetBlockReason(budget, spend, "extract-evidence") ?? "",
      /maxApiCalls/,
    );
    spend.totalApiCalls = 1;
    spend.imagesSent = 5;
    assert.match(
      referenceBudgetBlockReason(budget, spend, "image", 1) ?? "",
      /maxImages/,
    );
  });

  it("selects the only remaining exact deferred-by-budget item when rebuilt with a hop", () => {
    const processed = new Set([
      navigationKeyForReference({
        targetSheetId: "S5.2",
        detailNumber: "5",
        kind: "detail",
      }),
      navigationKeyForReference({
        targetSheetId: "S5.2",
        detailNumber: "6",
        kind: "detail",
      }),
    ]);
    const queue = buildPlanReferenceQueue({
      references: [
        ref({
          id: "P5",
          text: "5/S5.2",
          sheet: "S5.2",
          detail: "5",
          page: 9,
          status: "resolved",
          subjectKey: "SW5",
          evidenceId: "E5",
        }),
        ref({
          id: "P6",
          text: "6/S5.2",
          sheet: "S5.2",
          detail: "6",
          page: 9,
          status: "resolved",
          subjectKey: "M",
          evidenceId: "E6",
        }),
        ref({
          id: "P2",
          text: "2/S6.2",
          sheet: "S6.2",
          detail: "2",
          page: 11,
          status: "resolved",
          subjectKey: "CS16x48",
          evidenceId: "E2",
        }),
        ref({
          id: "S1",
          text: "SHEET S1.1",
          sheet: "S1.1",
          detail: null,
          page: 1,
          status: "resolved",
          kind: "sheet",
          subjectKey: "W",
          evidenceId: "ES",
        }),
        ref({
          id: "R",
          text: "6 thru 9/S6.1",
          sheet: "S6.1",
          detail: null,
          page: 10,
          status: "ambiguous",
          kind: "detail",
          subjectKey: "G",
          evidenceId: "ER",
          from: "6",
          to: "9",
        }),
      ],
      processedNavigationKeys: processed,
      alreadyCoveredPageNumbers: new Set([1]),
      budget: {
        maxReferenceHops: 1,
        maxReferencedPages: 3,
        maxApiCalls: 4,
        maxLocalizationCalls: 1,
        maxEvidenceExtractionCalls: 1,
        maxRepairCalls: 2,
        maxImages: 20,
        maxDepth: 1,
      },
    });

    const next = selectNextReadyQueueItem(queue);
    assert.equal(next?.navigationKey, "S6.2|2|detail");
    assert.equal(next?.detailNumber, "2");
    assert.equal(next?.targetPageNumber, 11);
    assert.ok(
      next?.originatingObservations.some((obs) => obs.originatingSubjectKey === "CS16x48"),
    );
  });

  it("merges newly discovered refs as deferred without recursive processing", () => {
    const queue = buildPlanReferenceQueue({
      references: [
        ref({
          id: "P2",
          text: "2/S6.2",
          sheet: "S6.2",
          detail: "2",
          page: 11,
          status: "resolved",
          subjectKey: "CS16x48",
          evidenceId: "E2",
        }),
      ],
      processedNavigationKeys: new Set([
        navigationKeyForReference({
          targetSheetId: "S6.2",
          detailNumber: "2",
          kind: "detail",
        }),
      ]),
      budget: { maxReferenceHops: 1 },
    });
    assert.equal(isPlanReferenceQueueDrained(queue), true);

    const merged = mergePlanReferencesIntoQueue({
      queue,
      newReferences: [
        ref({
          id: "NEW",
          text: "3/S4.1",
          sheet: "S4.1",
          detail: "3",
          page: 6,
          status: "resolved",
          subjectKey: "X",
          evidenceId: "EN",
        }),
      ],
    });
    const neu = merged.items.find((item) => item.navigationKey === "S4.1|3|detail");
    assert.ok(neu);
    assert.equal(neu?.queueStatus, "deferred");
    assert.match(neu?.deferredReason ?? "", /not recursively processed/);
    assert.equal(isPlanReferenceQueueDrained(merged), true);
  });
});
