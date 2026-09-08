import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evidenceSchema } from "../../src/core/schemas/evidence.schema.js";
import {
  isJoistConditionFloorArea,
  isSlabOrNonWoodFloorArea,
  isWoodJoistFloorSystemCompatibleWithArea,
  layoutTextIndicatesExplicitConcreteSlab,
} from "../../src/framing/resolve/floorAreaMaterialCompatibility.js";
import { evaluateConstructionSemanticFloorProof } from "../../src/framing/geometry/constructionSemanticFloorProof.js";
import { buildPlanRelationshipSignalIndex } from "../../src/framing/geometry/planRelationshipSignalIndex.js";
import {
  becksteadCrawlPageClassification,
  becksteadCrawlSpaceEvidence,
} from "../fixtures/becksteadCsFloorAuthorityEvidence.js";

function areaRecords(subjectKey: string, extra: Record<string, unknown> = {}) {
  return [
    evidenceSchema.parse({
      id: "E-AREA-SUBJECT",
      type: "note",
      relationship: "supports",
      description: "Area label",
      source: {
        page: { documentId: null, pageNumber: 3, sheetId: null, sheetTitle: null, pageLabel: null, revision: null },
        region: null,
        elementLabel: subjectKey,
        detailNumber: null,
        sectionNumber: null,
        scheduleName: null,
        noteReference: null,
      },
      originalText: subjectKey,
      references: [],
      subjectKind: "floor-framing-area",
      subjectKey,
      propertyPath: "layout",
      candidateValue: subjectKey,
      ...extra,
    }),
  ];
}

