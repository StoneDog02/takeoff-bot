import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evidenceSchema } from "../../../src/core/schemas/evidence.schema.js";
import {
  isSlabOrNonWoodFloorArea,
  isWoodJoistFloorSystemCompatibleWithArea,
} from "../../../src/scopes/framing/resolvers/floorAreaMaterialCompatibility.js";
import { evaluateConstructionSemanticFloorProof } from "../../../src/scopes/framing/geometry/constructionSemanticFloorProof.js";
import { buildPlanRelationshipSignalIndex } from "../../../src/scopes/framing/geometry/planRelationshipSignalIndex.js";
import {
  becksteadCrawlPageClassification,
  becksteadCrawlSpaceEvidence,
} from "../../fixtures/becksteadCsFloorAuthorityEvidence.js";

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

    const result = evaluateConstructionSemanticFloorProof({
      index,
      evidence: patioEvidence,
      areaClusters,
      systemClusters: systemClusterList,
      region,
    });

    assert.notEqual(result.status, "accepted");
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
});
