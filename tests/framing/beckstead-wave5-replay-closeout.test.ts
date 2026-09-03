import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { buildConstructionSemanticRelationshipEvidence } from "../../src/framing/geometry/buildConstructionSemanticRelationshipEvidence.js";
import { resolveFloorFraming } from "../../src/framing/resolve/resolveFloorFraming.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const WAVE4_FRAMING = path.join(
  REPO_ROOT,
  "artifacts/b2.3-wave4/runs/beckstead-wave4-after/framing",
);

describe("beckstead wave5 replay closeout", () => {
  it("achieves WAVE5_GREEN on wave4 Beckstead evidence replay", () => {
    if (!existsSync(path.join(WAVE4_FRAMING, "06-extractedEvidence.json"))) {
      return;
    }

    const evidenceEnvelope = JSON.parse(
      readFileSync(path.join(WAVE4_FRAMING, "06-extractedEvidence.json"), "utf8"),
    );
    const pageClassificationEnvelope = JSON.parse(
      readFileSync(path.join(WAVE4_FRAMING, "02-pageClassification.json"), "utf8"),
    );

    const { evidence, audit } = buildConstructionSemanticRelationshipEvidence({
      evidence: evidenceEnvelope.payload.evidence,
      classifiedPages: pageClassificationEnvelope.payload.pages,
    });

    assert.ok(audit.semanticAuthorityAccepted >= 1);
    assert.ok(evidence.length >= 1);

    const payload = resolveFloorFraming([
      ...evidenceEnvelope.payload.evidence,
      ...evidence,
    ]);
    const linked = payload.areas.filter(
      (area) => !area.parentSystemId.endsWith("UNRESOLVED"),
    );
    assert.ok(linked.length >= 1);

    const crawlAccept = audit.entries.find(
      (entry) =>
        entry.status === "accepted" &&
        entry.regionLabel.includes("CRAWL") &&
        entry.systemSubjectKey === "FLOOR SYSTEM CRAWL SPACE",
    );
    assert.ok(crawlAccept);
  });
});
