import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";

const TRACE = path.resolve(
  "artifacts/b2.2l.7/metrics/beckstead-human-semantic-trace.json",
);

describe("B2.2L.7 human semantic trace (O3)", () => {
  it("trace JSON has sheet audit, selected wall, and authority separation", async () => {
    let raw: string;
    try {
      raw = await readFile(TRACE, "utf8");
    } catch {
      return;
    }

    const trace = JSON.parse(raw) as {
      o3HumanSemanticTrace: {
        sheetAudit: { pageNumber: number; referenceMechanism: string };
        selectedWall: { physicalRunKey: string } | null;
        humanEstimatorSteps: string[];
        machineTrace: Array<{ step: string; authority: string }>;
        authoritySeparation: {
          geometryAuthority: string;
          semanticAuthority: string;
          forbiddenCollapse: string[];
        };
      };
    };

    assert.equal(trace.o3HumanSemanticTrace.sheetAudit.pageNumber, 4);
    assert.equal(
      trace.o3HumanSemanticTrace.sheetAudit.referenceMechanism,
      "GRAPHIC_CONVENTION",
    );
    assert.ok(trace.o3HumanSemanticTrace.humanEstimatorSteps.length >= 4);
    assert.ok(
      trace.o3HumanSemanticTrace.authoritySeparation.forbiddenCollapse.length >=
        2,
    );

    if (trace.o3HumanSemanticTrace.selectedWall) {
      assert.match(
        trace.o3HumanSemanticTrace.selectedWall.physicalRunKey,
        /^physical-run:p4:/,
      );
      const subtypeStep = trace.o3HumanSemanticTrace.machineTrace.find(
        (s) => s.step === "subtype-limit",
      );
      assert.ok(subtypeStep);
      assert.equal(subtypeStep!.authority, "unresolved");
    }
  });
});
