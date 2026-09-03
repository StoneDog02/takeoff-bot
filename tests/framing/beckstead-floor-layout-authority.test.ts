import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { calculateFloorFraming } from "../../src/framing/calculate/calculateFloorFraming.js";
import { resolveFloorFraming } from "../../src/framing/resolve/resolveFloorFraming.js";
import { FLOOR_QUANTITY_KEYS } from "../../src/framing/validators/rule-ids.js";
import { createMaterialLineItemId } from "../../src/framing/calculate/ids.js";
import {
  BECKSTEAD_M5_CRAWL_JOIST_COUNT,
  BECKSTEAD_M5_CRAWL_JOIST_LF,
  buildBecksteadM5CrawlSpaceFloorEvidence,
} from "../fixtures/becksteadM5FloorLayoutEvidence.js";

describe("beckstead M.5 crawl-space floor layout authority", () => {
  it("resolves governed crawl bay through calculator with joist count and LF", () => {
    const payload = resolveFloorFraming(buildBecksteadM5CrawlSpaceFloorEvidence());
    const area = payload.areas.find((entry) => entry.id === "FFA-FLOOR-AREA-CRAWL-SPACE");
    const system = payload.systems.find(
      (entry) => entry.id === "FFS-FLOOR-SYS-CRAWL-SPACE",
    );

    assert.ok(area);
    assert.ok(system);
    assert.equal(area.parentSystemId, "FFS-FLOOR-SYS-CRAWL-SPACE");
    assert.equal(area.joistLayoutLengthFeet, 40);
    assert.equal(area.joistMemberLengthFeet, 17);
    assert.equal(system.assembly.joistSpacingInches, 16);
    assert.ok(system.assembly.joistSize);
    assert.ok(system.assembly.joistType);

    const materials = calculateFloorFraming(payload);

    const countLine = materials.find(
      (line) =>
        line.id ===
        createMaterialLineItemId(FLOOR_QUANTITY_KEYS.joists, area.id),
    );
    const lfLine = materials.find(
      (line) =>
        line.id ===
        createMaterialLineItemId(FLOOR_QUANTITY_KEYS.joistLinearFeet, area.id),
    );

    assert.ok(countLine);
    assert.equal(countLine.quantity, BECKSTEAD_M5_CRAWL_JOIST_COUNT);
    assert.equal(countLine.unit, "each");

    assert.ok(lfLine);
    assert.equal(lfLine.quantity, BECKSTEAD_M5_CRAWL_JOIST_LF);
    assert.equal(lfLine.unit, "linear-foot");
  });
});
