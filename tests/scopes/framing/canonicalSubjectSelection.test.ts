import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  scoreSystemClusterBinding,
  selectUniqueByScore,
} from "../../../src/scopes/framing/geometry/canonicalSubjectSelection.js";
import { buildPlanRelationshipSignalIndex } from "../../../src/scopes/framing/geometry/planRelationshipSignalIndex.js";
import {
  becksteadCrawlPageClassification,
  becksteadCrawlSpaceEvidence,
} from "../../fixtures/becksteadCsFloorAuthorityEvidence.js";

describe("canonicalSubjectSelection", () => {
  it("selects unique winner when support scores differ", () => {
    const index = buildPlanRelationshipSignalIndex({
      evidence: becksteadCrawlSpaceEvidence(),
      classifiedPages: becksteadCrawlPageClassification(),
    });
    const region = index.regionIdentities.find((entry) =>
      entry.tokens.includes("CRAWL"),
    )!;
    assert.ok(region);

    const crawlSystem = {
      subjectKey: "FLOOR SYSTEM CRAWL SPACE",
      records: becksteadCrawlSpaceEvidence().filter(
        (record) => record.subjectKey === "FLOOR SYSTEM CRAWL SPACE",
      ),
    };
    const genericSystem = {
      subjectKey: "TJI 210 FLOOR SYSTEM",
      records: becksteadCrawlSpaceEvidence().filter(
        (record) => record.subjectKey === "TJI 210 FLOOR SYSTEM",
      ),
    };

    const crawlScore = scoreSystemClusterBinding({
      index,
      region,
      cluster: crawlSystem,
    });
    const genericScore = scoreSystemClusterBinding({
      index,
      region,
      cluster: genericSystem,
    });

    assert.ok(crawlScore.score > genericScore.score);

    const selection = selectUniqueByScore(
      [genericScore, crawlScore],
      "CS-CONFLICT-SYSTEM",
    );
    assert.equal(selection.status, "unique");
    if (selection.status === "unique") {
      assert.equal(selection.value, "FLOOR SYSTEM CRAWL SPACE");
    }
  });

  it("rejects equal-support candidates without lexicographic tie-break", () => {
    const selection = selectUniqueByScore(
      [
        {
          subjectKey: "SYSTEM-B",
          score: 20,
          authorizingEvidenceIds: ["E-2"],
        },
        {
          subjectKey: "SYSTEM-A",
          score: 20,
          authorizingEvidenceIds: ["E-1"],
        },
      ],
      "CS-CONFLICT-SYSTEM",
    );

    assert.equal(selection.status, "conflict");
    if (selection.status === "conflict") {
      assert.equal(selection.reason, "CS-CONFLICT-SYSTEM");
      assert.equal(selection.candidates.length, 2);
    }
  });

  it("is permutation invariant for equal-support conflict", () => {
    const forward = selectUniqueByScore(
      [
        { subjectKey: "ALPHA", score: 15, authorizingEvidenceIds: ["E-a"] },
        { subjectKey: "BETA", score: 15, authorizingEvidenceIds: ["E-b"] },
      ],
      "CS-CONFLICT-SYSTEM",
    );
    const reverse = selectUniqueByScore(
      [
        { subjectKey: "BETA", score: 15, authorizingEvidenceIds: ["E-b"] },
        { subjectKey: "ALPHA", score: 15, authorizingEvidenceIds: ["E-a"] },
      ],
      "CS-CONFLICT-SYSTEM",
    );

    assert.equal(forward.status, "conflict");
    assert.equal(reverse.status, "conflict");
    if (forward.status === "conflict" && reverse.status === "conflict") {
      assert.deepEqual(
        [...forward.candidates].sort(),
        [...reverse.candidates].sort(),
      );
      assert.equal(forward.reason, reverse.reason);
    }
  });
});
