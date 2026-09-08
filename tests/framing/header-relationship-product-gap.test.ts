import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evidenceSchema } from "../../src/core/schemas/evidence.schema.js";
import { buildFramingConstructionFromEvidence } from "../../src/framing/read/readFramingPlans.js";
import { linkOpeningHeaderRelationships } from "../../src/framing/resolve/linkOpeningHeaderRelationships.js";
import { resolveOpenings } from "../../src/framing/resolve/resolveOpenings.js";
import { resolveStructuralMembers } from "../../src/framing/resolve/resolveStructuralMembers.js";

function evidence(input: {
  id: string;
  subjectKind: "opening" | "structural-member";
  subjectKey: string;
  propertyPath: string;
  candidateValue: string | number;
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

describe("header → opening relationship linker", () => {
  it("maps headerMemberTag to headerMemberId", () => {
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

  it("wires the linker on the production construction path", () => {
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

    const construction = buildFramingConstructionFromEvidence(records);
    assert.notEqual(construction.openings.openings[0]?.headerMemberId, null);
  });

  it("maps unprefixed garage opening headerMemberTag to existing SM ObjectId", () => {
    const records = [
      evidence({
        id: "E-GDO-CAT",
        subjectKind: "opening",
        subjectKey: "GARAGE-DOOR-OPENING-p3",
        propertyPath: "category",
        candidateValue: "garage-door",
      }),
      evidence({
        id: "E-GDO-HDR",
        subjectKind: "opening",
        subjectKey: "GARAGE-DOOR-OPENING-p3",
        propertyPath: "headerMemberTag",
        candidateValue: "WB2-11.88LVL",
      }),
      evidence({
        id: "E-WB2-CAT",
        subjectKind: "structural-member",
        subjectKey: "WB2-11.88LVL",
        propertyPath: "category",
        candidateValue: "header",
      }),
      evidence({
        id: "E-WB2-SIZE",
        subjectKind: "structural-member",
        subjectKey: "WB2-11.88LVL",
        propertyPath: "size",
        candidateValue: "(2)-1.75x11.875",
      }),
      evidence({
        id: "E-WB2-LEN",
        subjectKind: "structural-member",
        subjectKey: "WB2-11.88LVL",
        propertyPath: "lengthFeet",
        candidateValue: 23.5,
      }),
    ];

    const openings = resolveOpenings([...records]);
    const members = resolveStructuralMembers([...records]);
    const garage = openings.openings.find(
      (opening) => opening.id === "O-GARAGE-DOOR-OPENING-p3",
    );
    const header = members.structuralMembers.find(
      (member) => member.id === "SM-WB2-11.88LVL",
    );
    assert.ok(garage);
    assert.ok(header);
    assert.equal(garage.headerMemberId, null);

    const linked = linkOpeningHeaderRelationships(records, openings, members);
    const linkedGarage = linked.openings.openings.find(
      (opening) => opening.id === "O-GARAGE-DOOR-OPENING-p3",
    );
    assert.equal(linkedGarage?.headerMemberId, "SM-WB2-11.88LVL");
    assert.equal(
      linked.structuralMembers.structuralMembers.find(
        (member) => member.id === "SM-WB2-11.88LVL",
      )?.supportedObjectIds.includes("O-GARAGE-DOOR-OPENING-p3"),
      true,
    );
  });

  it("leaves headerMemberId null when headerMemberTag has no matching SM", () => {
    const records = [
      evidence({
        id: "E-GDO-CAT",
        subjectKind: "opening",
        subjectKey: "GARAGE-DOOR-OPENING-p3",
        propertyPath: "category",
        candidateValue: "garage-door",
      }),
      evidence({
        id: "E-GDO-HDR",
        subjectKind: "opening",
        subjectKey: "GARAGE-DOOR-OPENING-p3",
        propertyPath: "headerMemberTag",
        candidateValue: "WB2-11.88LVL",
      }),
    ];

    const openings = resolveOpenings([...records]);
    const members = resolveStructuralMembers([...records]);
    assert.equal(members.structuralMembers.length, 0);

    const linked = linkOpeningHeaderRelationships(records, openings, members);
    const linkedGarage = linked.openings.openings.find(
      (opening) => opening.id === "O-GARAGE-DOOR-OPENING-p3",
    );
    assert.equal(linkedGarage?.headerMemberId, null);
    assert.equal(linked.structuralMembers.structuralMembers.length, 0);
    const headerTrace = linkedGarage?.resolutionTraces.find(
      (trace) => trace.propertyPath === "headerMemberId",
    );
    assert.equal(headerTrace?.method, "unresolved");
    assert.match(
      headerTrace?.explanation ?? "",
      /no matching resolved structural member exists/,
    );
  });
});
