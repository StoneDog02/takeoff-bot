import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { resolveOpenings } from "../../../src/scopes/framing/resolvers/resolveOpenings.js";
import { resolveWallFraming } from "../../../src/scopes/framing/resolvers/resolveWallFraming.js";
import type { ExtractedFramingEvidencePayload } from "../../../src/scopes/framing/schemas/framing-artifacts.schema.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const FROZEN_EVIDENCE = path.join(
  REPO_ROOT,
  "artifacts/b2.2m.4/runs/beckstead-audit-b/framing/06-extractedEvidence.json",
);
const FROZEN_WALLS = path.join(
  REPO_ROOT,
  "artifacts/b2.2m.4/runs/beckstead-audit-b/framing/07-wallFraming.json",
);

function loadFrozenEvidence(): ExtractedFramingEvidencePayload {
  const envelope = JSON.parse(readFileSync(FROZEN_EVIDENCE, "utf8")) as {
    payload: ExtractedFramingEvidencePayload;
  };
  return envelope.payload;
}

describe("Beckstead opening identity (Amendment #3)", () => {
  it("resolves frozen Mode B evidence without sanitize-collision crash", () => {
    const evidence = loadFrozenEvidence().evidence;
    const wallFraming = JSON.parse(readFileSync(FROZEN_WALLS, "utf8")).payload;
    const payload = resolveOpenings(evidence, { wallFraming });

    const dining = payload.openings.find((opening) => opening.id === "O-3068-DINING");
    assert.ok(dining, "expected collapsed semantic dining opening");

    assert.ok(dining.evidenceIds.includes("E-DOOR-3068-DINING"));
    assert.ok(dining.evidenceIds.includes("E-D3068-DOOR-DINING-DIM"));

    const identityTrace = dining.resolutionTraces.find(
      (entry) => entry.propertyPath === "physicalIdentity",
    );
    assert.equal(identityTrace?.method, "semantic-cluster-pending-physical-link");
  });

  it("preserves governed geometry opening on physical-run:p4:39bf86d87f6b", () => {
    const evidence = loadFrozenEvidence().evidence;
    const wallFraming = JSON.parse(readFileSync(FROZEN_WALLS, "utf8")).payload;
    const payload = resolveOpenings(evidence, { wallFraming });

    const governed = payload.openings.find(
      (opening) =>
        opening.id === "O-opening:p4:physical-run:p4:39bf86d87f6b:gap0" ||
        opening.id.includes("39bf86d87f6b:gap0"),
    );

    assert.ok(governed, "expected governed gap0 opening");
    assert.ok(
      governed.evidenceIds.some((id) => id.includes("39bf86d87f6b")),
      "expected governed evidence ids on opening",
    );
    assert.equal(governed.category, "unknown");
  });

  it("does not reduce resolved wall count from frozen wallFraming artifact", () => {
    const evidence = loadFrozenEvidence().evidence;
    const wallFraming = resolveWallFraming(evidence);
    assert.equal(wallFraming.walls.length, 42);
  });
});
