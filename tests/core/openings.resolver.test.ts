import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evidenceSchema } from "../../src/core/schemas/evidence.schema.js";
import { createOpeningObjectId } from "../../src/scopes/framing/resolvers/ids.js";
import { resolveOpenings } from "../../src/scopes/framing/resolvers/resolveOpenings.js";
import { resolveStructuralMembers } from "../../src/scopes/framing/resolvers/resolveStructuralMembers.js";
import { resolveWallFraming } from "../../src/scopes/framing/resolvers/resolveWallFraming.js";
import { validateOpenings } from "../../src/scopes/framing/validators/openings.validator.js";
import { OPENINGS_RULE_IDS } from "../../src/scopes/framing/validators/rule-ids.js";
import {
  buildCompleteOpeningEvidence,
  openingEvidence,
} from "../fixtures/openingEvidence.js";
import { buildMixedDomainWallEvidence } from "../fixtures/mixedDomainEvidence.js";

function memberEvidence(subjectKey: string, overrides: Record<string, unknown>) {
  return evidenceSchema.parse({
    id: "E-MEMBER-PROP",
    type: "note",
    relationship: "supports",
    description: "Extracted structural member candidate.",
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
    originalText: `${subjectKey} fixture line`,
    references: [],
    subjectKind: "structural-member",
    subjectKey,
    propertyPath: "category",
    candidateValue: "header",
    ...overrides,
  });
}

