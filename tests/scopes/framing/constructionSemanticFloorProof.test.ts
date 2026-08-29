import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Evidence } from "../../../src/core/schemas/evidence.schema.js";
import {
  evaluateAllConstructionSemanticFloorProofs,
  evaluateConstructionSemanticFloorProof,
} from "../../../src/scopes/framing/geometry/constructionSemanticFloorProof.js";
import { buildPlanRelationshipSignalIndex } from "../../../src/scopes/framing/geometry/planRelationshipSignalIndex.js";
import {
  becksteadCrawlPageClassification,
  becksteadCrawlSpaceEvidence,
  becksteadDualRegionEvidence,
} from "../../fixtures/becksteadCsFloorAuthorityEvidence.js";

function clustersFromEvidence(evidence: readonly Evidence[]) {
  const areaMap = new Map<string, Evidence[]>();
  const systemMap = new Map<string, Evidence[]>();
  for (const record of evidence) {
    if (record.subjectKind === "floor-framing-area") {
      const group = areaMap.get(record.subjectKey) ?? [];
      group.push(record);
      areaMap.set(record.subjectKey, group);
    }
    if (record.subjectKind === "floor-framing-system") {
      const group = systemMap.get(record.subjectKey) ?? [];
      group.push(record);
      systemMap.set(record.subjectKey, group);
    }
  }
  return {
    areaClusters: [...areaMap.entries()].map(([subjectKey, records]) => ({
      subjectKey,
      records,
    })),
    systemClusters: [...systemMap.entries()].map(([subjectKey, records]) => ({
      subjectKey,
      records,
    })),
  };
}

