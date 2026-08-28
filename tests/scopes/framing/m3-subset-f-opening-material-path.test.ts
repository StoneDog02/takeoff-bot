import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { coordinateFramingCalculations } from "../../../src/scopes/framing/calculators/calculation-coordinator.js";
import { applyWallOpeningBacklinks } from "../../../src/scopes/framing/resolvers/applyWallOpeningBacklinks.js";
import { createOpeningObjectId } from "../../../src/scopes/framing/resolvers/ids.js";
import { resolveOpenings } from "../../../src/scopes/framing/resolvers/resolveOpenings.js";
import { resolveWallFraming } from "../../../src/scopes/framing/resolvers/resolveWallFraming.js";
import { OPENING_QUANTITY_KEYS } from "../../../src/scopes/framing/validators/rule-ids.js";
import { validateOpenings } from "../../../src/scopes/framing/validators/openings.validator.js";
import { openingEvidence } from "../../fixtures/openingEvidence.js";
import { buildMixedDomainWallEvidence } from "../../fixtures/mixedDomainEvidence.js";

/**
 * Subset F — synthetic authoritative Evidence proving:
 * identity/host → claim-critical convergence → M2 candidacy → M1 registry → calculator emit.
 *
 * Not Beckstead matching rules. Beckstead freeze remains 0 opening materials.
 */