describe("resolveOpenings", () => {
  it("resolves a complete opening from explicit Evidence", () => {
    const payload = resolveOpenings(buildCompleteOpeningEvidence());
    const opening = payload.openings[0];

    assert.equal(payload.openings.length, 1);
    assert.equal(opening?.id, "O-001");
    assert.equal(opening?.category, "window");
    assert.equal(opening?.dimensions.nominalWidthFeet, 3);
    assert.equal(opening?.dimensions.nominalHeightFeet, 4);
    assert.equal(opening?.dimensions.roughWidthFeet, 3.5);
    assert.equal(opening?.dimensions.roughHeightFeet, 4.5);
    assert.equal(opening?.quantity, 1);
    assert.equal(opening?.scheduleReference, "Window Schedule");
    assert.equal(opening?.detailReference, "A-501");
    assert.equal(opening?.fireRating, "20 min");
    assert.equal(opening?.parentObjectId, null);
    assert.equal(opening?.parentWallId, null);
    assert.equal(opening?.headerMemberId, null);
    assert.equal(opening?.kingStudCount, null);
    assert.equal(opening?.completion.status, "complete");
    assert.equal(opening?.completion.completedItems, 6);
    assert.equal(opening?.completion.totalItems, 6);
  });

  it("preserves a partially unresolved opening instead of dropping it", () => {
    const payload = resolveOpenings(
      buildCompleteOpeningEvidence().filter(
        (record) =>
          record.propertyPath !== "quantity" &&
          record.propertyPath !== "dimensions.roughWidthFeet",
      ),
    );
    const opening = payload.openings[0];

    assert.equal(payload.openings.length, 1);
    assert.equal(opening?.quantity, null);
    assert.equal(opening?.dimensions.roughWidthFeet, null);
    assert.equal(opening?.category, "window");
    assert.equal(opening?.completion.status, "partial");
    assert.equal(opening?.completion.completedItems, 4);
  });

  it("does not default missing quantity to 1", () => {
    const payload = resolveOpenings(
      buildCompleteOpeningEvidence().filter(
        (record) => record.propertyPath !== "quantity",
      ),
    );

    assert.equal(payload.openings[0]?.quantity, null);
  });

  it("leaves unresolved category as unknown", () => {
    const payload = resolveOpenings(
      buildCompleteOpeningEvidence().filter(
        (record) => record.propertyPath !== "category",
      ),
    );

    assert.equal(payload.openings[0]?.category, "unknown");
  });

  it("corroborates identical candidates into one resolved value", () => {
    const payload = resolveOpenings([
      openingEvidence(
        "E-O001-NOM-WIDTH-A",
        "dimension",
        "Nominal width on plan.",
        "dimensions.nominalWidthFeet",
        3,
      ),
      openingEvidence(
        "E-O001-NOM-WIDTH-B",
        "schedule",
        "Nominal width on schedule.",
        "dimensions.nominalWidthFeet",
        3,
      ),
    ]);
    const opening = payload.openings[0];
    const trace = opening?.resolutionTraces.find(
      (entry) => entry.propertyPath === "dimensions.nominalWidthFeet",
    );

    assert.equal(opening?.dimensions.nominalWidthFeet, 3);
    assert.equal(trace?.method, "explicit-project-value");
    assert.deepEqual(trace?.evidenceIds, ["E-O001-NOM-WIDTH-A", "E-O001-NOM-WIDTH-B"]);
  });

  it("marks conflicting candidates unresolved without choosing a winner", () => {
    const payload = resolveOpenings([
      openingEvidence(
        "E-O001-NOM-WIDTH-A",
        "dimension",
        "Nominal width candidate A.",
        "dimensions.nominalWidthFeet",
        3,
      ),
      openingEvidence(
        "E-O001-NOM-WIDTH-B",
        "schedule",
        "Nominal width candidate B.",
        "dimensions.nominalWidthFeet",
        4,
      ),
    ]);
    const opening = payload.openings[0];
    const trace = opening?.resolutionTraces.find(
      (entry) => entry.propertyPath === "dimensions.nominalWidthFeet",
    );

    assert.equal(opening?.dimensions.nominalWidthFeet, null);
    assert.equal(trace?.method, "unresolved");
    assert.match(trace?.explanation ?? "", /Conflicting candidate values/);
  });

  it("does not count optional references toward completion", () => {
    const payload = resolveOpenings(
      buildCompleteOpeningEvidence().filter(
        (record) =>
          !["scheduleReference", "detailReference", "fireRating"].includes(
            record.propertyPath,
          ),
      ),
    );

    assert.equal(payload.openings[0]?.completion.status, "complete");
    assert.equal(payload.openings[0]?.scheduleReference, null);
  });

  it("sorts openings by ObjectId deterministically", () => {
    const payload = resolveOpenings([
      ...buildCompleteOpeningEvidence("O-002", "E-O002"),
      ...buildCompleteOpeningEvidence("O-001", "E-O001"),
    ]);

    assert.deepEqual(
      payload.openings.map((opening) => opening.id),
      ["O-001", "O-002"],
    );
  });

  it("throws when distinct subjectKeys sanitize to the same Opening ObjectId", () => {
    assert.throws(
      () =>
        resolveOpenings([
          ...buildCompleteOpeningEvidence("O 001", "E-O-A"),
          ...buildCompleteOpeningEvidence("O-001", "E-O-B"),
        ]),
      /both resolve to Opening ObjectId O-001/,
    );
  });

  it("does not mutate input Evidence", () => {
    const evidence = buildCompleteOpeningEvidence();
    const snapshot = structuredClone(evidence);
    resolveOpenings(evidence);
    assert.deepEqual(evidence, snapshot);
  });

  it("isolates opening Evidence from wall and structural-member resolvers", () => {
    const sharedSubjectKey = "W-001";
    const evidence = [
      ...buildMixedDomainWallEvidence(),
      ...buildCompleteOpeningEvidence(sharedSubjectKey, "E-OPEN-W001"),
      memberEvidence(sharedSubjectKey, {
        id: "E-SM-W001-CATEGORY",
        propertyPath: "category",
        candidateValue: "header",
      }),
      memberEvidence(sharedSubjectKey, {
        id: "E-SM-W001-LENGTH",
        propertyPath: "lengthFeet",
        candidateValue: 6,
      }),
    ];

    const walls = resolveWallFraming(evidence);
    const openings = resolveOpenings(evidence);
    const members = resolveStructuralMembers(evidence);

    assert.equal(walls.walls.length, 1);
    assert.equal(walls.walls[0]?.id, "W-001");
    assert.equal(openings.openings.length, 1);
    assert.equal(openings.openings[0]?.id, "O-W-001");
    assert.equal(members.structuralMembers.length, 1);
    assert.equal(members.structuralMembers[0]?.id, "SM-W-001");
    assert.equal(walls.segments[0]?.openingIds.length, 0);
  });

  it("passes validation for independent openings with null parentObjectId", () => {
    const payload = resolveOpenings(buildCompleteOpeningEvidence());
    const validation = validateOpenings({ payload });

    const parentResult = validation.validationResults.find(
      (entry) => entry.ruleId === OPENINGS_RULE_IDS.parentResolved,
    );

    assert.equal(parentResult?.outcome, "passed");
    assert.equal(validation.validationIssues.length, 0);
    assert.equal(validation.reviewItems.length, 0);
  });

  it("resolves explicit kingStudCount from Evidence", () => {
    const payload = resolveOpenings([
      ...buildCompleteOpeningEvidence(),
      openingEvidence(
        "E-O001-KING",
        "note",
        "Explicit king stud count.",
        "kingStudCount",
        3,
      ),
    ]);
    const opening = payload.openings[0];

    assert.equal(opening?.kingStudCount, 3);
    const trace = opening?.resolutionTraces.find(
      (entry) => entry.propertyPath === "kingStudCount",
    );
    assert.equal(trace?.method, "explicit-project-value");
    assert.deepEqual(trace?.evidenceIds, ["E-O001-KING"]);
  });

  it("resolves explicit jackStudCount and leaves missing count null", () => {
    const withJack = resolveOpenings([
      ...buildCompleteOpeningEvidence(),
      openingEvidence(
        "E-O001-JACK",
        "note",
        "Explicit jack stud count.",
        "jackStudCount",
        2,
      ),
    ]);
    assert.equal(withJack.openings[0]?.jackStudCount, 2);

    const withoutJack = resolveOpenings(buildCompleteOpeningEvidence());
    assert.equal(withoutJack.openings[0]?.jackStudCount, null);
  });

  it("marks conflicting jackStudCount unresolved", () => {
    const payload = resolveOpenings([
      ...buildCompleteOpeningEvidence(),
      openingEvidence("E-O001-JACK-A", "note", "Jack count A.", "jackStudCount", 2),
      openingEvidence("E-O001-JACK-B", "note", "Jack count B.", "jackStudCount", 4),
    ]);
    assert.equal(payload.openings[0]?.jackStudCount, null);
    const trace = payload.openings[0]?.resolutionTraces.find(
      (entry) => entry.propertyPath === "jackStudCount",
    );
    assert.equal(trace?.method, "unresolved");
  });
});

describe("createOpeningObjectId", () => {
  it("maps O-001 to O-001", () => {
    assert.equal(createOpeningObjectId("O-001"), "O-001");
  });

  it("prefixes non-O tags with O-", () => {
    assert.equal(createOpeningObjectId("WIN-12"), "O-WIN-12");
  });
});
