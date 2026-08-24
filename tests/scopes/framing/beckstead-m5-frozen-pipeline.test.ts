import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { createMaterialLineItemId } from "../../../src/scopes/framing/calculators/ids.js";
import { resolveFloorFraming } from "../../../src/scopes/framing/resolvers/resolveFloorFraming.js";
import type { ExtractedFramingEvidencePayload } from "../../../src/scopes/framing/schemas/framing-artifacts.schema.js";
import { coordinateFramingCalculations } from "../../../src/scopes/framing/calculators/calculation-coordinator.js";
import { coordinateFramingValidation } from "../../../src/scopes/framing/validators/validation-coordinator.js";
import { FLOOR_QUANTITY_KEYS } from "../../../src/scopes/framing/validators/rule-ids.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const FROZEN_EVIDENCE = path.join(
  REPO_ROOT,
  "artifacts/b2.2m.4/runs/beckstead-audit-b/framing/06-extractedEvidence.json",
);
const FROZEN_WALLS = path.join(
  REPO_ROOT,
  "artifacts/b2.2m.4/runs/beckstead-audit-b/framing/07-wallFraming.json",
);
const FROZEN_OPENINGS = path.join(
  REPO_ROOT,
  "artifacts/b2.2m.4/runs/beckstead-audit-b/framing/08-openings.json",
);
const FROZEN_MEMBERS = path.join(
  REPO_ROOT,
  "artifacts/b2.2m.4/runs/beckstead-audit-b/framing/09-structuralMembers.json",
);
const FROZEN_SHEATHING = path.join(
  REPO_ROOT,
  "artifacts/b2.2m.4/runs/beckstead-audit-b/framing/10-sheathing.json",
);
const FROZEN_ROOF = path.join(
  REPO_ROOT,
  "artifacts/b2.2m.4/runs/beckstead-audit-b/framing/12-roofFraming.json",
);
const FROZEN_CALCULATIONS = path.join(
  REPO_ROOT,
  "artifacts/b2.2m.4/runs/beckstead-audit-b/framing/14-calculations.json",
);

function loadPayload<T>(filePath: string): T {
  const envelope = JSON.parse(readFileSync(filePath, "utf8")) as { payload: T };
  return envelope.payload;
}

function loadFrozenEvidence(): ExtractedFramingEvidencePayload {
  return loadPayload<ExtractedFramingEvidencePayload>(FROZEN_EVIDENCE);
}

describe("Beckstead M.5 frozen M.4 evidence product path", () => {
  it("unlocks floor joist materials from frozen Mode B evidence (Audit #7)", () => {
    const evidence = loadFrozenEvidence().evidence;
    const wallFraming = loadPayload(FROZEN_WALLS);
    const openings = loadPayload(FROZEN_OPENINGS);
    const structuralMembers = loadPayload(FROZEN_MEMBERS);
    const sheathing = loadPayload(FROZEN_SHEATHING);
    const roofFraming = loadPayload(FROZEN_ROOF);

    const floorFraming = resolveFloorFraming(evidence);
    const crawlArea = floorFraming.areas.find(
      (area) => area.id === "FFA-FLOOR-AREA-CRAWL-SPACE",
    );
    assert.ok(crawlArea, "expected crawl-space floor area from frozen evidence");
    assert.equal(crawlArea.parentSystemId, "FFS-FLOOR-SYS-CRAWL-SPACE");
    assert.equal(crawlArea.joistLayoutLengthFeet, 40);
    assert.equal(crawlArea.joistMemberLengthFeet, 17);

    const validation = coordinateFramingValidation({
      wallFraming,
      openings,
      structuralMembers,
      floorFraming,
      roofFraming,
      sheathing,
    });

    const calculations = coordinateFramingCalculations({
      wallFraming,
      openings,
      structuralMembers,
      floorFraming,
      roofFraming,
      sheathing,
      validation,
    });

    const m4Calculations = loadPayload<{ materials: Array<{ id: string }> }>(
      FROZEN_CALCULATIONS,
    );
    const m4FloorLines = m4Calculations.materials.filter((line) =>
      line.id.includes("floor.joists"),
    );
    assert.equal(m4FloorLines.length, 0, "M.4 baseline should have zero floor lines");

    const floorJoistLines = calculations.materials.filter(
      (line) =>
        line.id ===
          createMaterialLineItemId(
            FLOOR_QUANTITY_KEYS.joists,
            "FFA-FLOOR-AREA-CRAWL-SPACE",
          ) ||
        line.id ===
          createMaterialLineItemId(
            FLOOR_QUANTITY_KEYS.joistLinearFeet,
            "FFA-FLOOR-AREA-CRAWL-SPACE",
          ),
    );
    assert.ok(floorJoistLines.length >= 2, "expected count + LF floor joist lines");

    const countLine = calculations.materials.find(
      (line) =>
        line.id ===
        createMaterialLineItemId(
          FLOOR_QUANTITY_KEYS.joists,
          "FFA-FLOOR-AREA-CRAWL-SPACE",
        ),
    );
    assert.ok(countLine);
    assert.equal(countLine.quantity, 31);
    assert.equal(countLine.unit, "each");

    const wallStudLines = calculations.materials.filter((line) =>
      line.canonicalClassification?.includes("stud"),
    );
    assert.ok(wallStudLines.length > 0, "wall stud output must not regress");
  });
});
