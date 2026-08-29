import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { createMaterialLineItemId } from "../../../src/scopes/framing/calculators/ids.js";
import { coordinateFramingCalculations } from "../../../src/scopes/framing/calculators/calculation-coordinator.js";
import { buildConstructionSemanticRelationshipEvidence } from "../../../src/scopes/framing/geometry/buildConstructionSemanticRelationshipEvidence.js";
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
const PL_V1D_FRAMING = path.join(
  REPO_ROOT,
  "artifacts/beckstead-pl-v1d-20260828-164655/framing",
);

function loadPayload<T>(filePath: string): T {
  const envelope = JSON.parse(readFileSync(filePath, "utf8")) as { payload: T };
  return envelope.payload;
}

describe("Beckstead PL-v1d L2 artifact replay (Floor parent + WB category)", () => {
  it("restores crawl bay floor materials and WB2-11.88LVL member.material", () => {
    const evidencePath = path.join(PL_V1D_FRAMING, "06-extractedEvidence.json");
    if (!existsSync(evidencePath)) {
      return;
    }

    const evidencePayload =
      loadPayload<ExtractedFramingEvidencePayload>(evidencePath);
    const pages = loadPayload<{ pages: unknown[] }>(
      path.join(PL_V1D_FRAMING, "02-pageClassification.json"),
    ).pages;
    const wallFraming = loadPayload(
      path.join(PL_V1D_FRAMING, "07-wallFraming.json"),
    );
    const openings = loadPayload(path.join(PL_V1D_FRAMING, "08-openings.json"));
    const sheathing = loadPayload(
      path.join(PL_V1D_FRAMING, "10-sheathing.json"),
    );
    const roofFraming = loadPayload(
      path.join(PL_V1D_FRAMING, "12-roofFraming.json"),
    );

    const withoutPriorCs = evidencePayload.evidence.filter(
      (record) =>
        record.extractionPassId !==
        "construction-semantic-relationship-authority",
    );

    const { evidence: csEvidence, audit } =
      buildConstructionSemanticRelationshipEvidence({
        evidence: withoutPriorCs,
        classifiedPages: pages as never,
      });

    const crawlLinks = audit.entries.filter(
      (entry) =>
        entry.status === "accepted" &&
        /crawl/i.test(entry.areaSubjectKey ?? ""),
    );
    assert.ok(
      crawlLinks.length >= 2,
      `expected ≥2 crawl area CS links, got ${crawlLinks.length}`,
    );
    assert.ok(
      crawlLinks.some((entry) => /40x50|40.?50/i.test(entry.areaSubjectKey ?? "")),
    );
    assert.ok(
      crawlLinks.some((entry) =>
        /27|276|27'6/i.test(entry.areaSubjectKey ?? ""),
      ),
    );

    const mergedEvidence = [...withoutPriorCs, ...csEvidence];
    const structuralMembers = resolveStructuralMembers(mergedEvidence);
    const floorFraming = resolveFloorFraming(mergedEvidence);

    const wb2 = structuralMembers.structuralMembers.find(
      (member) => member.id === "SM-WB2-11.88LVL",
    );
    assert.ok(wb2);
    assert.equal(wb2.category, "header");
    assert.equal(wb2.lengthFeet, 23.5);
    assert.equal(wb2.quantity, 1);
    assert.equal(wb2.materialType, "LVL");

    const linkedBays = floorFraming.areas.filter(
      (area) =>
        /crawl/i.test(area.id) &&
        area.joistLayoutLengthFeet != null &&
        !area.parentSystemId.endsWith("UNRESOLVED"),
    );
    assert.ok(
      linkedBays.length >= 2,
      `expected ≥2 linked crawl bays with layout, got ${linkedBays.map((a) => a.id).join(",")}`,
    );

    const validation = coordinateFramingValidation({
      wallFraming: wallFraming as never,
      openings: openings as never,
      structuralMembers,
      floorFraming,
      roofFraming: roofFraming as never,
      sheathing: sheathing as never,
    });

    const calculations = coordinateFramingCalculations({
      wallFraming: wallFraming as never,
      openings: openings as never,
      structuralMembers,
      floorFraming,
      roofFraming: roofFraming as never,
      sheathing: sheathing as never,
      validation,
    });

    const lvlMaterialId = createMaterialLineItemId(
      STRUCTURAL_MEMBER_QUANTITY_KEYS.material,
      "SM-WB2-11.88LVL",
    );
    const lvlLine = calculations.materials.find(
      (line) => line.id === lvlMaterialId,
    );
    assert.ok(lvlLine, "expected WB2-11.88LVL member.material line");
    assert.equal(lvlLine.quantity, 23.5);

    const floorJoistLines = calculations.materials.filter(
      (line) => line.quantityKey === FLOOR_QUANTITY_KEYS.joists,
    );
    const floorLfLines = calculations.materials.filter(
      (line) => line.quantityKey === FLOOR_QUANTITY_KEYS.joistLinearFeet,
    );
    assert.ok(floorJoistLines.length >= 1, "expected floor.joists emission");
    assert.ok(
      floorLfLines.length >= 1,
      "expected floor.joist-linear-feet emission",
    );

    const studs = calculations.materials
      .filter((line) => line.quantityKey === "wall.studs")
      .reduce((sum, line) => sum + line.quantity, 0);
    const wallCount = calculations.materials.filter(
      (line) =>
        line.quantityKey === "wall.studs" || line.quantityKey === "wall.plates",
    ).length;
    assert.equal(studs, 284);
    assert.equal(wallCount, 52);
  });
});
