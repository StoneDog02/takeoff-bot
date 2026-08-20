import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evidenceSchema } from "../../src/core/schemas/evidence.schema.js";
import {
  buildRoofFramingCommonRafterEvidence,
  buildRoofFramingTrussEvidence,
} from "../../src/scopes/framing/demo/roofFramingCommonRafterEvidence.js";
import { resolveRoofFraming } from "../../src/scopes/framing/resolvers/resolveRoofFraming.js";

function roofEvidence(
  subjectKind: "roof-framing-system" | "roof-plane",
  subjectKey: string,
  id: string,
  propertyPath: string,
  candidateValue: string | number,
) {
  return evidenceSchema.parse({
    id,
    type: "note",
    relationship: "supports",
    description: `${propertyPath} candidate.`,
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
      elementLabel: subjectKey,
      detailNumber: null,
      sectionNumber: null,
      scheduleName: null,
      noteReference: null,
    },
    originalText: `${subjectKey} ${propertyPath}`,
    references: [],
    subjectKind,
    subjectKey,
    propertyPath,
    candidateValue,
  });
}

describe("resolveRoofFraming", () => {
  it("resolves RFP-001 layout 20 and RFP-002 layout null", () => {
    const payload = resolveRoofFraming(buildRoofFramingCommonRafterEvidence());

    assert.equal(payload.systems.length, 2);
    assert.equal(payload.planes.length, 2);

    const complete = payload.planes.find((plane) => plane.id === "RFP-001");
    const partial = payload.planes.find((plane) => plane.id === "RFP-002");
    assert.ok(complete);
    assert.ok(partial);
    assert.equal(complete.rafterLayoutLengthFeet, 20);
    assert.equal(complete.spanDirection, "north-south");
    assert.equal(partial.rafterLayoutLengthFeet, null);
    assert.equal(partial.spanDirection, "east-west");
    assert.equal(partial.parentSystemId, "RFS-002");
  });

  it("is input-order deterministic", () => {
    const evidence = buildRoofFramingCommonRafterEvidence();
    const forward = resolveRoofFraming(evidence);
    const reverse = resolveRoofFraming([...evidence].reverse());
    assert.deepEqual(forward, reverse);
  });

  it("marks conflicting layout length unresolved", () => {
    const payload = resolveRoofFraming([
      ...buildRoofFramingCommonRafterEvidence(),
      roofEvidence(
        "roof-plane",
        "RFP-001",
        "E-RFP-LAYOUT-CONFLICT",
        "rafterLayoutLengthFeet",
        24,
      ),
    ]);

    const plane = payload.planes.find((entry) => entry.id === "RFP-001");
    assert.ok(plane);
    assert.equal(plane.rafterLayoutLengthFeet, null);
    assert.ok(
      plane.resolutionTraces.some(
        (trace) =>
          trace.propertyPath === "rafterLayoutLengthFeet" &&
          trace.method === "unresolved",
      ),
    );
  });

  it("resolves truss evidence with framingType roof-truss", () => {
    const payload = resolveRoofFraming(buildRoofFramingTrussEvidence());

    assert.equal(payload.systems.length, 1);
    assert.equal(payload.planes.length, 1);

    const system = payload.systems[0];
    const plane = payload.planes[0];
    assert.ok(system);
    assert.ok(plane);
    assert.equal(system.assembly.framingType, "roof-truss");
    assert.equal(plane.rafterLayoutLengthFeet, 20);
    assert.equal(plane.parentSystemId, "RFS-TRUSS");
  });
});
