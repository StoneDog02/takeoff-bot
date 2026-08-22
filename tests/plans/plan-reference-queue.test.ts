import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Evidence } from "../../src/core/schemas/evidence.schema.js";
import { aggregateExtractionEvidencePasses } from "../../src/plans/aggregateExtractionEvidencePasses.js";
import {
  buildPlanReferenceQueue,
  markQueueItemStatus,
  selectNextReadyQueueItem,
} from "../../src/plans/buildPlanReferenceQueue.js";
import { buildLocalizedReferencedExtractionBundle } from "../../src/plans/buildLocalizedReferencedExtractionBundle.js";
import {
  detailLocalizationResultSchema,
  filterLocalizationTilesToValidSet,
} from "../../src/plans/detailLocalization.js";
import { navigationKeyForReference } from "../../src/plans/PlanReferenceQueue.js";
import type { PlanReference } from "../../src/plans/PlanReference.js";
import type { PlanIndex } from "../../src/plans/PlanIndex.js";
import { resolveWallFraming } from "../../src/scopes/framing/resolvers/resolveWallFraming.js";

function planIndex(): PlanIndex {
  return {
    pdfPath: "/tmp/synthetic.pdf",
    totalPages: 4,
    indexedAt: "2026-01-01T00:00:00.000Z",
    sourceContentHash: "a".repeat(64),
    pages: [1, 2, 3, 4].map((pageNumber) => ({
      pageNumber,
      sheetId: String(pageNumber),
      label: `L${pageNumber}`,
      textContent: "",
    })),
  };
}

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
  sourcePage: number;
}): PlanReference {
  return {
    id: input.id,
    originalText: input.text,
    kind: input.kind ?? (input.detail ? "detail" : "sheet"),
    status: input.status,
    detailNumber: input.detail,
    targetSheetId: input.sheet,
    targetPageNumber: input.page,
    source: {
      page: {
        documentId: null,
        pageNumber: input.sourcePage,
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
    notes: input.status === "ambiguous" ? ["ambiguous range"] : [],
  };
}

describe("plan reference queue", () => {
  it("builds a stable queue with navigation dedupe and surviving provenance", () => {
    const queue = buildPlanReferenceQueue({
      references: [
        ref({
          id: "PREF-A",
          text: "SEE DETAIL 5/S5.2",
          sheet: "S5.2",
          detail: "5",
          page: 2,
          status: "resolved",
          subjectKey: "SW5",
          evidenceId: "E-1",
          sourcePage: 1,
        }),
        ref({
          id: "PREF-B",
          text: "5/S5.2",
          sheet: "S5.2",
          detail: "5",
          page: 2,
          status: "resolved",
          subjectKey: "SW5-ALT",
          evidenceId: "E-2",
          sourcePage: 1,
        }),
        ref({
          id: "PREF-C",
          text: "6/S5.2",
          sheet: "S5.2",
          detail: "6",
          page: 2,
          status: "resolved",
          subjectKey: "M1",
          evidenceId: "E-3",
          sourcePage: 1,
        }),
        ref({
          id: "PREF-D",
          text: "SEE SHEET S1.1",
          sheet: "S1.1",
          detail: null,
          page: 1,
          status: "resolved",
          kind: "sheet",
          subjectKey: "W1",
          evidenceId: "E-4",
          sourcePage: 3,
        }),
        ref({
          id: "PREF-E",
          text: "6 thru 9/S6.1",
          sheet: "S6.1",
          detail: null,
          page: 4,
          status: "ambiguous",
          kind: "detail",
          subjectKey: "G1",
          evidenceId: "E-5",
          sourcePage: 1,
        }),
      ],
      budget: { maxReferenceHops: 10, maxReferencedPages: 10 },
      alreadyCoveredPageNumbers: new Set([1]),
      processedNavigationKeys: new Set([
        navigationKeyForReference({
          targetSheetId: "S5.2",
          detailNumber: "5",
          kind: "detail",
        }),
      ]),
    });

    const byKey = Object.fromEntries(
      queue.items.map((item) => [item.navigationKey, item]),
    );

    assert.equal(byKey["S5.2|5|detail"]?.queueStatus, "processed");
    assert.equal(
      byKey["S5.2|5|detail"]?.originatingObservations.length,
      2,
      "dedupe retains both originating observations",
    );
    assert.equal(byKey["S5.2|6|detail"]?.queueStatus, "ready");
    assert.equal(byKey["S1.1||sheet"]?.queueStatus, "already-covered");
    assert.equal(byKey["S6.1||detail"]?.queueStatus, "ambiguous");

    const next = selectNextReadyQueueItem(queue);
    assert.equal(next?.detailNumber, "6");
    assert.equal(next?.targetSheetId, "S5.2");
  });

  it("defers overflow under hop budget instead of dropping", () => {
    const queue = buildPlanReferenceQueue({
      references: [
        ref({
          id: "PREF-1",
          text: "1/S5.2",
          sheet: "S5.2",
          detail: "1",
          page: 2,
          status: "resolved",
          subjectKey: "A",
          evidenceId: "E-A",
          sourcePage: 1,
        }),
        ref({
          id: "PREF-2",
          text: "2/S6.2",
          sheet: "S6.2",
          detail: "2",
          page: 3,
          status: "resolved",
          subjectKey: "B",
          evidenceId: "E-B",
          sourcePage: 1,
        }),
      ],
      budget: { maxReferenceHops: 1, maxReferencedPages: 3, maxApiCalls: 2 },
    });

    const statuses = queue.items.map((item) => item.queueStatus).sort();
    assert.deepEqual(statuses, ["deferred", "ready"]);
    assert.ok(queue.items.some((item) => item.deferredReason?.includes("maxReferenceHops")));
  });

  it("keeps multiple details on one sheet as distinct queue items", () => {
    const queue = buildPlanReferenceQueue({
      references: [
        ref({
          id: "PREF-5",
          text: "5/S5.2",
          sheet: "S5.2",
          detail: "5",
          page: 2,
          status: "resolved",
          subjectKey: "A",
          evidenceId: "E-A",
          sourcePage: 1,
        }),
        ref({
          id: "PREF-6",
          text: "6/S5.2",
          sheet: "S5.2",
          detail: "6",
          page: 2,
          status: "resolved",
          subjectKey: "B",
          evidenceId: "E-B",
          sourcePage: 1,
        }),
      ],
      budget: { maxReferenceHops: 5, maxReferencedPages: 5 },
    });
    assert.equal(queue.items.length, 2);
    assert.ok(queue.items.every((item) => item.queueStatus === "ready"));
  });
});

describe("detail localization contract", () => {
  it("filters invalid tile ids and fails closed to ambiguous", () => {
    const result = filterLocalizationTilesToValidSet(
      detailLocalizationResultSchema.parse({
        requestedDetailNumber: "6",
        targetSheetId: "S5.2",
        targetPageNumber: 2,
        visibility: "visible",
        matchingTileIds: ["t-r0-c1", "t-fake"],
        matchingRegion: null,
        confidenceLabel: "high",
        matchEvidenceText: "DETAIL 6",
        notes: [],
      }),
      new Set(["t-r0-c1", "t-r0-c2"]),
    );
    assert.deepEqual(result.matchingTileIds, ["t-r0-c1"]);
    assert.equal(result.visibility, "visible");

    const empty = filterLocalizationTilesToValidSet(
      detailLocalizationResultSchema.parse({
        requestedDetailNumber: "6",
        targetSheetId: "S5.2",
        targetPageNumber: 2,
        visibility: "visible",
        matchingTileIds: ["t-fake"],
        matchingRegion: null,
        confidenceLabel: "low",
        matchEvidenceText: null,
        notes: [],
      }),
      new Set(["t-r0-c1"]),
    );
    assert.equal(empty.visibility, "ambiguous");
    assert.equal(empty.matchingTileIds.length, 0);
  });

  it("builds a localized referenced bundle preserving PlanReference provenance", () => {
    const queue = buildPlanReferenceQueue({
      references: [
        ref({
          id: "PREF-6",
          text: "6/S5.2",
          sheet: "S5.2",
          detail: "6",
          page: 2,
          status: "resolved",
          subjectKey: "MTS30C",
          evidenceId: "E-M",
          sourcePage: 1,
        }),
      ],
      budget: { maxReferenceHops: 1 },
    });
    const item = selectNextReadyQueueItem(queue)!;
    const localization = detailLocalizationResultSchema.parse({
      requestedDetailNumber: "6",
      targetSheetId: "S5.2",
      targetPageNumber: 2,
      visibility: "visible",
      matchingTileIds: ["t-r1-c2"],
      matchingRegion: null,
      confidenceLabel: "high",
      matchEvidenceText: "DETAIL 6",
      notes: [],
    });
    const bundle = buildLocalizedReferencedExtractionBundle({
      planIndex: planIndex(),
      scopeName: "framing",
      queueItem: item,
      localization,
    });
    assert.equal(bundle.intent, "referenced-detail");
    assert.equal(bundle.members[0]?.role, "referenced");
    assert.equal(
      bundle.members[0]?.visualDetailLevel,
      "full-page-and-selected-tiles",
    );
    assert.deepEqual(bundle.members[0]?.selectedTileIds, ["t-r1-c2"]);
    assert.equal(bundle.imageBudget.estimatedImages, 2);
    assert.ok(bundle.routingNotes.some((note) => note.includes("PREF-6")));
  });

  it("aggregates localized referenced Evidence into the project graph without resolving quantities", () => {
    const evidence = (id: string, subjectKey: string, page: number): Evidence => ({
      id,
      type: "detail",
      relationship: "supports",
      description: "synthetic",
      source: {
        page: {
          documentId: null,
          pageNumber: page,
          sheetId: null,
          sheetTitle: null,
          pageLabel: null,
          revision: null,
        },
        region: null,
        tileId: page === 2 ? "t-r1-c2" : null,
        elementLabel: null,
        detailNumber: page === 2 ? "6" : null,
        sectionNumber: null,
        scheduleName: null,
        noteReference: null,
      },
      originalText: "note",
      references: [],
      subjectKind: "wall",
      subjectKey,
      propertyPath: "note",
      candidateValue: id,
      extractionPassId: null,
      bundleId: null,
    });

    const aggregated = aggregateExtractionEvidencePasses({
      passes: [
        {
          stamp: {
            extractionPassId: "project",
            bundleId: "bundle:prior",
          },
          evidence: [evidence("E-PRIOR", "SW5", 1)],
        },
        {
          stamp: {
            extractionPassId: "ref-localized",
            bundleId: "bundle:framing:referenced-detail-localized:p2:d6",
          },
          evidence: [evidence("E-NEW", "MTS30C", 2)],
        },
      ],
    });
    assert.equal(aggregated.length, 2);
    assert.equal(aggregated[1]?.source.tileId, "t-r1-c2");
    const resolved = resolveWallFraming(aggregated);
    assert.equal(resolved.walls.length, 2);
  });

  it("markQueueItemStatus updates processed provenance fields", () => {
    const queue = buildPlanReferenceQueue({
      references: [
        ref({
          id: "PREF-6",
          text: "6/S5.2",
          sheet: "S5.2",
          detail: "6",
          page: 2,
          status: "resolved",
          subjectKey: "M",
          evidenceId: "E-M",
          sourcePage: 1,
        }),
      ],
    });
    const item = selectNextReadyQueueItem(queue)!;
    const updated = markQueueItemStatus(queue, item.id, {
      queueStatus: "processed",
      extractionPassId: "pass-1",
      localizationPassId: "loc-1",
      bundleId: "bundle-1",
    });
    assert.equal(updated.items[0]?.queueStatus, "processed");
    assert.equal(updated.items[0]?.extractionPassId, "pass-1");
  });
});
