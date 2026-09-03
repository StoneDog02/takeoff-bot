import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildAreaSystemRelationshipEvidence } from "../../src/framing/geometry/buildAreaSystemRelationshipEvidence.js";
import { buildConstructionSemanticRelationshipEvidence } from "../../src/framing/geometry/buildConstructionSemanticRelationshipEvidence.js";
import { CONSTRUCTION_SEMANTIC_RELATIONSHIP_PASS_ID } from "../../src/framing/geometry/constructionSemanticTypes.js";
import {
  becksteadCrawlPageClassification,
  becksteadCrawlSpaceEvidence,
} from "../fixtures/becksteadCsFloorAuthorityEvidence.js";

describe("buildConstructionSemanticRelationshipEvidence", () => {
  it("mints parentSystemTag with CS-FLOOR authority description", () => {
    const { evidence, audit } = buildConstructionSemanticRelationshipEvidence({
      evidence: becksteadCrawlSpaceEvidence(),
      classifiedPages: becksteadCrawlPageClassification(),
    });

    assert.equal(evidence.length, 1);
    assert.equal(evidence[0]!.propertyPath, "parentSystemTag");
    assert.ok(
      evidence[0]!.description?.includes(
        "Authority[CONSTRUCTION_SEMANTIC:CS-FLOOR]",
      ),
    );
    assert.equal(
      evidence[0]!.extractionPassId,
      CONSTRUCTION_SEMANTIC_RELATIONSHIP_PASS_ID,
    );
    assert.equal(audit.semanticAuthorityAccepted, 1);
    assert.ok(evidence[0]!.description?.includes("evidenceIds="));
  });

  it("skips CS when explicit parentSystemTag already exists", () => {
    const areaKey = "FLOOR AREA CRAWL SPACE";
    const systemKey = "FLOOR SYSTEM CRAWL SPACE";
    const explicit = {
      id: "E-explicit-parent",
      type: "tag",
      relationship: "supports",
      description: "Explicit parent",
      source: becksteadCrawlSpaceEvidence()[0]!.source,
      originalText: systemKey,
      references: [],
      subjectKind: "floor-framing-area",
      subjectKey: areaKey,
      propertyPath: "parentSystemTag",
      candidateValue: systemKey,
    };

    const { evidence } = buildConstructionSemanticRelationshipEvidence({
      evidence: [...becksteadCrawlSpaceEvidence(), explicit],
      classifiedPages: becksteadCrawlPageClassification(),
    });

    assert.equal(evidence.length, 0);
  });

  it("skips CS when P4 bridge already linked the area", () => {
    const areaKey = "FFA-CRAWL";
    const systemKey = "FFS-CRAWL";
    const evidence = [
      {
        id: "E-AREA-OWNERSHIP",
        type: "callout",
        relationship: "supports",
        description: "Explicit ownership",
        source: becksteadCrawlSpaceEvidence()[0]!.source,
        originalText: `${areaKey} under ${systemKey}`,
        references: [],
        subjectKind: "floor-framing-area",
        subjectKey: areaKey,
        propertyPath: "layout",
        candidateValue: "crawl",
      },
      {
        id: "E-SYS",
        type: "callout",
        relationship: "supports",
        description: "System",
        source: becksteadCrawlSpaceEvidence()[0]!.source,
        originalText: systemKey,
        references: [],
        subjectKind: "floor-framing-system",
        subjectKey: systemKey,
        propertyPath: "name",
        candidateValue: systemKey,
      },
    ];

    const bridge = buildAreaSystemRelationshipEvidence(evidence, null);
    assert.equal(bridge.length, 1);

    const cs = buildConstructionSemanticRelationshipEvidence({
      evidence: [...evidence, ...bridge],
      classifiedPages: becksteadCrawlPageClassification(),
    });
    assert.equal(cs.evidence.length, 0);
  });
});
