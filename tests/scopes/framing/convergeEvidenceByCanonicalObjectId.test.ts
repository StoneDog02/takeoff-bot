import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Evidence } from "../../../src/core/schemas/evidence.schema.js";
import { evidenceIdSchema } from "../../../src/core/schemas/identity.schema.js";
import {
  convergeEvidenceByCanonicalObjectId,
  formatSubjectKeyConvergenceNote,
} from "../../../src/scopes/framing/resolvers/convergeEvidenceByCanonicalObjectId.js";
import {
  createSheathingSystemObjectId,
  sanitizeSubjectKey,
} from "../../../src/scopes/framing/resolvers/ids.js";

function record(subjectKey: string, id: string): Evidence {
  return {
    id: evidenceIdSchema.parse(id),
    type: "note",
    relationship: "supports",
    description: "test",
    source: {
      page: {
        documentId: null,
        pageNumber: 1,
        sheetId: null,
        sheetTitle: null,
        pageLabel: null,
        revision: null,
      },
      region: null,
      tileId: null,
      elementLabel: null,
      detailNumber: null,
      sectionNumber: null,
      scheduleName: null,
      noteReference: null,
    },
    originalText: subjectKey,
    references: [],
    subjectKind: "sheathing-system",
    subjectKey,
    propertyPath: "name",
    candidateValue: subjectKey,
    extractionPassId: null,
    bundleId: null,
  };
}

describe("convergeEvidenceByCanonicalObjectId", () => {
  it("merges raw keys that sanitize to the same ObjectId", () => {
    const groups = new Map<string, Evidence[]>([
      ["FLOOR SHEATHING", [record("FLOOR SHEATHING", "E-1")]],
      ["FLOOR-SHEATHING", [record("FLOOR-SHEATHING", "E-2")]],
    ]);
    const clusters = convergeEvidenceByCanonicalObjectId({
      groups,
      createObjectId: createSheathingSystemObjectId,
    });
    assert.equal(clusters.length, 1);
    assert.equal(clusters[0]?.objectId, "SHS-FLOOR-SHEATHING");
    assert.equal(clusters[0]?.canonicalSubjectKey, "FLOOR-SHEATHING");
    assert.deepEqual(clusters[0]?.rawSubjectKeys, [
      "FLOOR SHEATHING",
      "FLOOR-SHEATHING",
    ]);
    assert.equal(clusters[0]?.records.length, 2);
  });

  it("keeps distinct ObjectIds separate", () => {
    const groups = new Map<string, Evidence[]>([
      ["SHS-001", [record("SHS-001", "E-1")]],
      ["SHS-002", [record("SHS-002", "E-2")]],
    ]);
    const clusters = convergeEvidenceByCanonicalObjectId({
      groups,
      createObjectId: createSheathingSystemObjectId,
    });
    assert.equal(clusters.length, 2);
  });

  it("formats convergence notes only when multiple raw keys exist", () => {
    assert.equal(
      formatSubjectKeyConvergenceNote(["A"], createSheathingSystemObjectId("A")),
      null,
    );
    assert.match(
      formatSubjectKeyConvergenceNote(
        ["FLOOR SHEATHING", "FLOOR-SHEATHING"],
        createSheathingSystemObjectId("FLOOR SHEATHING"),
      ) ?? "",
      /Converged subjectKeys/,
    );
    assert.equal(sanitizeSubjectKey("FLOOR SHEATHING"), "FLOOR-SHEATHING");
  });
});
