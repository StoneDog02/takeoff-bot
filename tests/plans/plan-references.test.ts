import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Evidence } from "../../src/core/schemas/evidence.schema.js";
import { aggregateExtractionEvidencePasses } from "../../src/plans/aggregateExtractionEvidencePasses.js";
import {
  buildSheetIdentityIndex,
  resolveArchitecturalSheetToPage,
} from "../../src/plans/buildSheetIdentityIndex.js";
import {
  buildReferencedPageExtractionBundles,
  selectResolvedReferencedPageTargets,
} from "../../src/plans/buildReferencedPageExtractionBundles.js";
import { inventoryPlanReferencesFromEvidence } from "../../src/plans/inventoryPlanReferencesFromEvidence.js";
import { parsePlanReferenceLabel } from "../../src/plans/parsePlanReferenceLabel.js";
import type { PlanIndex } from "../../src/plans/PlanIndex.js";
import { classifiedPlanPageSchema } from "../../src/plans/pageClassification.js";
import { resolveWallFraming } from "../../src/scopes/framing/resolvers/resolveWallFraming.js";

function planIndex(pageCount: number): PlanIndex {
  return {
    pdfPath: "/tmp/synthetic.pdf",
    totalPages: pageCount,
    indexedAt: "2026-01-01T00:00:00.000Z",
    sourceContentHash: "a".repeat(64),
    pages: Array.from({ length: pageCount }, (_, index) => ({
      pageNumber: index + 1,
      sheetId: String(10 + index),
      label: `L${index + 1}`,
      textContent: "",
    })),
  };
}

