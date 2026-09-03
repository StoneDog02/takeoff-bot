import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  exportBrainPackMap,
  INTENT_EXTRACTION_BRAIN_PATHS,
  resolveExtractionBrainPackPaths,
} from "../../src/framing/extract/framingExtractionBrainPacks.js";

describe("framingExtractionBrainPacks (D11)", () => {
  it("maps wall-framing to scoped wall Brain files without page-reference stub", () => {
    const paths = resolveExtractionBrainPackPaths("wall-framing");
    assert.ok(paths.includes("framing/01-scope-definition.md"));
    assert.ok(paths.includes("framing/05-wall-identification.md"));
    assert.ok(paths.includes("framing/06-wall-types.md"));
    assert.ok(!paths.includes("universal/page-reference-rules.md"));
  });

  it("maps openings, structural-members, and sheathing to distinct packs", () => {
    const openings = resolveExtractionBrainPackPaths("openings");
    const sm = resolveExtractionBrainPackPaths("structural-members");
    const sheathing = resolveExtractionBrainPackPaths("sheathing");
    assert.ok(openings.includes("framing/07-openings.md"));
    assert.ok(sm.includes("framing/08-structural-members.md"));
    assert.ok(sheathing.includes("framing/09-material-taxonomy.md"));
    assert.notDeepEqual(openings, sm);
  });

  it("never loads calc-authority Brain docs into extraction packs", () => {
    for (const paths of Object.values(INTENT_EXTRACTION_BRAIN_PATHS)) {
      for (const filePath of paths) {
        assert.ok(!filePath.includes("13-opening-wall-framing-calculations"));
        assert.ok(!filePath.includes("14-floor-framing-calculations"));
        assert.ok(!filePath.includes("15-roof-framing-calculations"));
      }
    }
  });

  it("exportBrainPackMap matches INTENT_EXTRACTION_BRAIN_PATHS", () => {
    assert.deepEqual(exportBrainPackMap(), INTENT_EXTRACTION_BRAIN_PATHS);
  });
});
