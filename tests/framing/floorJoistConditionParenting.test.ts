import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evidenceSchema } from "../../src/core/schemas/evidence.schema.js";
import { calculateFloorFraming } from "../../src/framing/calculate/calculateFloorFraming.js";
import { resolveFloorFraming } from "../../src/framing/resolve/resolveFloorFraming.js";
import { FLOOR_QUANTITY_KEYS } from "../../src/framing/validators/rule-ids.js";
import { createMaterialLineItemId } from "../../src/framing/calculate/ids.js";
import {
  BECKSTEAD_M5_CRAWL_JOIST_COUNT,
  BECKSTEAD_M5_CRAWL_JOIST_LF,
} from "../fixtures/becksteadM5FloorLayoutEvidence.js";

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

describe("joist-condition floor parenting", () => {
  it("parents only the crawl bay onto a TJI system when porch/patio have SF only", () => {
    const payload = resolveFloorFraming([
      floorEvidence(
        "floor-framing-system",
        "FLOOR-SYS---CRAWL-SPACE",
        "E-FFS-TYPE",
        "assembly.joistType",
        "TJI 210",
      ),
      floorEvidence(
        "floor-framing-system",
        "FLOOR-SYS---CRAWL-SPACE",
        "E-FFS-SIZE",
        "assembly.joistSize",
        "11-7/8",
      ),
      floorEvidence(
        "floor-framing-system",
        "FLOOR-SYS---CRAWL-SPACE",
        "E-FFS-SPACING",
        "assembly.joistSpacingInches",
        16,
      ),
      floorEvidence(
        "floor-framing-area",
        "FLOOR AREA---CRAWL SPACE MAIN",
        "E-CRAWL-PARENT",
        "parentSystemTag",
        "FLOOR-SYS---CRAWL-SPACE",
      ),
      floorEvidence(
        "floor-framing-area",
        "FLOOR AREA---CRAWL SPACE MAIN",
        "E-CRAWL-LAYOUT",
        "joistLayoutLengthFeet",
        40,
      ),
      floorEvidence(
        "floor-framing-area",
        "FLOOR AREA---CRAWL SPACE MAIN",
        "E-CRAWL-MEMBER",
        "joistMemberLengthFeet",
        17,
      ),
      floorEvidence(
        "floor-framing-area",
        "FLOOR AREA---CRAWL SPACE MAIN",
        "E-CRAWL-SPAN",
        "spanDirection",
        "north-south",
      ),
      floorEvidence(
        "floor-framing-area",
        "COV. PORCH",
        "E-PORCH-SF",
        "areaSquareFeet",
        120,
      ),
      floorEvidence(
        "floor-framing-area",
        "COV. PORCH",
        "E-PORCH-PARENT",
        "parentSystemTag",
        "FLOOR-SYS---CRAWL-SPACE",
      ),
      floorEvidence(
        "floor-framing-area",
        "UNCOV. PATIO",
        "E-PATIO-SF",
        "areaSquareFeet",
        80,
      ),
      floorEvidence(
        "floor-framing-area",
        "UNCOV. PATIO",
        "E-PATIO-PARENT",
        "parentSystemTag",
        "FLOOR-SYS---CRAWL-SPACE",
      ),
    ]);

    const system = payload.systems.find(
      (entry) => entry.id === "FFS-FLOOR-SYS---CRAWL-SPACE",
    );
    assert.ok(system);
    assert.deepEqual(system.areaIds, ["FFA-FLOOR-AREA---CRAWL-SPACE-MAIN"]);

    const crawl = payload.areas.find(
      (entry) => entry.id === "FFA-FLOOR-AREA---CRAWL-SPACE-MAIN",
    );
    const porch = payload.areas.find((entry) => entry.id === "FFA-COV.-PORCH");
    const patio = payload.areas.find((entry) => entry.id === "FFA-UNCOV.-PATIO");
    assert.ok(crawl);
    assert.ok(porch);
    assert.ok(patio);
    assert.equal(crawl.parentSystemId, "FFS-FLOOR-SYS---CRAWL-SPACE");
    assert.equal(crawl.joistLayoutLengthFeet, 40);
    assert.equal(crawl.joistMemberLengthFeet, 17);
    assert.equal(porch.parentSystemId, "FFS-UNRESOLVED");
    assert.equal(patio.parentSystemId, "FFS-UNRESOLVED");
    assert.equal(porch.joistLayoutLengthFeet, null);
    assert.equal(patio.joistLayoutLengthFeet, null);

    const materials = calculateFloorFraming(payload);
    const countLine = materials.find(
      (line) =>
        line.id ===
        createMaterialLineItemId(FLOOR_QUANTITY_KEYS.joists, crawl.id),
    );
    const lfLine = materials.find(
      (line) =>
        line.id ===
        createMaterialLineItemId(FLOOR_QUANTITY_KEYS.joistLinearFeet, crawl.id),
    );
    assert.ok(countLine);
    assert.equal(countLine.quantity, BECKSTEAD_M5_CRAWL_JOIST_COUNT);
    assert.ok(lfLine);
    assert.equal(lfLine.quantity, BECKSTEAD_M5_CRAWL_JOIST_LF);
    assert.equal(
      materials.filter((line) =>
        line.sourceObjectIds.some(
          (id) => id === "FFA-COV.-PORCH" || id === "FFA-UNCOV.-PATIO",
        ),
      ).length,
      0,
    );
  });

  it("still parents a porch that has its own joist layout and member Evidence", () => {
    const payload = resolveFloorFraming([
      floorEvidence(
        "floor-framing-system",
        "FLOOR-SYS---CRAWL-SPACE",
        "E-FFS-TYPE",
        "assembly.joistType",
        "TJI 210",
      ),
      floorEvidence(
        "floor-framing-area",
        "COV. PORCH",
        "E-PORCH-PARENT",
        "parentSystemTag",
        "FLOOR-SYS---CRAWL-SPACE",
      ),
      floorEvidence(
        "floor-framing-area",
        "COV. PORCH",
        "E-PORCH-LAYOUT",
        "joistLayoutLengthFeet",
        12,
      ),
      floorEvidence(
        "floor-framing-area",
        "COV. PORCH",
        "E-PORCH-MEMBER",
        "joistMemberLengthFeet",
        8,
      ),
    ]);

    const porch = payload.areas.find((entry) => entry.id === "FFA-COV.-PORCH");
    const system = payload.systems.find(
      (entry) => entry.id === "FFS-FLOOR-SYS---CRAWL-SPACE",
    );
    assert.ok(porch);
    assert.ok(system);
    assert.equal(porch.parentSystemId, "FFS-FLOOR-SYS---CRAWL-SPACE");
    assert.equal(system.areaIds.includes("FFA-COV.-PORCH"), true);
  });
});
