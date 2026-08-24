import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { createMaterialLineItemId } from "../../../src/scopes/framing/calculators/ids.js";
import { coordinateFramingCalculations } from "../../../src/scopes/framing/calculators/calculation-coordinator.js";
import { resolveFloorFraming } from "../../../src/scopes/framing/resolvers/resolveFloorFraming.js";
import { resolveStructuralMembers } from "../../../src/scopes/framing/resolvers/resolveStructuralMembers.js";
import type { ExtractedFramingEvidencePayload } from "../../../src/scopes/framing/schemas/framing-artifacts.schema.js";
import { coordinateFramingValidation } from "../../../src/scopes/framing/validators/validation-coordinator.js";
import {
  FLOOR_QUANTITY_KEYS,
  STRUCTURAL_MEMBER_QUANTITY_KEYS,
} from "../../../src/scopes/framing/validators/rule-ids.js";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
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
const FROZEN_SHEATHING = path.join(
  REPO_ROOT,
  "artifacts/b2.2m.4/runs/beckstead-audit-b/framing/10-sheathing.json",
);
const FROZEN_ROOF = path.join(
  REPO_ROOT,
  "artifacts/b2.2m.4/runs/beckstead-audit-b/framing/12-roofFraming.json",
);
const M5_REPORT = path.join(
  REPO_ROOT,
  "artifacts/b2.2m.5/runs/beckstead-audit-b/framing/16-report.json",
);

function loadPayload<T>(filePath: string): T {
  const envelope = JSON.parse(readFileSync(filePath, "utf8")) as { payload: T };
  return envelope.payload;
}

describe("Beckstead M.6 frozen evidence product path (LVL pivot after M6_MAIN_FLOOR_STOP)", () => {
  it("unlocks SM-WB2-11.88LVL material without regressing walls or crawl joists", () => {
    const evidence = loadPayload<ExtractedFramingEvidencePayload>(
      FROZEN_EVIDENCE,
    ).evidence;
    const wallFraming = loadPayload(FROZEN_WALLS);
    const openings = loadPayload(FROZEN_OPENINGS);
    const sheathing = loadPayload(FROZEN_SHEATHING);
    const roofFraming = loadPayload(FROZEN_ROOF);

    const structuralMembers = resolveStructuralMembers(evidence);
    const floorFraming = resolveFloorFraming(evidence);

    const lvl = structuralMembers.structuralMembers.find(
      (member) => member.id === "SM-WB2-11.88LVL",
    );
    assert.ok(lvl);
    assert.equal(lvl.lengthFeet, 23.5);
    assert.equal(lvl.quantity, 1);
    assert.equal(lvl.materialType, "LVL");
    assert.equal(lvl.size, '(2)-1.3/4"x11.7/8"');

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

    const lvlMaterialId = createMaterialLineItemId(
      STRUCTURAL_MEMBER_QUANTITY_KEYS.material,
      "SM-WB2-11.88LVL",
    );
    const lvlLine = calculations.materials.find(
      (line) => line.id === lvlMaterialId,
    );
    assert.ok(lvlLine, "expected LVL header material line");
    assert.equal(lvlLine.quantity, 23.5);
    assert.equal(lvlLine.unit, "linear-foot");

    const m5 = loadPayload<{
      materials: Array<{ id: string; quantity: number }>;
    }>(M5_REPORT);

    const studs = calculations.materials
      .filter((line) => line.canonicalClassification.includes("stud"))
      .reduce((sum, line) => sum + line.quantity, 0);
    assert.equal(studs, 284);

    const crawlCountId = createMaterialLineItemId(
      FLOOR_QUANTITY_KEYS.joists,
      "FFA-FLOOR-AREA-CRAWL-SPACE",
    );
    const crawlLfId = createMaterialLineItemId(
      FLOOR_QUANTITY_KEYS.joistLinearFeet,
      "FFA-FLOOR-AREA-CRAWL-SPACE",
    );
    assert.equal(
      calculations.materials.find((line) => line.id === crawlCountId)?.quantity,
      31,
    );
    assert.equal(
      calculations.materials.find((line) => line.id === crawlLfId)?.quantity,
      527,
    );

    assert.equal(calculations.materials.length, m5.materials.length + 1);
    assert.ok(
      calculations.materials.some((line) => line.id === lvlMaterialId),
    );
    assert.equal(
      m5.materials.some((line) => line.id === lvlMaterialId),
      false,
      "M.5 baseline must not already include LVL line",
    );
  });
});