describe("floorAreaMaterialCompatibility", () => {
  it("detects patio slab areas as non-wood floor surfaces", () => {
    assert.equal(
      isSlabOrNonWoodFloorArea(areaRecords("PATIO SLAB AREA")),
      true,
    );
    assert.equal(
      isSlabOrNonWoodFloorArea(areaRecords("CRAWL SPACE FLOOR AREA---S")),
      false,
    );
  });

  it("rejects wood-joist system ownership of patio slab areas in CS proof", () => {
    const evidence = becksteadCrawlSpaceEvidence();
    const patioEvidence = [
      ...evidence,
      ...areaRecords("PATIO SLAB AREA", {
        id: "E-PATIO-SLAB",
        propertyPath: "layout",
        candidateValue: "CONCRETE PATIO SLAB",
        originalText: "CONCRETE PATIO SLAB",
      }),
    ];
    const index = buildPlanRelationshipSignalIndex({
      evidence: patioEvidence,
      classifiedPages: becksteadCrawlPageClassification(),
    });
    const areaClusters = [
      { subjectKey: "PATIO SLAB AREA", records: areaRecords("PATIO SLAB AREA") },
    ];
    const systemClusters = patioEvidence
      .filter((record) => record.subjectKind === "floor-framing-system")
      .reduce<Map<string, typeof patioEvidence>>((map, record) => {
        const group = map.get(record.subjectKey) ?? [];
        group.push(record);
        map.set(record.subjectKey, group);
        return map;
      }, new Map());
    const systemClusterList = [...systemClusters.entries()].map(
      ([subjectKey, records]) => ({ subjectKey, records }),
    );
    const region = index.regionIdentities.find((entry) =>
      entry.tokens.includes("CRAWL"),
    )!;

    const results = evaluateConstructionSemanticFloorProof({
      index,
      evidence: patioEvidence,
      areaClusters,
      systemClusters: systemClusterList,
      region,
    });

    assert.equal(
      results.some((entry) => entry.status === "accepted"),
      false,
    );
  });

  it("blocks compatibility between wood system and slab area records", () => {
    const slabRecords = areaRecords("PATIO SLAB AREA");
    const woodSystemRecords = evidenceSchema.parse({
      id: "E-FFS-TJI",
      type: "note",
      relationship: "supports",
      description: "Joist type",
      source: {
        page: { documentId: null, pageNumber: 3, sheetId: null, sheetTitle: null, pageLabel: null, revision: null },
        region: null,
        elementLabel: "CRAWL SPACE FLOOR FRAMING",
        detailNumber: null,
        sectionNumber: null,
        scheduleName: null,
        noteReference: null,
      },
      originalText: "TJI 210",
      references: [],
      subjectKind: "floor-framing-system",
      subjectKey: "CRAWL SPACE FLOOR FRAMING",
      propertyPath: "assembly.joistType",
      candidateValue: "TJI 210",
    });

    assert.equal(
      isWoodJoistFloorSystemCompatibleWithArea({
        systemRecords: [woodSystemRecords],
        areaRecords: slabRecords,
      }),
      false,
    );
  });

  it("treats explicit CONC. SLAB layout as a non-wood floor even on garage/patio keys", () => {
    assert.equal(
      layoutTextIndicatesExplicitConcreteSlab('4" CONC. SLAB'),
      true,
    );
    assert.equal(layoutTextIndicatesExplicitConcreteSlab("crawl"), false);

    const garage = [
      evidenceSchema.parse({
        id: "E-GARAGE-LAYOUT",
        type: "note",
        relationship: "supports",
        description: "Floor framing area layout",
        source: {
          page: {
            documentId: null,
            pageNumber: 3,
            sheetId: null,
            sheetTitle: null,
            pageLabel: null,
            revision: null,
          },
          region: null,
          elementLabel: "DOUBLE GARAGE",
          detailNumber: null,
          sectionNumber: null,
          scheduleName: null,
          noteReference: null,
        },
        originalText: '4" CONC. SLAB',
        references: [],
        subjectKind: "floor-framing-area",
        subjectKey: "FFA-DOUBLE-GARAGE",
        propertyPath: "layout",
        candidateValue: '4" CONC. SLAB',
      }),
    ];
    const patio = [
      evidenceSchema.parse({
        ...garage[0]!,
        id: "E-PATIO-LAYOUT",
        subjectKey: "FFA-PATIO",
        source: {
          ...garage[0]!.source,
          elementLabel: "PATIO",
        },
      }),
    ];

    assert.equal(isSlabOrNonWoodFloorArea(garage), true);
    assert.equal(isSlabOrNonWoodFloorArea(patio), true);
  });

  it("treats crawl notes or joist layout/member Evidence as a joist condition", () => {
    assert.equal(
      isJoistConditionFloorArea(
        areaRecords("FLOOR AREA --- CRAWL SPACE MAIN"),
      ),
      true,
    );
    assert.equal(
      isJoistConditionFloorArea(
        areaRecords("FFA-BAY", {
          propertyPath: "joistLayoutLengthFeet",
          candidateValue: 40,
          originalText: "40'-0\"",
        }),
      ),
      true,
    );
    assert.equal(
      isJoistConditionFloorArea(
        areaRecords("FFA-BAY", {
          propertyPath: "joistMemberLengthFeet",
          candidateValue: 17,
          originalText: "17'-0\"",
        }),
      ),
      true,
    );
  });

  it("does not treat porch/patio square footage as a joist condition", () => {
    const porch = [
      evidenceSchema.parse({
        id: "E-PORCH-SF",
        type: "note",
        relationship: "supports",
        description: "Covered porch area",
        source: {
          page: {
            documentId: null,
            pageNumber: 3,
            sheetId: null,
            sheetTitle: null,
            pageLabel: null,
            revision: null,
          },
          region: null,
          elementLabel: "COV. PORCH",
          detailNumber: null,
          sectionNumber: null,
          scheduleName: null,
          noteReference: null,
        },
        originalText: "COV. PORCH 120 SF",
        references: [],
        subjectKind: "floor-framing-area",
        subjectKey: "COV. PORCH",
        propertyPath: "areaSquareFeet",
        candidateValue: 120,
      }),
    ];
    const patio = [
      evidenceSchema.parse({
        ...porch[0]!,
        id: "E-PATIO-SF",
        description: "Uncovered patio area",
        originalText: "UNCOV. PATIO 80 SF",
        subjectKey: "UNCOV. PATIO",
        source: {
          ...porch[0]!.source,
          elementLabel: "UNCOV. PATIO",
        },
        candidateValue: 80,
      }),
    ];

    assert.equal(isJoistConditionFloorArea(porch), false);
    assert.equal(isJoistConditionFloorArea(patio), false);
    assert.equal(isSlabOrNonWoodFloorArea(porch), false);
    assert.equal(isSlabOrNonWoodFloorArea(patio), false);
  });

  it("blocks wood-joist system ownership of porch/patio SF-only areas", () => {
    const porch = [
      evidenceSchema.parse({
        id: "E-PORCH-SF",
        type: "note",
        relationship: "supports",
        description: "Covered porch area",
        source: {
          page: {
            documentId: null,
            pageNumber: 3,
            sheetId: null,
            sheetTitle: null,
            pageLabel: null,
            revision: null,
          },
          region: null,
          elementLabel: "COV. PORCH",
          detailNumber: null,
          sectionNumber: null,
          scheduleName: null,
          noteReference: null,
        },
        originalText: "COV. PORCH 120 SF",
        references: [],
        subjectKind: "floor-framing-area",
        subjectKey: "COV. PORCH",
        propertyPath: "areaSquareFeet",
        candidateValue: 120,
      }),
    ];
    const woodSystemRecords = [
      evidenceSchema.parse({
        id: "E-FFS-TJI",
        type: "note",
        relationship: "supports",
        description: "Joist type",
        source: {
          page: {
            documentId: null,
            pageNumber: 3,
            sheetId: null,
            sheetTitle: null,
            pageLabel: null,
            revision: null,
          },
          region: null,
          elementLabel: "FLOOR SYS CRAWL SPACE",
          detailNumber: null,
          sectionNumber: null,
          scheduleName: null,
          noteReference: null,
        },
        originalText: "TJI 210",
        references: [],
        subjectKind: "floor-framing-system",
        subjectKey: "FLOOR-SYS---CRAWL-SPACE",
        propertyPath: "assembly.joistType",
        candidateValue: "TJI 210",
      }),
    ];

    assert.equal(
      isWoodJoistFloorSystemCompatibleWithArea({
        systemRecords: woodSystemRecords,
        areaRecords: porch,
      }),
      false,
    );
    assert.equal(
      isWoodJoistFloorSystemCompatibleWithArea({
        systemRecords: woodSystemRecords,
        areaRecords: areaRecords("FLOOR AREA --- CRAWL SPACE MAIN"),
      }),
      true,
    );
  });
});
