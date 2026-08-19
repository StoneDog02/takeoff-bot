import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evidenceSchema } from "../../src/core/schemas/evidence.schema.js";

const source = {
  page: {
    documentId: null,
    pageNumber: 2,
    sheetId: "A2.01",
    sheetTitle: "Floor Plan - Level 1",
    pageLabel: "Floor Plan - Level 1",
    revision: null,
  },
  region: null,
  elementLabel: "W-001",
  detailNumber: null,
  sectionNumber: null,
  scheduleName: null,
  noteReference: null,
};

function createEvidence(
  overrides: Record<string, unknown> = {},
) {
  return {
    id: "E-W001-SPACING",
    type: "dimension",
    relationship: "supports",
    description: "Stud spacing is stated on the plan.",
    source,
    originalText: "studs 2x4 at 16 in O.C.",
    references: [],
    subjectKind: "wall",
    subjectKey: "W-001",
    propertyPath: "assembly.studSpacingInches",
    candidateValue: 16,
    ...overrides,
  };
}

describe("evidence contract", () => {
  it("accepts a string candidate value", () => {
    const evidence = evidenceSchema.parse(
      createEvidence({
        id: "E-W001-SIZE",
        propertyPath: "assembly.studSize",
        candidateValue: "2x4",
      }),
    );

    assert.equal(evidence.candidateValue, "2x4");
    assert.equal(evidence.subjectKey, "W-001");
    assert.equal(evidence.propertyPath, "assembly.studSize");
  });

  it("accepts a numeric candidate value including zero", () => {
    const evidence = evidenceSchema.parse(createEvidence());
    const zero = evidenceSchema.parse(
      createEvidence({ id: "E-W001-ZERO", candidateValue: 0 }),
    );

    assert.equal(evidence.candidateValue, 16);
    assert.equal(zero.candidateValue, 0);
  });

  it("accepts a boolean candidate value", () => {
    const evidence = evidenceSchema.parse(
      createEvidence({
        id: "E-W001-SHEAR",
        propertyPath: "isShearOrBraced",
        candidateValue: false,
      }),
    );

    assert.equal(evidence.candidateValue, false);
  });

  it("accepts a null candidate value", () => {
    const evidence = evidenceSchema.parse(
      createEvidence({
        id: "E-W001-SHEATHING",
        propertyPath: "assembly.sheathing",
        candidateValue: null,
      }),
    );

    assert.equal(evidence.candidateValue, null);
  });

  it("accepts a valid extraction-stable subject key", () => {
    const tagged = evidenceSchema.parse(
      createEvidence({ subjectKey: "schedule:W1" }),
    );
    const planTag = evidenceSchema.parse(
      createEvidence({ subjectKey: "Wall W-001" }),
    );

    assert.equal(tagged.subjectKey, "schedule:W1");
    assert.equal(planTag.subjectKey, "Wall W-001");
  });

  it("accepts a valid object-relative property path", () => {
    const evidence = evidenceSchema.parse(
      createEvidence({ propertyPath: "lengthFeet" }),
    );

    assert.equal(evidence.propertyPath, "lengthFeet");
  });

  it("allows competing candidate values for the same subject and property", () => {
    const schedule = evidenceSchema.parse(
      createEvidence({
        id: "E-W001-SPACING-SCHEDULE",
        type: "schedule",
        candidateValue: 16,
      }),
    );
    const note = evidenceSchema.parse(
      createEvidence({
        id: "E-W001-SPACING-NOTE",
        type: "note",
        relationship: "conflicts",
        candidateValue: 24,
      }),
    );

    assert.equal(schedule.subjectKey, note.subjectKey);
    assert.equal(schedule.propertyPath, note.propertyPath);
    assert.notEqual(schedule.candidateValue, note.candidateValue);
  });

  it("preserves source provenance and original text", () => {
    const evidence = evidenceSchema.parse(createEvidence());

    assert.equal(evidence.source.page.sheetId, "A2.01");
    assert.equal(evidence.source.elementLabel, "W-001");
    assert.equal(evidence.originalText, "studs 2x4 at 16 in O.C.");
    assert.deepEqual(evidence.references, []);
    assert.equal(evidence.type, "dimension");
    assert.equal(evidence.relationship, "supports");
  });

  it("rejects an empty or whitespace subject key", () => {
    assert.equal(
      evidenceSchema.safeParse(createEvidence({ subjectKey: "" })).success,
      false,
    );
    assert.equal(
      evidenceSchema.safeParse(createEvidence({ subjectKey: "   " })).success,
      false,
    );
  });

  it("rejects an empty or whitespace property path", () => {
    assert.equal(
      evidenceSchema.safeParse(createEvidence({ propertyPath: "" })).success,
      false,
    );
    assert.equal(
      evidenceSchema.safeParse(createEvidence({ propertyPath: "   " })).success,
      false,
    );
  });

  it("rejects an empty string candidate value", () => {
    assert.equal(
      evidenceSchema.safeParse(createEvidence({ candidateValue: "" }))
        .success,
      false,
    );
    assert.equal(
      evidenceSchema.safeParse(createEvidence({ candidateValue: "   " }))
        .success,
      false,
    );
  });

  it("rejects missing subjectKind, subject, property, or candidate fields", () => {
    assert.equal(
      evidenceSchema.safeParse({
        ...createEvidence(),
        subjectKind: undefined,
      }).success,
      false,
    );
    assert.equal(
      evidenceSchema.safeParse({
        ...createEvidence(),
        subjectKey: undefined,
      }).success,
      false,
    );
    assert.equal(
      evidenceSchema.safeParse({
        ...createEvidence(),
        propertyPath: undefined,
      }).success,
      false,
    );
    assert.equal(
      evidenceSchema.safeParse({
        ...createEvidence(),
        candidateValue: undefined,
      }).success,
      false,
    );
  });

  it("accepts opening subjectKind", () => {
    const evidence = evidenceSchema.parse({
      ...createEvidence(),
      id: "E-O001-CATEGORY",
      subjectKind: "opening",
      subjectKey: "O-001",
      propertyPath: "category",
      candidateValue: "window",
    });

    assert.equal(evidence.subjectKind, "opening");
  });

  it("parses candidate values deterministically across reruns", () => {
    const input = createEvidence({
      candidateValue: 16,
      subjectKey: "  W-001  ",
      propertyPath: "  assembly.studSpacingInches  ",
    });

    assert.deepEqual(evidenceSchema.parse(input), evidenceSchema.parse(input));
    assert.equal(evidenceSchema.parse(input).subjectKey, "W-001");
    assert.equal(
      evidenceSchema.parse(input).propertyPath,
      "assembly.studSpacingInches",
    );
  });
});
