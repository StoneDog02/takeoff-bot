import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evidenceSchema } from "../../src/core/schemas/evidence.schema.js";
import { calculateFloorFraming } from "../../src/framing/calculate/calculateFloorFraming.js";
import { resolveFloorFraming } from "../../src/framing/resolve/resolveFloorFraming.js";

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
        pageNumber: 3,
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
    originalText: String(candidateValue),
    references: [],
    subjectKind,
    subjectKey,
    propertyPath,
    candidateValue,
  });
}

describe("slab vs joist floor parenting", () => {
  it("does not parent garage/patio CONC. SLAB areas onto a TJI joist system", () => {
    const payload = resolveFloorFraming([
      floorEvidence(
        "floor-framing-system",
        "FLOOR-SYS-A",
        "E-FFS-TYPE",
        "assembly.joistType",
        "TJI 210",
      ),
      floorEvidence(
        "floor-framing-system",
        "FLOOR-SYS-A",
        "E-FFS-SIZE",
        "assembly.joistSize",
        '11.7/8"',
      ),
      floorEvidence(
        "floor-framing-system",
        "FLOOR-SYS-A",
        "E-FFS-SPACING",
        "assembly.joistSpacingInches",
        16,
      ),
      floorEvidence(
        "floor-framing-area",
        "FFA-DOUBLE-GARAGE",
        "E-GARAGE-LAYOUT",
        "layout",
        '4" CONC. SLAB',
      ),
      floorEvidence(
        "floor-framing-area",
        "FFA-DOUBLE-GARAGE",
        "E-GARAGE-PARENT",
        "parentSystemTag",
        "FLOOR-SYS-A",
      ),
      floorEvidence(
        "floor-framing-area",
        "FFA-PATIO",
        "E-PATIO-LAYOUT",
        "layout",
        '4" CONC. SLAB',
      ),
      floorEvidence(
        "floor-framing-area",
        "FFA-PATIO",
        "E-PATIO-PARENT",
        "parentSystemTag",
        "FLOOR-SYS-A",
      ),
    ]);

    const system = payload.systems.find((entry) => entry.id === "FFS-FLOOR-SYS-A");
    assert.ok(system);
    assert.equal(system.assembly.joistType, "TJI 210");

    const garage = payload.areas.find((entry) => entry.id === "FFA-DOUBLE-GARAGE");
    const patio = payload.areas.find((entry) => entry.id === "FFA-PATIO");
    assert.ok(garage);
    assert.ok(patio);
    assert.equal(garage.layout, '4" CONC. SLAB');
    assert.equal(patio.layout, '4" CONC. SLAB');
    assert.equal(garage.parentSystemId, "FFS-UNRESOLVED");
    assert.equal(patio.parentSystemId, "FFS-UNRESOLVED");
    assert.equal(system.areaIds.includes("FFA-DOUBLE-GARAGE"), false);
    assert.equal(system.areaIds.includes("FFA-PATIO"), false);

    const materials = calculateFloorFraming(payload);
    assert.equal(
      materials.filter((line) =>
        line.sourceObjectIds.some(
          (id) => id === "FFA-DOUBLE-GARAGE" || id === "FFA-PATIO",
        ),
      ).length,
      0,
    );
  });
});
