import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";

const ORIENTATION_RUN = path.resolve(
  "artifacts/b2.2l.7/metrics/orientation-run.json",
);

describe("B2.2L.7 orientation audit metrics", () => {
  it("orientation-run.json has P1/P2/governance sections when probe has run", async () => {
    let raw: string;
    try {
      raw = await readFile(ORIENTATION_RUN, "utf8");
    } catch {
      return;
    }

    const metrics = JSON.parse(raw) as {
      p1: { keyedNoteProbe: { hasSwKeyedNote: boolean } };
      p2: { definitionCount: number; graphicConventionAuthorized: boolean };
      governance: { greenOutcome: string | null };
      orientationContext: { definitionCount: number };
    };

    assert.ok(metrics.p1.keyedNoteProbe);
    assert.ok(typeof metrics.p2.definitionCount === "number");
    assert.ok(typeof metrics.p2.graphicConventionAuthorized === "boolean");
    assert.ok(metrics.governance.greenOutcome != null);
    assert.ok(metrics.orientationContext.definitionCount >= 0);
  });
});
