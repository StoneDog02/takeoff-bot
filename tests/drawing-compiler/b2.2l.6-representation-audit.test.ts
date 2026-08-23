import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";

import { runBecksteadP1RepresentationAudit } from "../../artifacts/b2.2l.6/probe/becksteadP1RepresentationAudit.js";

const METRICS = path.resolve("artifacts/b2.2l.6/metrics/p1-representation-audit.json");

describe("B2.2L.6 representation audit", () => {
  it("emits p1-representation-audit.json with required Phase 0 fields", async () => {
    await runBecksteadP1RepresentationAudit();
    const raw = await readFile(METRICS, "utf8");
    const audit = JSON.parse(raw) as {
      pageWidth: number;
      pageHeight: number;
      operatorAudit: { encodingClass: string };
      vectorGridInParentBand: { cellCount: number; feasible: boolean };
      shearWallTableRegion: { x0: number; y0: number; x1: number; y1: number };
      spikeRecommendations: string[];
      recoverability: string;
    };

    assert.ok(audit.pageWidth > 0);
    assert.ok(audit.pageHeight > 0);
    assert.ok(audit.operatorAudit.encodingClass);
    assert.ok(audit.vectorGridInParentBand.cellCount > 100);
    assert.equal(audit.vectorGridInParentBand.feasible, false);
    assert.ok(audit.shearWallTableRegion.y1 > audit.shearWallTableRegion.y0);
    assert.ok(audit.spikeRecommendations.length > 0);
    assert.ok(audit.recoverability.length > 0);
  });
});
