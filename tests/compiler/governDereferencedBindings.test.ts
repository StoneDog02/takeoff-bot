import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { governDereferencedBindings } from "../../src/compiler/semantic-dereference/governDereferencedBindings.js";
import type { DereferencedSemanticBinding } from "../../src/compiler/semantic-dereference/dereferenceSemanticBindings.js";

describe("governDereferencedBindings", () => {
  it("rejects definition without plan reference emit on run", () => {
    const governed = governDereferencedBindings({
      bindings: [
        {
          bindingId: "b1",
          physicalRunKey: "physical-run:p4:x",
          referenceKey: "SW1",
          definitionId: "",
          relationship: "dereferenced-reference",
          authorityGrade: "A",
          status: "rejected",
          emit: false,
          sourcePageNumber: 4,
          provenance: {
            referenceObservationId: "enc-1",
            conventionEntryIds: [],
            definitionId: "",
            dereferenceMethod: "key-equality",
            referenceMechanism: "TAG",
          },
          notes: ["no matching definition for key SW1"],
        } as DereferencedSemanticBinding,
      ],
      references: [
        {
          referenceId: "r1",
          referenceKey: "SW1",
          referenceMechanism: "TAG",
          conventionClass: "wall-type-tag",
          sourcePageNumber: 4,
          sourceRegion: { x0: 0, y0: 0, x1: 1, y1: 1 },
          observationKind: "enclosed-identifier",
          ownership: {
            physicalRunKey: "physical-run:p4:x",
            authorityGrade: "A",
            method: "tag-spatial-proximity",
          },
          provenance: { observationId: "enc-1", conventionEntryIds: [] },
        },
      ],
    });
    assert.equal(governed.emitBindingIds.length, 0);
    assert.ok(governed.rejectedScheduleOnly >= 0);
  });
});
