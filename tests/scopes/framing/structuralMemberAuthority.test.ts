import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evidenceSchema } from "../../../src/core/schemas/evidence.schema.js";
import {
  applyStructuralMemberAuthority,
  isScheduleMarkAsSize,
  looksLikeDimensionalMemberSize,
  resolveDimensionalSizeOverScheduleMark,
  resolveExplicitSingleOccurrenceQuantity,
} from "../../../src/scopes/framing/resolvers/structuralMemberAuthority.js";
import type { StructuralMember } from "../../../src/scopes/framing/schemas/structural-member.schema.js";

const source = {
  page: {
    documentId: null,
    pageNumber: 1,
    sheetId: null,
    sheetTitle: null,
    pageLabel: null,
    revision: null,
  },
  region: null,
  elementLabel: "WB2-11.88LVL",
  detailNumber: null,
  sectionNumber: null,
  scheduleName: null,
  noteReference: null,
};

function sizeEvidence(id: string, value: string) {
  return evidenceSchema.parse({
    id,
    type: "schedule",
    relationship: "supports",
    description: "Size candidate",
    source,
    originalText: value,
    references: [],
    subjectKind: "structural-member",
    subjectKey: "WB2-11.88LVL",
    propertyPath: "size",
    candidateValue: value,
  });
}

function lengthEvidence(id: string, feet: number) {
  return evidenceSchema.parse({
    id,
    type: "dimension",
    relationship: "supports",
    description: "Length candidate",
    source: { ...source, page: { ...source.page, pageNumber: 4 } },
    originalText: `WB2-11.88LVL x ${feet}'-0" LONG`,
    references: [],
    subjectKind: "structural-member",
    subjectKey: "WB2-11.88LVL",
    propertyPath: "lengthFeet",
    candidateValue: feet,
  });
}

function baseMember(
  overrides: Partial<StructuralMember> = {},
): StructuralMember {
  return {
    id: "SM-WB2-11.88LVL",
    objectType: "structural-member",
    completion: {
      status: "partial",
      percentage: 50,
      completedItems: 3,
      totalItems: 6,
    },
    reviewStatus: "no-review-required",
    blockingStatus: "not-blocked",
    evidenceIds: [],
    assumptionIds: [],
    validationIssueIds: [],
    reviewItemIds: [],
    resolutionTraces: [
      {
        propertyPath: "size",
        method: "unresolved",
        explanation: "Conflicting candidate values",
        evidenceIds: ["E-MARK", "E-DIM"],
        assumptionIds: [],
        userDecisionIds: [],
        validationIssueIds: [],
        reviewItemIds: [],
      },
      {
        propertyPath: "lengthFeet",
        method: "explicit-project-value",
        explanation: "Resolved length",
        evidenceIds: ["E-LEN"],
        assumptionIds: [],
        userDecisionIds: [],
        validationIssueIds: [],
        reviewItemIds: [],
      },
    ],
    category: "header",
    materialType: "LVL",
    size: null,
    plyCount: null,
    lengthFeet: 23.5,
    quantity: null,
    location: null,
    associatedObjectIds: [],
    supportedObjectIds: [],
    supportingObjectIds: [],
    connectorIds: [],
    ...overrides,
  };
}

describe("structuralMemberAuthority", () => {
  it("detects schedule-mark-as-size vs dimensional size", () => {
    assert.equal(isScheduleMarkAsSize("WB2-11.88LVL", "WB2-11.88LVL"), true);
    assert.equal(
      looksLikeDimensionalMemberSize('(2)-1.3/4"x11.7/8"'),
      true,
    );
    assert.equal(looksLikeDimensionalMemberSize("WB2-11.88LVL"), false);
  });

  it("prefers dimensional schedule size over mark-as-size conflict", () => {
    const resolution = resolveDimensionalSizeOverScheduleMark("WB2-11.88LVL", [
      sizeEvidence("E-MARK", "WB2-11.88LVL"),
      sizeEvidence("E-DIM", '(2)-1.3/4"x11.7/8"'),
    ]);
    assert.ok(resolution);
    assert.equal(resolution.size, '(2)-1.3/4"x11.7/8"');
    assert.deepEqual(resolution.evidenceIds, ["E-DIM"]);
  });

  it("establishes quantity=1 for explicit single occurrence with length", () => {
    const resolution = resolveExplicitSingleOccurrenceQuantity(
      [lengthEvidence("E-LEN", 23.5)],
      23.5,
      null,
    );
    assert.ok(resolution);
    assert.equal(resolution.quantity, 1);
  });

  it("does not invent quantity when quantity evidence exists", () => {
    const qty = evidenceSchema.parse({
      id: "E-QTY",
      type: "note",
      relationship: "supports",
      description: "qty",
      source,
      originalText: "2",
      references: [],
      subjectKind: "structural-member",
      subjectKey: "WB2-11.88LVL",
      propertyPath: "quantity",
      candidateValue: 2,
    });
    assert.equal(
      resolveExplicitSingleOccurrenceQuantity(
        [lengthEvidence("E-LEN", 23.5), qty],
        23.5,
        null,
      ),
      null,
    );
  });

  it("applies both size and quantity authority and clears unresolved size trace", () => {
    const records = [
      sizeEvidence("E-MARK", "WB2-11.88LVL"),
      sizeEvidence("E-DIM", '(2)-1.3/4"x11.7/8"'),
      lengthEvidence("E-LEN", 23.5),
    ];
    const applied = applyStructuralMemberAuthority(
      "WB2-11.88LVL",
      baseMember(),
      records,
    );
    assert.equal(applied.size, '(2)-1.3/4"x11.7/8"');
    assert.equal(applied.quantity, 1);
    assert.equal(
      applied.resolutionTraces.some(
        (trace) =>
          trace.propertyPath === "size" && trace.method === "unresolved",
      ),
      false,
    );
    assert.equal(
      applied.resolutionTraces.some(
        (trace) =>
          trace.propertyPath === "size" &&
          trace.method === "supported-inference",
      ),
      true,
    );
  });
});
