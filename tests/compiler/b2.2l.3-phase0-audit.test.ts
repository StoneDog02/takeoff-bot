import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";

import { REFERENCE_MECHANISM_VALUES } from "../../src/compiler/semantic-dereference/referenceMechanism.schema.js";

const METRICS = path.resolve("artifacts/b2.2l.3/metrics");

describe("B2.2L.3 Phase 0 audit artifacts", () => {
  it("p4 convention inventory schema is present after probe run", async () => {
    const raw = await readFile(
      path.join(METRICS, "p4-semantic-convention-inventory.json"),
      "utf8",
    );
    const inv = JSON.parse(raw) as {
      conventionEntries: unknown[];
      pageNumber: number;
    };
    assert.equal(inv.pageNumber, 4);
    assert.ok(Array.isArray(inv.conventionEntries));
  });

  it("REFERENCE_MECHANISM decision is valid enum", async () => {
    const raw = await readFile(
      path.join(METRICS, "phase0-reference-mechanism-decision.json"),
      "utf8",
    );
    const decision = JSON.parse(raw) as { referenceMechanism: string };
    assert.ok(REFERENCE_MECHANISM_VALUES.includes(decision.referenceMechanism as never));
  });

  it("proof target artifact exists", async () => {
    const raw = await readFile(
      path.join(METRICS, "phase0-proof-target.json"),
      "utf8",
    );
    const target = JSON.parse(raw) as { referenceMechanism: string; rationale: string[] };
    assert.ok(Array.isArray(target.rationale));
    assert.ok(REFERENCE_MECHANISM_VALUES.includes(target.referenceMechanism as never));
  });
});
