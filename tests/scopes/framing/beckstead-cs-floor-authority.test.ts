import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildConstructionSemanticRelationshipEvidence } from "../../../src/scopes/framing/geometry/buildConstructionSemanticRelationshipEvidence.js";
import { resolveFloorFraming } from "../../../src/scopes/framing/resolvers/resolveFloorFraming.js";
import {
  becksteadCrawlPageClassification,
  becksteadCrawlSpaceEvidence,
} from "../../fixtures/becksteadCsFloorAuthorityEvidence.js";

describe("beckstead CS floor authority integration", () => {
  it("resolves crawl area parent system from CS-minted parentSystemTag", () => {
    const { evidence: csEvidence } = buildConstructionSemanticRelationshipEvidence({
      evidence: becksteadCrawlSpaceEvidence(),
      classifiedPages: becksteadCrawlPageClassification(),
    });

    assert.equal(csEvidence.length, 1);

    const payload = resolveFloorFraming([
      ...becksteadCrawlSpaceEvidence(),
      ...csEvidence,
    ]);

    const linkedAreas = payload.areas.filter(
      (area) => !area.parentSystemId.endsWith("UNRESOLVED"),
    );
    assert.ok(linkedAreas.length >= 1);

    const crawlArea = payload.areas.find((area) =>
      area.id.includes("CRAWL"),
    );
    assert.ok(crawlArea);
    assert.ok(!crawlArea.parentSystemId.endsWith("UNRESOLVED"));
  });
});