describe("constructionSemanticFloorProof", () => {
  it("accepts Beckstead crawl when scope binding is unique", () => {
    const evidence = becksteadCrawlSpaceEvidence();
    const index = buildPlanRelationshipSignalIndex({
      evidence,
      classifiedPages: becksteadCrawlPageClassification(),
    });
    const { areaClusters, systemClusters } = clustersFromEvidence(evidence);
    const region = index.regionIdentities.find((entry) =>
      entry.tokens.includes("CRAWL"),
    )!;

    const results = evaluateConstructionSemanticFloorProof({
      index,
      evidence,
      areaClusters,
      systemClusters,
      region,
    });

    assert.equal(results.length, 1);
    const result = results[0]!;
    assert.equal(result.status, "accepted");
    if (result.status === "accepted") {
      assert.equal(result.areaSubjectKey, "FLOOR AREA CRAWL SPACE");
      assert.equal(result.systemSubjectKey, "FLOOR SYSTEM CRAWL SPACE");
      assert.ok(result.authorizingEvidenceIds.length > 0);
    }
  });

  it("rejects tile-only / missing SR signals", () => {
    const evidence = becksteadCrawlSpaceEvidence();
    const index = buildPlanRelationshipSignalIndex({
      evidence,
      classifiedPages: [],
    });
    const { areaClusters, systemClusters } = clustersFromEvidence(evidence);
    const region = {
      tokens: ["CRAWL"],
      label: "CRAWL",
      pageNumber: 3,
      evidenceIds: ["E-CRAWLAREA-LABEL"],
    };

    const results = evaluateConstructionSemanticFloorProof({
      index,
      evidence,
      areaClusters,
      systemClusters,
      region,
    });

    assert.equal(results.length, 1);
    const result = results[0]!;
    assert.equal(result.status, "rejected");
    if (result.status === "rejected") {
      assert.equal(result.reason, "MISSING-SR");
    }
  });

  it("evaluates dual-region pages per region without blanket CS-CONFLICT-REGION", () => {
    const evidence = becksteadDualRegionEvidence();
    const index = buildPlanRelationshipSignalIndex({
      evidence,
      classifiedPages: becksteadCrawlPageClassification(),
    });
    const { areaClusters, systemClusters } = clustersFromEvidence(evidence);
    const { auditEntries } = evaluateAllConstructionSemanticFloorProofs({
      index,
      evidence,
      areaClusters,
      systemClusters,
    });

    const crawlAccepted = auditEntries.some(
      (entry) => entry.regionLabel.includes("CRAWL") && entry.status === "accepted",
    );
    assert.ok(crawlAccepted);
    assert.ok(auditEntries.length >= 2);
  });

  it("deterministically picks among equal-score same-assembly system fragments", () => {
    const evidence = becksteadCrawlSpaceEvidence();
    const sharedTile = "t-r1-c1";
    const equalA = {
      subjectKey: "TJI 210 FLOOR SYSTEM",
      records: evidence
        .filter((record) => record.subjectKey === "TJI 210 FLOOR SYSTEM")
        .map((record) => ({
          ...record,
          source: { ...record.source!, tileId: sharedTile },
        })) as Evidence[],
    };
    const equalB = {
      subjectKey: "TJI 210 FLOOR SYSTEM B",
      records: [
        {
          ...evidence.find((record) => record.id === "E-TJI210-WEAKER-SYSTEM")!,
          id: "E-ALT-SIZE",
          subjectKey: "TJI 210 FLOOR SYSTEM B",
          source: {
            ...evidence.find((record) => record.id === "E-TJI210-WEAKER-SYSTEM")!.source!,
            tileId: sharedTile,
          },
        },
        {
          ...evidence.find((record) => record.id === "E-TJI210-WEAKER-SPACING")!,
          id: "E-ALT-SPACING",
          subjectKey: "TJI 210 FLOOR SYSTEM B",
          source: {
            ...evidence.find((record) => record.id === "E-TJI210-WEAKER-SYSTEM")!.source!,
            tileId: sharedTile,
          },
        },
      ] as Evidence[],
    };

    const mergedEvidence = [
      ...evidence.filter((record) => record.subjectKey !== "TJI 210 FLOOR SYSTEM"),
      ...equalA.records,
      ...equalB.records,
    ];
    const index = buildPlanRelationshipSignalIndex({
      evidence: mergedEvidence,
      classifiedPages: becksteadCrawlPageClassification(),
    });
    const { areaClusters } = clustersFromEvidence(mergedEvidence);
    const region = index.regionIdentities.find((entry) =>
      entry.tokens.includes("CRAWL"),
    )!;
    const results = evaluateConstructionSemanticFloorProof({
      index,
      evidence: mergedEvidence,
      areaClusters,
      systemClusters: [equalA, equalB],
      region,
    });

    const accepted = results.filter((entry) => entry.status === "accepted");
    assert.ok(accepted.length >= 1);
    assert.ok(
      accepted.every(
        (entry) =>
          entry.status === "accepted" &&
          (entry.systemSubjectKey === "TJI 210 FLOOR SYSTEM" ||
            entry.systemSubjectKey === "TJI 210 FLOOR SYSTEM B"),
      ),
    );
    // Prefer denser APC / lexicographically earlier fragment when scores tie.
    assert.equal(
      accepted.every(
        (entry) =>
          entry.status === "accepted" &&
          entry.systemSubjectKey === "TJI 210 FLOOR SYSTEM",
      ),
      true,
    );
  });

  it("links all eligible crawl bay areas to the unique winning system", () => {
    const base = becksteadCrawlSpaceEvidence();
    const page = 3;
    const tile = "t-r1-c1";
    const bayA: Evidence = {
      id: "E-BAY-A-LAYOUT",
      type: "dimension",
      relationship: "supports",
      description: "Crawl bay A layout",
      source: {
        page: {
          documentId: null,
          pageNumber: page,
          sheetId: null,
          sheetTitle: "CRAWL SPACE/FOUNDATION PLAN",
          pageLabel: null,
          revision: null,
        },
        region: { x: 0.1, y: 0.1, width: 0.2, height: 0.15 },
        tileId: tile,
        elementLabel: "CRAWL SPACE FLOOR AREA (40x50 BAY)",
        detailNumber: null,
        sectionNumber: null,
        scheduleName: null,
        noteReference: null,
      },
      originalText: `40'-0"`,
      references: [],
      subjectKind: "floor-framing-area",
      subjectKey: "CRAWL SPACE FLOOR AREA (40x50 BAY)",
      propertyPath: "joistLayoutLengthFeet",
      candidateValue: 40,
    };
    const bayB: Evidence = {
      ...bayA,
      id: "E-BAY-B-LAYOUT",
      description: "Crawl bay B layout",
      source: {
        ...bayA.source!,
        elementLabel: `CRAWL SPACE FLOOR AREA (27'6" BAY)`,
      },
      originalText: `27'-6"`,
      subjectKey: `CRAWL SPACE FLOOR AREA (27'6" BAY)`,
      candidateValue: 27.5,
    };
    const evidence = [...base, bayA, bayB];
    const index = buildPlanRelationshipSignalIndex({
      evidence,
      classifiedPages: becksteadCrawlPageClassification(),
    });
    const { areaClusters, systemClusters } = clustersFromEvidence(evidence);
    const region = index.regionIdentities.find((entry) =>
      entry.tokens.includes("CRAWL"),
    )!;

    const results = evaluateConstructionSemanticFloorProof({
      index,
      evidence,
      areaClusters,
      systemClusters,
      region,
    });

    const acceptedAreas = results
      .filter((entry) => entry.status === "accepted")
      .map((entry) => (entry.status === "accepted" ? entry.areaSubjectKey : ""));
    assert.ok(acceptedAreas.includes("FLOOR AREA CRAWL SPACE"));
    assert.ok(acceptedAreas.includes("CRAWL SPACE FLOOR AREA (40x50 BAY)"));
    assert.ok(acceptedAreas.includes(`CRAWL SPACE FLOOR AREA (27'6" BAY)`));
    assert.ok(
      results.every(
        (entry) =>
          entry.status !== "accepted" ||
          entry.systemSubjectKey === "FLOOR SYSTEM CRAWL SPACE",
      ),
    );
    assert.equal(
      results.some(
        (entry) => entry.status === "rejected" && entry.reason === "CS-CONFLICT-AREA",
      ),
      false,
    );
  });
});
