import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evidenceSchema } from "../../src/core/schemas/evidence.schema.js";
import { buildFloorFramingJoistCountEvidence } from "../../src/scopes/framing/demo/floorFramingJoistCountEvidence.js";
import { resolveFloorFraming } from "../../src/scopes/framing/resolvers/resolveFloorFraming.js";

function floorEvidence(
  subjectKind: "floor-framing-system" | "floor-framing-area",
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

describe("resolveFloorFraming", () => {
  it("resolves two areas with member length only on the complete area", () => {
    const payload = resolveFloorFraming(buildFloorFramingJoistCountEvidence());

    assert.equal(payload.systems.length, 2);
    assert.equal(payload.areas.length, 2);

    const complete = payload.areas.find((area) => area.id === "FFA-001");
    const partial = payload.areas.find((area) => area.id === "FFA-002");
    assert.ok(complete);
    assert.ok(partial);
    assert.equal(complete.joistLayoutLengthFeet, 20);
    assert.equal(complete.joistMemberLengthFeet, 12);
    assert.equal(complete.spanDirection, "north-south");
    assert.equal(partial.joistLayoutLengthFeet, 20);
    assert.equal(partial.joistMemberLengthFeet, null);
    assert.equal(partial.spanDirection, "east-west");
    assert.equal(partial.parentSystemId, "FFS-002");
  });

  it("is input-order deterministic", () => {
    const evidence = buildFloorFramingJoistCountEvidence();
    const forward = resolveFloorFraming(evidence);
    const reverse = resolveFloorFraming([...evidence].reverse());
    assert.deepEqual(forward, reverse);
  });

  it("marks conflicting member length unresolved without losing layout length", () => {
    const payload = resolveFloorFraming([
      ...buildFloorFramingJoistCountEvidence(),
      floorEvidence(
        "floor-framing-area",
        "FFA-001",
        "E-FFA-MEMBER-CONFLICT",
        "joistMemberLengthFeet",
        14,
      ),
    ]);

    const area = payload.areas.find((entry) => entry.id === "FFA-001");
    assert.ok(area);
    assert.equal(area.joistMemberLengthFeet, null);
    assert.equal(area.joistLayoutLengthFeet, 20);
    assert.ok(
      area.resolutionTraces.some(
        (trace) =>
          trace.propertyPath === "joistMemberLengthFeet" &&
          trace.method === "unresolved",
      ),
    );
  });

  it("marks conflicting layout length unresolved", () => {
    const payload = resolveFloorFraming([
      ...buildFloorFramingJoistCountEvidence(),
      floorEvidence(
        "floor-framing-area",
        "FFA-001",
        "E-FFA-LAYOUT-CONFLICT",
        "joistLayoutLengthFeet",
        24,
      ),
    ]);

    const area = payload.areas.find((entry) => entry.id === "FFA-001");
    assert.ok(area);
    assert.equal(area.joistLayoutLengthFeet, null);
    assert.equal(area.joistMemberLengthFeet, 12);
  });
});