function evidence(input: {
  id: string;
  subjectKey: string;
  propertyPath: string;
  candidateValue: string;
  originalText: string;
  pageNumber: number;
}): Evidence {
  return {
    id: input.id,
    type: "callout",
    relationship: "supports",
    description: "synthetic",
    source: {
      page: {
        documentId: null,
        pageNumber: input.pageNumber,
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
    originalText: input.originalText,
    references: [],
    subjectKind: "wall",
    subjectKey: input.subjectKey,
    propertyPath: input.propertyPath,
    candidateValue: input.candidateValue,
    extractionPassId: null,
    bundleId: null,
  };
}

describe("plan reference parsing", () => {
  it("parses explicit detail/sheet labels", () => {
    const parsed = parsePlanReferenceLabel("SEE DETAIL 5/S5.2");
    assert.equal(parsed.status, "parsed");
    assert.equal(parsed.kind, "detail");
    assert.equal(parsed.detailNumber, "5");
    assert.equal(parsed.targetSheetId, "S5.2");
  });

  it("parses sheet-only references", () => {
    const parsed = parsePlanReferenceLabel("SEE SCHEDULES ON SHEET S1.1");
    assert.equal(parsed.status, "parsed");
    assert.equal(parsed.kind, "sheet");
    assert.equal(parsed.detailNumber, null);
    assert.equal(parsed.targetSheetId, "S1.1");
  });

  it("marks detail ranges ambiguous without inventing a single detail", () => {
    const parsed = parsePlanReferenceLabel("SEE DETAILS 6 THRU 9/S6.1");
    assert.equal(parsed.status, "ambiguous");
    assert.equal(parsed.targetSheetId, "S6.1");
    assert.equal(parsed.detailNumber, null);
    assert.equal(parsed.detailNumberFrom, "6");
    assert.equal(parsed.detailNumberTo, "9");
  });

  it("rejects fraction-like and door-size false positives", () => {
    assert.equal(parsePlanReferenceLabel('3.1/2"').status, "unresolved");
    assert.equal(parsePlanReferenceLabel('7/16" OSB').status, "unresolved");
    assert.equal(parsePlanReferenceLabel("30/8").status, "unresolved");
  });
});

describe("sheet identity resolution", () => {
  it("resolves architectural sheet ids through classification titles", () => {
    const index = buildSheetIdentityIndex({
      planIndex: planIndex(3),
      classifiedPages: [
        classifiedPlanPageSchema.parse({
          pageNumber: 1,
          sheetId: "11",
          label: "11",
          pageKind: "mixed",
          scopeHints: [],
          contentRoles: ["schedule"],
          discipline: "other",
          pageType: "other",
          relevantToFraming: true,
          needsVisualClassification: false,
          classificationMethod: "text",
          titleOrLabel: "S1.1 - Notes",
          evidenceText: null,
          classificationReason: "test",
          confidenceLabel: "high",
        }),
        classifiedPlanPageSchema.parse({
          pageNumber: 2,
          sheetId: "52",
          label: "52",
          pageKind: "detail",
          scopeHints: [],
          contentRoles: ["detail"],
          discipline: "other",
          pageType: "detail",
          relevantToFraming: true,
          needsVisualClassification: false,
          classificationMethod: "text",
          titleOrLabel: "S5.2 - Floor Framing Details",
          evidenceText: null,
          classificationReason: "test",
          confidenceLabel: "high",
        }),
        classifiedPlanPageSchema.parse({
          pageNumber: 3,
          sheetId: "62",
          label: "62",
          pageKind: "detail",
          scopeHints: [],
          contentRoles: ["detail"],
          discipline: "other",
          pageType: "detail",
          relevantToFraming: true,
          needsVisualClassification: false,
          classificationMethod: "text",
          titleOrLabel: "S6.2 - Roof Framing Details",
          evidenceText: null,
          classificationReason: "test",
          confidenceLabel: "high",
        }),
      ],
    });

    assert.deepEqual(resolveArchitecturalSheetToPage("S5.2", index), {
      status: "resolved",
      targetPageNumber: 2,
      matchedArchitecturalSheetId: "S5.2",
    });
    assert.equal(
      resolveArchitecturalSheetToPage("S9.9", index).status,
      "unresolved",
    );
  });

  it("fails closed when multiple pages share the same architectural sheet id", () => {
    const index = buildSheetIdentityIndex({
      planIndex: planIndex(2),
      classifiedPages: [1, 2].map((pageNumber) =>
        classifiedPlanPageSchema.parse({
          pageNumber,
          sheetId: String(pageNumber),
          label: String(pageNumber),
          pageKind: "detail",
          scopeHints: [],
          contentRoles: ["detail"],
          discipline: "other",
          pageType: "detail",
          relevantToFraming: true,
          needsVisualClassification: false,
          classificationMethod: "text",
          titleOrLabel: "S5.2 - Dup",
          evidenceText: null,
          classificationReason: "test",
          confidenceLabel: "high",
        }),
      ),
    });
    const resolution = resolveArchitecturalSheetToPage("S5.2", index);
    assert.equal(resolution.status, "ambiguous");
  });
});

describe("reference inventory and referenced bundles", () => {
  it("inventories structured refs, dedupes navigation, and builds full-sheet referenced bundles", () => {
    const classifiedPages = [
      classifiedPlanPageSchema.parse({
        pageNumber: 1,
        sheetId: "23",
        label: "23",
        pageKind: "plan",
        scopeHints: [],
        contentRoles: ["plan-layout"],
        discipline: "other",
        pageType: "plan",
        relevantToFraming: true,
        needsVisualClassification: false,
        classificationMethod: "text",
        titleOrLabel: "S2.3 - Main Floor",
        evidenceText: null,
        classificationReason: "test",
        confidenceLabel: "high",
      }),
      classifiedPlanPageSchema.parse({
        pageNumber: 2,
        sheetId: "52",
        label: "52",
        pageKind: "detail",
        scopeHints: [],
        contentRoles: ["detail"],
        discipline: "other",
        pageType: "detail",
        relevantToFraming: true,
        needsVisualClassification: false,
        classificationMethod: "text",
        titleOrLabel: "S5.2 - Floor Framing Details",
        evidenceText: null,
        classificationReason: "test",
        confidenceLabel: "high",
      }),
    ];
    const index = planIndex(2);
    const inventory = inventoryPlanReferencesFromEvidence({
      planIndex: index,
      classifiedPages,
      evidence: [
        evidence({
          id: "E-SW5-A",
          subjectKey: "SW5",
          propertyPath: "detailReference",
          candidateValue: "5/S5.2",
          originalText: "SW5 - SEE DETAIL 5/S5.2",
          pageNumber: 1,
        }),
        evidence({
          id: "E-SW5-B",
          subjectKey: "SW5-ALT",
          propertyPath: "detailReference",
          candidateValue: "5/S5.2",
          originalText: "SEE DETAIL 5/S5.2",
          pageNumber: 1,
        }),
        evidence({
          id: "E-FALSE",
          subjectKey: "W1",
          propertyPath: "assembly.sheathing",
          candidateValue: '7/16" OSB',
          originalText: '7/16" OSB SHEATHING',
          pageNumber: 1,
        }),
      ],
    });

    assert.equal(inventory.references.length, 1);
    assert.equal(inventory.references[0]?.targetSheetId, "S5.2");
    assert.equal(inventory.references[0]?.detailNumber, "5");
    assert.equal(inventory.references[0]?.targetPageNumber, 2);
    assert.equal(inventory.references[0]?.status, "resolved");
    assert.ok(
      inventory.references[0]?.notes.some((note) => note.includes("SW5-ALT")),
    );

    const targets = selectResolvedReferencedPageTargets(inventory.references);
    assert.equal(targets.length, 1);
    const bundles = buildReferencedPageExtractionBundles({
      planIndex: index,
      scopeName: "framing",
      targets,
    });
    assert.equal(bundles.length, 1);
    assert.equal(bundles[0]?.intent, "referenced-detail");
    assert.equal(bundles[0]?.members[0]?.role, "referenced");
    assert.equal(bundles[0]?.members[0]?.visualDetailLevel, "full-page");
    assert.equal(bundles[0]?.imageBudget.estimatedImages, 1);
  });

  it("aggregates primary + referenced observations without resolving per bundle", () => {
    const aggregated = aggregateExtractionEvidencePasses({
      passes: [
        {
          stamp: {
            extractionPassId: "primary",
            bundleId: "bundle:framing:wall-framing:p1",
          },
          evidence: [
            evidence({
              id: "E-SW5-TYPE",
              subjectKey: "SW5",
              propertyPath: "wallType",
              candidateValue: "shear wall",
              originalText: "SW5",
              pageNumber: 1,
            }),
          ],
        },
        {
          stamp: {
            extractionPassId: "ref",
            bundleId: "bundle:framing:referenced-detail:p2",
          },
          evidence: [
            evidence({
              id: "E-SW5-SHEATH",
              subjectKey: "SW5",
              propertyPath: "assembly.sheathing",
              candidateValue: "OSB both sides",
              originalText: "DETAIL 5 panel OSB both sides",
              pageNumber: 2,
            }),
          ],
        },
      ],
    });

    assert.equal(aggregated.length, 2);
    assert.equal(aggregated[1]?.extractionPassId, "ref");
    assert.equal(aggregated[1]?.source.page.pageNumber, 2);
    const resolved = resolveWallFraming(aggregated);
    assert.equal(resolved.walls.length, 1);
    assert.equal(resolved.walls[0]?.assembly.sheathing, "OSB both sides");
  });
});
