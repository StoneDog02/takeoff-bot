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

    const result = evaluateConstructionSemanticFloorProof({
      index,
      evidence,
      areaClusters,
      systemClusters,
      region,
    });

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

    const result = evaluateConstructionSemanticFloorProof({
      index,
      evidence,
      areaClusters,
      systemClusters,
      region,
    });

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

  it("rejects equal-support system conflict", () => {
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
    const result = evaluateConstructionSemanticFloorProof({
      index,
      evidence: mergedEvidence,
      areaClusters,
      systemClusters: [equalA, equalB],
      region,
    });

    assert.equal(result.status, "rejected");
    if (result.status === "rejected") {
      assert.equal(result.reason, "CS-CONFLICT-SYSTEM");
      assert.ok((result.conflictCandidates ?? []).length >= 2);
    }
  });
});
