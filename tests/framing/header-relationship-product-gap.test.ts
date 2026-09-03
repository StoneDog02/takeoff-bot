import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evidenceSchema } from "../../src/core/schemas/evidence.schema.js";
import { linkOpeningHeaderRelationships } from "../../src/framing/resolve/linkOpeningHeaderRelationships.js";
import { resolveOpenings } from "../../src/framing/resolve/resolveOpenings.js";
import { resolveStructuralMembers } from "../../src/framing/resolve/resolveStructuralMembers.js";
import { resolveWallFraming } from "../../src/framing/resolve/resolveWallFraming.js";

/**
 * Characterizes the known product gap:
 * - linker can map headerMemberTag → headerMemberId
 * - production read path does not call the linker, so headerMemberId stays null
 */
function evidence(input: {
  id: string;
  subjectKind: "opening" | "structural-member";
  subjectKey: string;
  propertyPath: string;
  candidateValue: string;
}) {
  return evidenceSchema.parse({
    id: input.id,
    type: "note",
    relationship: "supports",
    description: "header relationship fixture",
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
      elementLabel: null,
      detailNumber: null,
      sectionNumber: null,
      scheduleName: null,
      noteReference: null,
    },
    originalText: String(input.candidateValue),
    references: [],
    subjectKind: input.subjectKind,
    subjectKey: input.subjectKey,
    propertyPath: input.propertyPath,
    candidateValue: input.candidateValue,
  });
}

describe("header → opening relationship product gap", () => {
  it("preserves linker intelligence that maps headerMemberTag to headerMemberId", () => {
    const records = [
      evidence({
        id: "E-O1-TYPE",
        subjectKind: "opening",
        subjectKey: "O-001",
        propertyPath: "openingType",
        candidateValue: "window",
      }),
      evidence({
        id: "E-O1-HDR",
        subjectKind: "opening",
        subjectKey: "O-001",
        propertyPath: "headerMemberTag",
        candidateValue: "HDR-001",
      }),
      evidence({
        id: "E-HDR-MARK",
        subjectKind: "structural-member",
        subjectKey: "HDR-001",
        propertyPath: "mark",
        candidateValue: "HDR-001",
      }),
      evidence({
        id: "E-HDR-SIZE",
        subjectKind: "structural-member",
        subjectKey: "HDR-001",
        propertyPath: "size",
        candidateValue: "2x10",
      }),
    ];

    const openings = resolveOpenings([...records]);
    const members = resolveStructuralMembers([...records]);
    assert.equal(openings.openings[0]?.headerMemberId, null);

    const linked = linkOpeningHeaderRelationships(records, openings, members);
    assert.notEqual(linked.openings.openings[0]?.headerMemberId, null);
  });

  it("documents that production resolveOpenings leaves headerMemberId null (linker not wired)", () => {
    const records = [
      evidence({
        id: "E-O1-TYPE",
        subjectKind: "opening",
        subjectKey: "O-001",
        propertyPath: "openingType",
        candidateValue: "window",
      }),
      evidence({
        id: "E-O1-HDR",
        subjectKind: "opening",
        subjectKey: "O-001",
        propertyPath: "headerMemberTag",
        candidateValue: "HDR-001",
      }),
      evidence({
        id: "E-HDR-MARK",
        subjectKind: "structural-member",
        subjectKey: "HDR-001",
        propertyPath: "mark",
        candidateValue: "HDR-001",
      }),
    ];

    const walls = resolveWallFraming([]);
    const openings = resolveOpenings([...records], { wallFraming: walls });
    assert.equal(openings.openings[0]?.headerMemberId, null);
  });
});
