import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveOpenings } from "../../../src/scopes/framing/resolvers/resolveOpenings.js";
import { resolveWallFraming } from "../../../src/scopes/framing/resolvers/resolveWallFraming.js";
import { admitMaterialClaimCandidate } from "../../../src/scopes/framing/claims/admitMaterialClaimCandidate.js";
import { OPENING_QUANTITY_KEYS } from "../../../src/scopes/framing/validators/rule-ids.js";
import { createOpeningObjectId } from "../../../src/scopes/framing/resolvers/ids.js";
import { openingEvidence } from "../../fixtures/openingEvidence.js";
import { buildMixedDomainWallEvidence } from "../../fixtures/mixedDomainEvidence.js";

function geometrySubject(runKey: string, gapIndex: number): string {
  return `opening:p1:${runKey}:gap${gapIndex}`;
}

describe("M3 opening identity convergence", () => {
  it("merges geometry and semantic subjects only with explicit identity.boundSubjectKey", () => {
    const runKey = "physical-run:p1:fixture-run";
    const geoKey = geometrySubject(runKey, 0);
    const semanticKey = "3068-DINING";

    const payload = resolveOpenings(
      [
        openingEvidence(
          "E-GEO-CAT",
          "geometry",
          "Geometry category placeholder unknown (ignored for authority).",
          "category",
          "unknown",
          geoKey,
        ),
        openingEvidence(
          "E-GEO-QTY",
          "geometry",
          "Geometry occurrence quantity.",
          "quantity",
          1,
          geoKey,
        ),
        openingEvidence(
          "E-GEO-RUN",
          "geometry",
          "Geometry parent run.",
          "parentPhysicalRunKey",
          runKey,
          geoKey,
        ),
        openingEvidence(
          "E-SEM-CAT",
          "note",
          "Semantic door category.",
          "category",
          "door",
          semanticKey,
        ),
        openingEvidence(
          "E-BIND",
          "note",
          "Explicit identity binding from semantic to geometry.",
          "identity.boundSubjectKey",
          geoKey,
          semanticKey,
        ),
      ],
      { wallFraming: resolveWallFraming(buildMixedDomainWallEvidence()) },
    );

    assert.equal(payload.openings.length, 1);
    const opening = payload.openings[0]!;
    assert.equal(opening.id, createOpeningObjectId(geoKey));
    assert.equal(opening.category, "door");
    assert.equal(opening.identityRole, "occurrence");
    assert.ok(opening.absorbedSubjectKeys.includes(semanticKey));
    assert.ok(
      opening.resolutionTraces.some(
        (trace) =>
          trace.propertyPath === "physicalIdentity" &&
          trace.method === "identity-binding-merge",
      ),
    );
    assert.ok(opening.evidenceIds.includes("E-BIND"));
    assert.ok(opening.evidenceIds.includes("E-SEM-CAT"));
  });

  it("keeps schedule definition and multiple physical occurrences separate", () => {
    const definitionKey = "3068-SELF-CLOSING-SOLID-CORE-DR";
    const occA = geometrySubject("physical-run:p1:fixture-run", 0);
    const occB = geometrySubject("physical-run:p1:fixture-run", 1);

    const payload = resolveOpenings([
      openingEvidence(
        "E-DEF-ROLE",
        "schedule",
        "Schedule row is a type definition.",
        "identityRole",
        "schedule_definition",
        definitionKey,
      ),
      openingEvidence(
        "E-DEF-CAT",
        "schedule",
        "Definition category.",
        "category",
        "door",
        definitionKey,
      ),
      openingEvidence(
        "E-DEF-REF",
        "schedule",
        "Definition schedule reference.",
        "scheduleReference",
        "SELF CLOSING SOLID CORE DR",
        definitionKey,
      ),
      openingEvidence(
        "E-A-CAT",
        "geometry",
        "Occurrence A category.",
        "category",
        "door",
        occA,
      ),
      openingEvidence(
        "E-A-QTY",
        "geometry",
        "Occurrence A quantity.",
        "quantity",
        1,
        occA,
      ),
      openingEvidence(
        "E-A-RUN",
        "geometry",
        "Occurrence A run.",
        "parentPhysicalRunKey",
        "physical-run:p1:fixture-run",
        occA,
      ),
      openingEvidence(
        "E-A-REF",
        "note",
        "Occurrence A schedule reference.",
        "scheduleReference",
        "SELF CLOSING SOLID CORE DR",
        occA,
      ),
      openingEvidence(
        "E-B-CAT",
        "geometry",
        "Occurrence B category.",
        "category",
        "door",
        occB,
      ),
      openingEvidence(
        "E-B-QTY",
        "geometry",
        "Occurrence B quantity.",
        "quantity",
        1,
        occB,
      ),
      openingEvidence(
        "E-B-RUN",
        "geometry",
        "Occurrence B run.",
        "parentPhysicalRunKey",
        "physical-run:p1:fixture-run",
        occB,
      ),
      openingEvidence(
        "E-B-REF",
        "note",
        "Occurrence B schedule reference.",
        "scheduleReference",
        "SELF CLOSING SOLID CORE DR",
        occB,
      ),
    ]);

    assert.equal(payload.openings.length, 3);
    const definition = payload.openings.find(
      (opening) => opening.id === createOpeningObjectId(definitionKey),
    );
    assert.equal(definition?.identityRole, "schedule_definition");
    assert.equal(definition?.quantity, null);

    const admission = admitMaterialClaimCandidate({
      quantityKey: OPENING_QUANTITY_KEYS.kingStuds,
      objectId: definition!.id,
      objectType: "opening",
      context: {
        openingCategoryById: new Map([[definition!.id, definition!.category]]),
        openingIdentityRoleById: new Map([
          [definition!.id, definition!.identityRole],
        ]),
      },
    });
    assert.equal(admission.admitted, false);
    if (!admission.admitted) {
      assert.equal(admission.reason, "non_occurrence_identity");
    }
  });

  it("does not merge when competing identity.boundSubjectKey targets exist", () => {
    const geoA = geometrySubject("physical-run:p1:fixture-run", 0);
    const geoB = geometrySubject("physical-run:p1:fixture-run", 1);
    const semanticKey = "3068-DINING";

    const payload = resolveOpenings([
      openingEvidence("E-A", "geometry", "Gap A", "category", "unknown", geoA),
      openingEvidence("E-B", "geometry", "Gap B", "category", "unknown", geoB),
      openingEvidence(
        "E-SEM",
        "note",
        "Semantic category",
        "category",
        "door",
        semanticKey,
      ),
      openingEvidence(
        "E-BIND-A",
        "note",
        "Competing bind A",
        "identity.boundSubjectKey",
        geoA,
        semanticKey,
      ),
      openingEvidence(
        "E-BIND-B",
        "note",
        "Competing bind B",
        "identity.boundSubjectKey",
        geoB,
        semanticKey,
      ),
    ]);

    assert.equal(payload.openings.length, 3);
    assert.equal(
      payload.openings.every((opening) => opening.absorbedSubjectKeys.length === 0),
      true,
    );
    const semantic = payload.openings.find(
      (opening) => opening.id === createOpeningObjectId(semanticKey),
    );
    assert.ok(
      semantic?.resolutionTraces.some(
        (trace) =>
          trace.propertyPath === "physicalIdentity" &&
          trace.method === "unresolved",
      ),
    );
  });

  it("leaves conflicting dimensions unresolved after an authoritative merge", () => {
    const runKey = "physical-run:p1:fixture-run";
    const geoKey = geometrySubject(runKey, 0);
    const semanticKey = "3050-DINING";

    const payload = resolveOpenings([
      openingEvidence(
        "E-GEO-W",
        "geometry",
        "Geometry rough width.",
        "dimensions.roughWidthFeet",
        3,
        geoKey,
      ),
      openingEvidence(
        "E-SEM-W",
        "dimension",
        "Semantic rough width conflict.",
        "dimensions.roughWidthFeet",
        4,
        semanticKey,
      ),
      openingEvidence(
        "E-BIND",
        "note",
        "Explicit binding.",
        "identity.boundSubjectKey",
        geoKey,
        semanticKey,
      ),
    ]);

    assert.equal(payload.openings.length, 1);
    assert.equal(payload.openings[0]?.dimensions.roughWidthFeet, null);
    assert.ok(
      payload.openings[0]?.resolutionTraces.some(
        (trace) =>
          trace.propertyPath === "dimensions.roughWidthFeet" &&
          trace.method === "unresolved",
      ),
    );
  });

  it("classifies unhosted semantic marks as unresolved_identity without inventing hosts", () => {
    const payload = resolveOpenings([
      openingEvidence(
        "E-SEM-CAT",
        "note",
        "Door mark category.",
        "category",
        "door",
        "3068-FOYER",
      ),
    ]);

    assert.equal(payload.openings.length, 1);
    assert.equal(payload.openings[0]?.identityRole, "unresolved_identity");
    assert.equal(payload.openings[0]?.parentObjectId, null);
    assert.equal(payload.openings[0]?.quantity, null);
  });

  it("keeps geometry-only openings as occurrences without inventing category", () => {
    const geoKey = geometrySubject("physical-run:p1:fixture-run", 0);
    const payload = resolveOpenings([
      openingEvidence(
        "E-GEO-QTY",
        "geometry",
        "Gap quantity.",
        "quantity",
        1,
        geoKey,
      ),
      openingEvidence(
        "E-GEO-RUN",
        "geometry",
        "Gap run.",
        "parentPhysicalRunKey",
        "physical-run:p1:fixture-run",
        geoKey,
      ),
    ]);

    assert.equal(payload.openings.length, 1);
    assert.equal(payload.openings[0]?.identityRole, "occurrence");
    assert.equal(payload.openings[0]?.category, "unknown");
  });

  it("does not merge geometry and semantic without binding Evidence", () => {
    const geoKey = geometrySubject("physical-run:p1:fixture-run", 0);
    const payload = resolveOpenings([
      openingEvidence("E-GEO", "geometry", "Gap", "quantity", 1, geoKey),
      openingEvidence(
        "E-SEM",
        "note",
        "Semantic",
        "category",
        "door",
        "3068-DINING",
      ),
    ]);

    assert.equal(payload.openings.length, 2);
  });
});
