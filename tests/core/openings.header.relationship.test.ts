import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applyWallOpeningBacklinks } from "../../src/scopes/framing/resolvers/applyWallOpeningBacklinks.js";
import { linkOpeningHeaderRelationships } from "../../src/scopes/framing/resolvers/linkOpeningHeaderRelationships.js";
import { resolveOpenings } from "../../src/scopes/framing/resolvers/resolveOpenings.js";
import { resolveStructuralMembers } from "../../src/scopes/framing/resolvers/resolveStructuralMembers.js";
import { resolveWallFraming } from "../../src/scopes/framing/resolvers/resolveWallFraming.js";
import { validateOpenings } from "../../src/scopes/framing/validators/openings.validator.js";
import { validateStructuralMembers } from "../../src/scopes/framing/validators/structural-members.validator.js";
import {
  OPENINGS_RULE_IDS,
  STRUCTURAL_MEMBER_RULE_IDS,
} from "../../src/scopes/framing/validators/rule-ids.js";
import {
  buildMixedDomainHeaderEvidence,
  buildMixedDomainWallEvidence,
  memberEvidence,
} from "../fixtures/mixedDomainEvidence.js";
import {
  buildCompleteOpeningEvidence,
  openingEvidence,
} from "../fixtures/openingEvidence.js";

function buildLinkedDomainState(options?: {
  includeOpeningRelationship?: boolean;
  includeWallRelationship?: boolean;
  includeHeaderRelationship?: boolean;
}) {
  const wallFraming = resolveWallFraming(buildMixedDomainWallEvidence());
  const openings = resolveOpenings(
    buildCompleteOpeningEvidence("O-001", "E-O001", {
      includeWallRelationship: options?.includeWallRelationship ?? true,
      includeHeaderRelationship: options?.includeHeaderRelationship ?? false,
    }),
    { wallFraming },
  );
  const linkedWallFraming = applyWallOpeningBacklinks(wallFraming, openings);
  const structuralMembers = resolveStructuralMembers(
    buildMixedDomainHeaderEvidence({
      includeOpeningRelationship: options?.includeOpeningRelationship ?? true,
    }),
  );

  return linkOpeningHeaderRelationships(
    [
      ...buildMixedDomainWallEvidence(),
      ...buildCompleteOpeningEvidence("O-001", "E-O001", {
        includeWallRelationship: options?.includeWallRelationship ?? true,
        includeHeaderRelationship: options?.includeHeaderRelationship ?? false,
      }),
      ...buildMixedDomainHeaderEvidence({
        includeOpeningRelationship: options?.includeOpeningRelationship ?? true,
      }),
    ],
    openings,
    structuralMembers,
  );
}