describe("M3 Subset F opening material path", () => {
  it("emits king/sill/cripple with assumption provenance for hosted authoritative openings", () => {
    const wallFraming = resolveWallFraming(buildMixedDomainWallEvidence());
    const fixtureA = "FIXTURE-OPENING-A";
    const fixtureBGeo = "opening:p1:physical-run:p1:fixture-run:gap0";
    const fixtureBSem = "FIXTURE-OPENING-B";

    const openings = resolveOpenings(
      [
        // Fixture A: hosted semantic occurrence (parentWallTag → W-001/WS-001)
        openingEvidence(
          "E-A-CAT",
          "note",
          "Fixture A window category.",
          "category",
          "window",
          fixtureA,
        ),
        openingEvidence(
          "E-A-QTY",
          "note",
          "Fixture A occurrence quantity.",
          "quantity",
          1,
          fixtureA,
        ),
        openingEvidence(
          "E-A-WALL",
          "note",
          "Fixture A host wall tag.",
          "parentWallTag",
          "W-001",
          fixtureA,
        ),
        openingEvidence(
          "E-A-ROUGH-W",
          "dimension",
          "Fixture A rough width.",
          "dimensions.roughWidthFeet",
          3.5,
          fixtureA,
        ),
        openingEvidence(
          "E-A-ROUGH-H",
          "dimension",
          "Fixture A rough height.",
          "dimensions.roughHeightFeet",
          4.5,
          fixtureA,
        ),
        openingEvidence(
          "E-A-NOM-W",
          "dimension",
          "Fixture A nominal width.",
          "dimensions.nominalWidthFeet",
          3,
          fixtureA,
        ),
        openingEvidence(
          "E-A-NOM-H",
          "dimension",
          "Fixture A nominal height.",
          "dimensions.nominalHeightFeet",
          4,
          fixtureA,
        ),
        // Fixture B: geometry survivor + explicit identity binding from semantic
        openingEvidence(
          "E-B-GEO-QTY",
          "geometry",
          "Fixture B geometry quantity.",
          "quantity",
          1,
          fixtureBGeo,
        ),
        openingEvidence(
          "E-B-GEO-RUN",
          "geometry",
          "Fixture B geometry run key that maps to W-001.",
          "parentPhysicalRunKey",
          "W-001",
          fixtureBGeo,
        ),
        openingEvidence(
          "E-B-GEO-ROUGH-W",
          "geometry",
          "Fixture B rough width.",
          "dimensions.roughWidthFeet",
          3.5,
          fixtureBGeo,
        ),
        openingEvidence(
          "E-B-SEM-CAT",
          "note",
          "Fixture B semantic category.",
          "category",
          "window",
          fixtureBSem,
        ),
        openingEvidence(
          "E-B-SEM-WALL",
          "note",
          "Fixture B semantic host.",
          "parentWallTag",
          "W-001",
          fixtureBSem,
        ),
        openingEvidence(
          "E-B-SEM-NOM-W",
          "dimension",
          "Fixture B nominal width.",
          "dimensions.nominalWidthFeet",
          3,
          fixtureBSem,
        ),
        openingEvidence(
          "E-B-SEM-NOM-H",
          "dimension",
          "Fixture B nominal height.",
          "dimensions.nominalHeightFeet",
          4,
          fixtureBSem,
        ),
        openingEvidence(
          "E-B-BIND",
          "note",
          "Explicit binding semantic → geometry.",
          "identity.boundSubjectKey",
          fixtureBGeo,
          fixtureBSem,
        ),
      ],
      { wallFraming },
    );

    const linkedWalls = applyWallOpeningBacklinks(wallFraming, openings);
    const openingA = openings.openings.find(
      (opening) => opening.id === createOpeningObjectId(fixtureA),
    );
    const openingB = openings.openings.find(
      (opening) => opening.id === createOpeningObjectId(fixtureBGeo),
    );

    assert.ok(openingA);
    assert.ok(openingB);
    assert.equal(openingA.identityRole, "occurrence");
    assert.equal(openingA.parentObjectId, "WS-001");
    assert.equal(openingA.quantity, 1);
    assert.equal(openingB.identityRole, "occurrence");
    assert.equal(openingB.category, "window");
    assert.ok(openingB.absorbedSubjectKeys.includes(fixtureBSem));
    assert.equal(openingB.parentObjectId, "WS-001");

    const parentObjectsById = new Map([
      ...linkedWalls.walls.map(
        (wall) =>
          [wall.id, { objectId: wall.id, objectType: wall.objectType }] as const,
      ),
      ...linkedWalls.segments.map(
        (segment) =>
          [
            segment.id,
            { objectId: segment.id, objectType: segment.objectType },
          ] as const,
      ),
    ]);

    const validation = validateOpenings({
      payload: openings,
      parentObjectsById,
    });

    const calculations = coordinateFramingCalculations({
      wallFraming: linkedWalls,
      openings,
      structuralMembers: { structuralMembers: [] },
      sheathing: { systems: [], areas: [] },
      floorFraming: { systems: [], areas: [] },
      roofFraming: { systems: [], planes: [] },
      validation,
    });

    const openingMaterials = calculations.materials.filter((material) =>
      String(material.quantityKey).startsWith("opening."),
    );
    const kingMaterials = openingMaterials.filter(
      (material) => material.quantityKey === OPENING_QUANTITY_KEYS.kingStuds,
    );
    const sillMaterials = openingMaterials.filter(
      (material) => material.quantityKey === OPENING_QUANTITY_KEYS.roughSill,
    );
    const crippleMaterials = openingMaterials.filter(
      (material) =>
        material.quantityKey === OPENING_QUANTITY_KEYS.cripplesAbove ||
        material.quantityKey === OPENING_QUANTITY_KEYS.cripplesBelow,
    );

    assert.ok(kingMaterials.length >= 2, "expected king studs for both fixture openings");
    assert.ok(sillMaterials.length >= 1, "expected rough sill output");
    assert.ok(crippleMaterials.length >= 1, "expected cripple output");
    assert.ok(calculations.assumptions.length > 0, "expected M1 registry assumptions");

    for (const material of kingMaterials) {
      assert.ok(
        (material.assumptionIds?.length ?? 0) > 0 ||
          material.claimStatus === "CALCULATED_WITH_ASSUMPTION" ||
          calculations.assumptions.some((assumption) =>
            (material.assumptionIds ?? []).includes(assumption.id),
          ),
        `king material ${material.id} should retain assumption provenance`,
      );
    }

    assert.ok(
      calculations.assumptions.every((assumption) => assumption.id.length > 0),
    );
  });
});
