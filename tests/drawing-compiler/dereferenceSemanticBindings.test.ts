import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { dereferenceSemanticBindings } from "../../src/drawing-compiler/semantic-dereference/dereferenceSemanticBindings.js";
import type { SemanticDefinition } from "../../src/drawing-compiler/schemas/semanticDefinition.schema.js";

const DEF_SW1: SemanticDefinition = {
  definitionId: "def-p1-SW1",
  semanticTypeKey: "SW1",
  definitionKind: "shear-wall",
  sourcePageNumber: 1,
  sourceRegion: { x0: 0, y0: 0, x1: 100, y1: 100 },
  properties: [],
  provenance: { extractionMethod: "vector-grid-ocr" },
};

describe("dereferenceSemanticBindings", () => {
  it("matches reference key to definition by key equality", () => {
    const bindings = dereferenceSemanticBindings({
      references: [
        {
          referenceId: "ref-1",
          referenceKey: "SW1",
          referenceMechanism: "TAG",
          conventionClass: "wall-type-tag",
          sourcePageNumber: 4,
          sourceRegion: { x0: 0, y0: 0, x1: 10, y1: 10 },
          observationKind: "enclosed-identifier",
          ownership: {
            physicalRunKey: "physical-run:p4:abc",
            authorityGrade: "A",
            method: "tag-spatial-proximity",
          },
          provenance: { observationId: "enc-1", conventionEntryIds: ["enc-1"] },
        },
      ],
      definitions: [DEF_SW1],
    });
    assert.equal(bindings.length, 1);
    assert.equal(bindings[0]!.status, "assigned");
    assert.equal(bindings[0]!.emit, true);
    assert.equal(bindings[0]!.definitionId, "def-p1-SW1");
  });

  it("does not establish ownership from definition alone", () => {
    const bindings = dereferenceSemanticBindings({
      references: [],
      definitions: [DEF_SW1],
    });
    assert.equal(bindings.length, 0);
  });

  it("rejects when definition key missing", () => {
    const bindings = dereferenceSemanticBindings({
      references: [
        {
          referenceId: "ref-2",
          referenceKey: "SW9",
          referenceMechanism: "TAG",
          conventionClass: "wall-type-tag",
          sourcePageNumber: 4,
          sourceRegion: { x0: 0, y0: 0, x1: 10, y1: 10 },
          observationKind: "enclosed-identifier",
          ownership: {
            physicalRunKey: "physical-run:p4:abc",
            authorityGrade: "A",
            method: "tag-spatial-proximity",
          },
          provenance: { observationId: "enc-2", conventionEntryIds: ["enc-2"] },
        },
      ],
      definitions: [DEF_SW1],
    });
    assert.equal(bindings[0]!.status, "rejected");
    assert.equal(bindings[0]!.emit, false);
  });
});
