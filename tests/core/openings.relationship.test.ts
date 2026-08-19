import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evidenceSchema } from "../../src/core/schemas/evidence.schema.js";
import { applyWallOpeningBacklinks } from "../../src/scopes/framing/resolvers/applyWallOpeningBacklinks.js";
import { resolveOpenings } from "../../src/scopes/framing/resolvers/resolveOpenings.js";
import { resolveWallFraming } from "../../src/scopes/framing/resolvers/resolveWallFraming.js";
import { validateOpenings } from "../../src/scopes/framing/validators/openings.validator.js";
import { OPENINGS_RULE_IDS } from "../../src/scopes/framing/validators/rule-ids.js";
import {
  buildCompleteOpeningEvidence,
  openingEvidence,
} from "../fixtures/openingEvidence.js";
import { buildMixedDomainWallEvidence } from "../fixtures/mixedDomainEvidence.js";

function buildWallFraming() {
  return resolveWallFraming(buildMixedDomainWallEvidence());
}

function buildParentMaps(wallFraming: ReturnType<typeof resolveWallFraming>) {
  return new Map([
    ...wallFraming.walls.map((wall) => [
      wall.id,
      { objectId: wall.id, objectType: wall.objectType },
    ] as const),
    ...wallFraming.segments.map((segment) => [
      segment.id,
      { objectId: segment.id, objectType: segment.objectType },
    ] as const),
  ]);
}

