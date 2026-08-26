import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Evidence } from "../../../src/core/schemas/evidence.schema.js";
import type { PlanIndex } from "../../../src/plans/PlanIndex.js";
import { drainPlanReferenceFollowUps } from "../../../src/scopes/framing/extraction/drainPlanReferenceFollowUps.js";

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
});