describe("opening header relationship resolution", () => {
  it("resolves explicit HDR-001 at O-001 to headerMemberId and supportedObjectIds", () => {
    const linked = buildLinkedDomainState();
    const opening = linked.openings.openings[0];
    const member = linked.structuralMembers.structuralMembers[0];

    assert.equal(opening?.headerMemberId, "SM-HDR-001");
    assert.deepEqual(member?.supportedObjectIds, ["O-001"]);
  });

  it("resolves opening-side headerMemberTag to SM-HDR-001", () => {
    const linked = buildLinkedDomainState({
      includeOpeningRelationship: false,
      includeHeaderRelationship: true,
    });
    const opening = linked.openings.openings[0];
    const member = linked.structuralMembers.structuralMembers[0];

    assert.equal(opening?.headerMemberId, "SM-HDR-001");
    assert.deepEqual(member?.supportedObjectIds, ["O-001"]);
  });

  it("leaves headerMemberId null when relationship Evidence is missing", () => {
    const linked = buildLinkedDomainState({
      includeOpeningRelationship: false,
      includeHeaderRelationship: false,
    });

    assert.equal(linked.openings.openings[0]?.headerMemberId, null);
    assert.deepEqual(
      linked.structuralMembers.structuralMembers[0]?.supportedObjectIds,
      [],
    );
  });

  it("preserves dangling header references for validation instead of guessing", () => {
    const wallFraming = resolveWallFraming(buildMixedDomainWallEvidence());
    const openings = resolveOpenings(
      [
        ...buildCompleteOpeningEvidence("O-001", "E-O001", {
          includeWallRelationship: true,
        }),
        openingEvidence(
          "E-O001-HEADER",
          "note",
          "Explicit dangling header association.",
          "headerMemberTag",
          "HDR-999",
        ),
      ],
      { wallFraming },
    );
    const structuralMembers = resolveStructuralMembers(buildMixedDomainHeaderEvidence());

    const linked = linkOpeningHeaderRelationships(
      [
        ...buildMixedDomainWallEvidence(),
        ...buildCompleteOpeningEvidence("O-001", "E-O001", {
          includeWallRelationship: true,
        }),
        openingEvidence(
          "E-O001-HEADER",
          "note",
          "Explicit dangling header association.",
          "headerMemberTag",
          "HDR-999",
        ),
        ...buildMixedDomainHeaderEvidence(),
      ],
      openings,
      structuralMembers,
    );

    assert.equal(linked.openings.openings[0]?.headerMemberId, "SM-HDR-999");

    const validation = validateOpenings({
      payload: linked.openings,
      structuralMembersById: new Map(
        linked.structuralMembers.structuralMembers.map((member) => [
          member.id,
          { objectId: member.id, objectType: member.objectType },
        ]),
      ),
    });

    assert.ok(
      validation.validationIssues.some(
        (issue) => issue.ruleId === OPENINGS_RULE_IDS.headerReferenceResolved,
      ),
    );
  });

  it("does not establish a relationship from conflicting headerMemberTag Evidence", () => {
    const linked = linkOpeningHeaderRelationships(
      [
        ...buildMixedDomainWallEvidence(),
        ...buildCompleteOpeningEvidence("O-001", "E-O001", {
          includeWallRelationship: true,
        }),
        openingEvidence(
          "E-O001-HEADER-A",
          "note",
          "Header tag candidate A.",
          "headerMemberTag",
          "HDR-001",
        ),
        openingEvidence(
          "E-O001-HEADER-B",
          "note",
          "Header tag candidate B.",
          "headerMemberTag",
          "HDR-002",
        ),
        ...buildMixedDomainHeaderEvidence(),
      ],
      resolveOpenings(
        buildCompleteOpeningEvidence("O-001", "E-O001", {
          includeWallRelationship: true,
        }),
        { wallFraming: resolveWallFraming(buildMixedDomainWallEvidence()) },
      ),
      resolveStructuralMembers(buildMixedDomainHeaderEvidence()),
    );

    assert.equal(linked.openings.openings[0]?.headerMemberId, null);
    assert.ok(
      linked.openings.openings[0]?.resolutionTraces.some(
        (trace) =>
          trace.propertyPath === "headerMemberTag" && trace.method === "unresolved",
      ),
    );
  });

  it("passes header relationship validation for a linked opening", () => {
    const linked = buildLinkedDomainState();
    const validation = validateOpenings({
      payload: linked.openings,
      structuralMembersById: new Map(
        linked.structuralMembers.structuralMembers.map((member) => [
          member.id,
          { objectId: member.id, objectType: member.objectType },
        ]),
      ),
    });

    assert.equal(
      validation.validationResults.find(
        (entry) => entry.ruleId === OPENINGS_RULE_IDS.headerReferenceResolved,
      )?.outcome,
      "passed",
    );
  });

  it("passes supported object validation for a linked header", () => {
    const linked = buildLinkedDomainState();
    const validation = validateStructuralMembers({
      payload: linked.structuralMembers,
      relatedObjectsById: new Map(
        linked.openings.openings.map((opening) => [
          opening.id,
          { objectId: opening.id, objectType: opening.objectType },
        ]),
      ),
    });

    assert.equal(
      validation.validationResults.find(
        (entry) =>
          entry.ruleId === STRUCTURAL_MEMBER_RULE_IDS.supportedObjectsResolved,
      )?.outcome,
      "passed",
    );
  });

  it("does not duplicate supportedObjectIds when links are applied twice", () => {
    const linked = buildLinkedDomainState();
    const relinked = linkOpeningHeaderRelationships(
      [
        ...buildMixedDomainWallEvidence(),
        ...buildCompleteOpeningEvidence("O-001", "E-O001", {
          includeWallRelationship: true,
        }),
        ...buildMixedDomainHeaderEvidence({ includeOpeningRelationship: true }),
      ],
      linked.openings,
      linked.structuralMembers,
    );

    assert.deepEqual(
      relinked.structuralMembers.structuralMembers[0]?.supportedObjectIds,
      ["O-001"],
    );
  });

  it("does not consume opening Evidence when resolving member-side relationships", () => {
    const linked = buildLinkedDomainState();
    assert.equal(
      linked.structuralMembers.structuralMembers[0]?.evidenceIds.every((id) =>
        id.startsWith("E-HDR"),
      ),
      true,
    );
  });
});

describe("member-side supportedOpeningTag resolution", () => {
  it("does not add backlinks when the supported opening segment does not exist", () => {
    const linked = linkOpeningHeaderRelationships(
      [
        ...buildMixedDomainHeaderEvidence(),
        memberEvidence(
          "E-HDR-001-OPENING",
          "note",
          "Dangling supported opening tag.",
          "supportedOpeningTag",
          "O-999",
        ),
      ],
      { openings: [] },
      resolveStructuralMembers(buildMixedDomainHeaderEvidence()),
    );

    assert.deepEqual(
      linked.structuralMembers.structuralMembers[0]?.supportedObjectIds,
      ["O-999"],
    );
  });
});