describe("opening wall relationship resolution", () => {
  it("resolves explicit O-001 → W-001 to parentWallId and parentObjectId", () => {
    const wallFraming = buildWallFraming();
    const payload = resolveOpenings(
      buildCompleteOpeningEvidence("O-001", "E-O001", {
        includeWallRelationship: true,
      }),
      { wallFraming },
    );
    const opening = payload.openings[0];

    assert.equal(opening?.parentWallId, "W-001");
    assert.equal(opening?.parentObjectId, "WS-001");
    assert.ok(
      opening?.resolutionTraces.some(
        (trace) =>
          trace.propertyPath === "parentWallTag" &&
          trace.method === "explicit-project-value",
      ),
    );
  });

  it("populates WS-001 openingIds backlink without duplicating references", () => {
    const wallFraming = buildWallFraming();
    const openings = resolveOpenings(
      buildCompleteOpeningEvidence("O-001", "E-O001", {
        includeWallRelationship: true,
      }),
      { wallFraming },
    );
    const linkedWallFraming = applyWallOpeningBacklinks(wallFraming, openings);

    assert.deepEqual(linkedWallFraming.segments[0]?.openingIds, ["O-001"]);
    const relinked = applyWallOpeningBacklinks(linkedWallFraming, openings);
    assert.deepEqual(relinked.segments[0]?.openingIds, ["O-001"]);
  });

  it("leaves relationship fields null when parentWallTag Evidence is missing", () => {
    const wallFraming = buildWallFraming();
    const payload = resolveOpenings(buildCompleteOpeningEvidence(), {
      wallFraming,
    });
    const opening = payload.openings[0];

    assert.equal(opening?.parentWallId, null);
    assert.equal(opening?.parentObjectId, null);
    assert.equal(
      opening?.resolutionTraces.some(
        (trace) => trace.propertyPath === "parentWallTag",
      ),
      false,
    );
  });

  it("preserves dangling wall references for validation instead of guessing", () => {
    const wallFraming = buildWallFraming();
    const payload = resolveOpenings(
      [
        ...buildCompleteOpeningEvidence("O-001", "E-O001", {
          includeWallRelationship: true,
        }).filter((record) => record.propertyPath !== "parentWallTag"),
        openingEvidence(
          "E-O001-WALL",
          "note",
          "Explicit dangling parent wall association.",
          "parentWallTag",
          "W-999",
        ),
      ],
      { wallFraming },
    );
    const opening = payload.openings[0];

    assert.equal(opening?.parentWallId, "W-999");
    assert.equal(opening?.parentObjectId, "WS-999");

    const validation = validateOpenings({
      payload,
      parentObjectsById: buildParentMaps(wallFraming),
    });

    assert.ok(
      validation.validationIssues.some(
        (issue) => issue.ruleId === OPENINGS_RULE_IDS.parentResolved,
      ),
    );
    assert.ok(
      validation.validationIssues.some(
        (issue) => issue.ruleId === OPENINGS_RULE_IDS.parentWallResolved,
      ),
    );
  });

  it("does not establish a relationship from conflicting parentWallTag Evidence", () => {
    const wallFraming = buildWallFraming();
    const payload = resolveOpenings(
      [
        ...buildCompleteOpeningEvidence("O-001", "E-O001").filter(
          (record) => record.propertyPath !== "parentWallTag",
        ),
        openingEvidence(
          "E-O001-WALL-A",
          "note",
          "Parent wall tag candidate A.",
          "parentWallTag",
          "W-001",
        ),
        openingEvidence(
          "E-O001-WALL-B",
          "note",
          "Parent wall tag candidate B.",
          "parentWallTag",
          "W-002",
        ),
      ],
      { wallFraming },
    );
    const opening = payload.openings[0];

    assert.equal(opening?.parentWallId, null);
    assert.equal(opening?.parentObjectId, null);
    assert.ok(
      opening?.resolutionTraces.some(
        (trace) =>
          trace.propertyPath === "parentWallTag" && trace.method === "unresolved",
      ),
    );
  });

  it("passes parent relationship validation for a linked opening", () => {
    const wallFraming = buildWallFraming();
    const payload = resolveOpenings(
      buildCompleteOpeningEvidence("O-001", "E-O001", {
        includeWallRelationship: true,
      }),
      { wallFraming },
    );
    const validation = validateOpenings({
      payload,
      parentObjectsById: buildParentMaps(wallFraming),
    });

    assert.equal(
      validation.validationResults.find(
        (entry) => entry.ruleId === OPENINGS_RULE_IDS.parentResolved,
      )?.outcome,
      "passed",
    );
    assert.equal(
      validation.validationResults.find(
        (entry) => entry.ruleId === OPENINGS_RULE_IDS.parentWallResolved,
      )?.outcome,
      "passed",
    );
    assert.equal(validation.validationIssues.length, 2);
    assert.ok(
      validation.validationIssues.some(
        (issue) => issue.ruleId === OPENINGS_RULE_IDS.kingStudCountDefault,
      ),
    );
    assert.ok(
      validation.validationIssues.some(
        (issue) => issue.ruleId === OPENINGS_RULE_IDS.roughSillSizeDefault,
      ),
    );
  });

  it("sorts openings deterministically regardless of Evidence input order", () => {
    const wallFraming = buildWallFraming();
    const evidence = [
      ...buildCompleteOpeningEvidence("O-002", "E-O002", {
        includeWallRelationship: true,
      }),
      ...buildCompleteOpeningEvidence("O-001", "E-O001", {
        includeWallRelationship: true,
      }),
    ];

    const forward = resolveOpenings(evidence, { wallFraming }).openings.map(
      (opening) => opening.id,
    );
    const reverse = resolveOpenings([...evidence].reverse(), {
      wallFraming,
    }).openings.map((opening) => opening.id);

    assert.deepEqual(forward, ["O-001", "O-002"]);
    assert.deepEqual(reverse, ["O-001", "O-002"]);
  });

  it("does not consume wall Evidence when resolving opening relationships", () => {
    const wallEvidence = buildMixedDomainWallEvidence();
    const openingOnlyEvidence = buildCompleteOpeningEvidence("O-001", "E-O001", {
      includeWallRelationship: true,
    });
    const wallFraming = resolveWallFraming(wallEvidence);
    const payload = resolveOpenings(
      [...wallEvidence, ...openingOnlyEvidence],
      { wallFraming },
    );

    assert.equal(payload.openings.length, 1);
    assert.equal(payload.openings[0]?.parentWallId, "W-001");
    assert.equal(
      payload.openings[0]?.evidenceIds.every((id) => id.startsWith("E-O001")),
      true,
    );
  });
});

describe("applyWallOpeningBacklinks", () => {
  it("does not add backlinks when parent segment does not exist on the resolved wall", () => {
    const wallFraming = buildWallFraming();
    const openings = resolveOpenings(
      [
        ...buildCompleteOpeningEvidence("O-001", "E-O001").filter(
          (record) => record.propertyPath !== "parentWallTag",
        ),
        evidenceSchema.parse({
          id: "E-O001-WALL",
          type: "note",
          relationship: "supports",
          description: "Dangling parent wall tag.",
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
            elementLabel: "O-001",
            detailNumber: null,
            sectionNumber: null,
            scheduleName: null,
            noteReference: null,
          },
          originalText: "O-001 in Wall W-999",
          references: [],
          subjectKind: "opening",
          subjectKey: "O-001",
          propertyPath: "parentWallTag",
          candidateValue: "W-999",
        }),
      ],
      { wallFraming },
    );

    const linked = applyWallOpeningBacklinks(wallFraming, openings);
    assert.deepEqual(linked.segments[0]?.openingIds, []);
  });
});
