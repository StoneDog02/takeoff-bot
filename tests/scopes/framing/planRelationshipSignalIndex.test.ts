import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildPlanRelationshipSignalIndex } from "../../../src/scopes/framing/geometry/planRelationshipSignalIndex.js";
import {
  becksteadCrawlPageClassification,
  becksteadCrawlSpaceEvidence,
} from "../../fixtures/becksteadCsFloorAuthorityEvidence.js";

describe("planRelationshipSignalIndex", () => {
  it("indexes SR, RL, APC, and SL from Beckstead crawl fixture", () => {
    const index = buildPlanRelationshipSignalIndex({
      evidence: becksteadCrawlSpaceEvidence(),
      classifiedPages: becksteadCrawlPageClassification(),
    });

    assert.equal(index.sheetRoles.length, 1);
    assert.equal(index.sheetRoles[0]!.pageNumber, 3);
    assert.ok(index.sheetRoles[0]!.titleOrLabel.includes("CRAWL"));

    const rl = index.signals.filter((signal) => signal.id === "RL");
    const apc = index.signals.filter((signal) => signal.id === "APC");
    const sl = index.signals.filter((signal) => signal.id === "SL");

    assert.ok(rl.length >= 1);
    assert.ok(apc.length >= 2);
    assert.ok(sl.length >= 1);
    assert.ok(index.regionIdentities.some((region) => region.tokens.includes("CRAWL")));
  });

  it("ignores evidence on non-floor-plan pages", () => {
    const index = buildPlanRelationshipSignalIndex({
      evidence: [
        {
          ...becksteadCrawlSpaceEvidence()[0]!,
          source: {
            ...becksteadCrawlSpaceEvidence()[0]!.source!,
            page: {
              ...becksteadCrawlSpaceEvidence()[0]!.source!.page!,
              pageNumber: 99,
            },
          },
        },
      ],
      classifiedPages: becksteadCrawlPageClassification(),
    });

    assert.equal(index.signals.filter((signal) => signal.id === "RL").length, 0);
  });
});
