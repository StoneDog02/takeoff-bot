import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evidenceSchema } from "../../src/core/schemas/evidence.schema.js";
import {
  applyStructuralMemberAuthority,
  BEAM_HEADER_CATEGORY_SYNONYM_MARKER,
  formatCanonicalDimensionalMemberSize,
  isScheduleMarkAsSize,
  looksLikeDimensionalMemberSize,
  parseCanonicalDimensionalMemberSize,
  parseInchMeasureToMilli,
  resolveBeamHeaderCategorySynonym,
  resolveDimensionalSizeOverScheduleMark,
  resolveExplicitSingleOccurrenceQuantity,
  resolveNotationEquivalentDimensionalSizes,
} from "../../src/framing/resolve/structuralMemberAuthority.js";
import type { StructuralMember } from "../../src/framing/schemas/structural-member.schema.js";

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

function categoryEvidence(id: string, value: string) {
  return evidenceSchema.parse({
    id,
    type: "note",
    relationship: "supports",
    description: `Category candidate ${value}`,
    source,
    originalText: `WB2-11.88LVL x 23'-6" LONG`,
    references: [],
    subjectKind: "structural-member",
    subjectKey: "WB2-11.88LVL",
    propertyPath: "category",
    candidateValue: value,
  });
}

function baseMember(
  overrides: Partial<StructuralMember> = {},
): StructuralMember {
  return {
    id: "SM-WB2-11.88LVL",
    objectType: "structural-member",
    resolutionTraces: [
      {
        propertyPath: "size",
        method: "unresolved",
        explanation: "Conflicting candidate values",
        assumptionIds: [],
      },
      {
        propertyPath: "lengthFeet",
        method: "explicit-project-value",
        explanation: "Resolved length",
        assumptionIds: [],
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

  it("parses notation-equivalent inch measures to the same milli-inches", () => {
    assert.equal(parseInchMeasureToMilli("1.75"), 1750);
    assert.equal(parseInchMeasureToMilli('1-3/4"'), 1750);
    assert.equal(parseInchMeasureToMilli("1.3/4"), 1750);
    assert.equal(parseInchMeasureToMilli("11.875"), 11875);
    assert.equal(parseInchMeasureToMilli('11-7/8"'), 11875);
    assert.equal(parseInchMeasureToMilli("11.7/8"), 11875);
  });

  it("parses built-up rectangular sizes with material suffix stripped", () => {
    const a = parseCanonicalDimensionalMemberSize('(2)-1.75"x11.875"');
    const b = parseCanonicalDimensionalMemberSize('(2)-1.3/4"x11.7/8" LVL');
    const c = parseCanonicalDimensionalMemberSize('(2)-1-3/4"x11-7/8"');
    assert.ok(a);
    assert.ok(b);
    assert.ok(c);
    assert.deepEqual(a, b);
    assert.deepEqual(a, c);
    assert.equal(formatCanonicalDimensionalMemberSize(a), '(2)-1.75"x11.875"');
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

  it("converges notation-equivalent dimensional size candidates", () => {
    const resolution = resolveNotationEquivalentDimensionalSizes(
      "WB2-11.88LVL",
      [
        sizeEvidence("E-A", '(2)-1.75"x11.875"'),
        sizeEvidence("E-B", '(2)-1.3/4"x11.7/8"'),
        sizeEvidence("E-C", '(2)-1.3/4"x11.7/8" LVL'),
        sizeEvidence("E-MARK", "11.88LVL"),
      ],
    );
    assert.ok(resolution);
    assert.equal(resolution.size, '(2)-1.75"x11.875"');
    assert.deepEqual(resolution.evidenceIds, ["E-A", "E-B", "E-C"]);
  });

  it("is permutation-invariant for equivalent size candidates", () => {
    const forms = [
      '(2)-1.75"x11.875"',
      '(2)-1.3/4"x11.7/8"',
      '(2)-1.3/4"x11.7/8" LVL',
      "11.88LVL",
    ];
    const orders = [
      forms,
      [...forms].reverse(),
      [forms[2]!, forms[0]!, forms[3]!, forms[1]!],
    ];
    const sizes = orders.map((order, index) => {
      const records = order.map((value, i) =>
        sizeEvidence(`E-${index}-${i}`, value),
      );
      const resolution = resolveNotationEquivalentDimensionalSizes(
        "WB2-11.88LVL",
        records,
      );
      assert.ok(resolution);
      return resolution.size;
    });
    assert.equal(new Set(sizes).size, 1);
    assert.equal(sizes[0], '(2)-1.75"x11.875"');
  });

  it("fails closed on genuinely different dimensional sizes", () => {
    assert.equal(
      resolveNotationEquivalentDimensionalSizes("WB2-11.88LVL", [
        sizeEvidence("E-A", '(2)-1.75"x11.875"'),
        sizeEvidence("E-B", '(2)-1.75"x14"'),
      ]),
      null,
    );
  });

  it("does not pick a lexicographic winner among conflicting sizes", () => {
    const leftFirst = resolveNotationEquivalentDimensionalSizes("HDR", [
      sizeEvidence("E-Z", '(2)-2x10"'),
      sizeEvidence("E-A", '(2)-2x12"'),
    ]);
    const rightFirst = resolveNotationEquivalentDimensionalSizes("HDR", [
      sizeEvidence("E-A", '(2)-2x12"'),
      sizeEvidence("E-Z", '(2)-2x10"'),
    ]);
    assert.equal(leftFirst, null);
    assert.equal(rightFirst, null);
  });

  it("fails closed when an unparseable non-mark size accompanies dimensionals", () => {
    assert.equal(
      resolveNotationEquivalentDimensionalSizes("WB2-11.88LVL", [
        sizeEvidence("E-A", '(2)-1.75"x11.875"'),
        sizeEvidence("E-B", "SEE DETAIL"),
      ]),
      null,
    );
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

  it("applies notation-equivalent convergence when mark preference alone cannot", () => {
    const records = [
      sizeEvidence("E-MARK", "11.88LVL"),
      sizeEvidence("E-A", '(2)-1.75"x11.875"'),
      sizeEvidence("E-B", '(2)-1.3/4"x11.7/8"'),
      lengthEvidence("E-LEN", 23.5),
    ];
    const applied = applyStructuralMemberAuthority(
      "WB2-11.88LVL",
      baseMember(),
      records,
    );
    assert.equal(applied.size, '(2)-1.75"x11.875"');
    assert.equal(applied.quantity, 1);
    assert.equal(
      applied.resolutionTraces.some(
        (trace) =>
          trace.propertyPath === "size" &&
          trace.method === "supported-inference" &&
          trace.explanation.includes("Notation-equivalent"),
      ),
      true,
    );
  });

  it("parses space-separated mixed fractions without collapsing to simple fractions", () => {
    assert.equal(parseInchMeasureToMilli('1 3/4"'), 1750);
    assert.equal(parseInchMeasureToMilli("11 7/8"), 11875);
    assert.deepEqual(parseCanonicalDimensionalMemberSize('(2)-1 3/4"x11 7/8"'), {
      plyCount: 2,
      widthMilli: 1750,
      heightMilli: 11875,
    });
  });

  it("converges space-fraction and dot-fraction size notations including LVL suffix", () => {
    const records = [
      sizeEvidence("E-SPACE", '(2)-1 3/4"x11 7/8"'),
      sizeEvidence("E-DOT", '(2)-1.3/4"x11.7/8"'),
      sizeEvidence("E-DOT-LVL", '(2)-1.3/4"x11.7/8" LVL'),
      lengthEvidence("E-LEN", 23.5),
    ];
    const resolution = resolveNotationEquivalentDimensionalSizes(
      "WB2-11.88LVL",
      records,
    );
    assert.ok(resolution);
    assert.equal(resolution.size, '(2)-1.75"x11.875"');

    const applied = applyStructuralMemberAuthority(
      "WB2-11.88LVL",
      baseMember({
        category: "header",
        size: null,
        lengthFeet: 23.5,
        materialType: "LVL",
        quantity: 1,
      }),
      records,
    );
    assert.equal(applied.size, '(2)-1.75"x11.875"');
  });

  it("converges beam|header category synonyms to header when HEADER Evidence exists", () => {
    const records = [
      categoryEvidence("E-WB2-CATEGORY", "header"),
      categoryEvidence("E-WB2-11.88LVL-CATEGORY", "beam"),
      sizeEvidence("E-DIM", '(2)-1.3/4"x11.7/8"'),
      lengthEvidence("E-LEN", 23.5),
    ];
    const resolution = resolveBeamHeaderCategorySynonym(records);
    assert.ok(resolution);
    assert.equal(resolution.category, "header");
    assert.ok(
      resolution.explanation.includes(BEAM_HEADER_CATEGORY_SYNONYM_MARKER),
    );

    const applied = applyStructuralMemberAuthority(
      "WB2-11.88LVL",
      baseMember({
        category: "unknown",
        size: '(2)-1.3/4"x11.7/8"',
        lengthFeet: 23.5,
        materialType: "LVL",
        quantity: 1,
        resolutionTraces: [
          {
            propertyPath: "category",
            method: "unresolved",
            explanation: "Conflicting category candidates",
            assumptionIds: [],
          },
        ],
      }),
      records,
    );
    assert.equal(applied.category, "header");
    assert.equal(
      applied.resolutionTraces.some(
        (trace) =>
          trace.propertyPath === "category" && trace.method === "unresolved",
      ),
      false,
    );
    assert.equal(
      applied.resolutionTraces.some(
        (trace) =>
          trace.propertyPath === "category" &&
          trace.method === "supported-inference",
      ),
      true,
    );
  });

  it("does not silently pick when category conflict includes a non-synonym", () => {
    const records = [
      categoryEvidence("E-HEADER", "header"),
      categoryEvidence("E-BEAM", "beam"),
      categoryEvidence("E-POST", "post"),
    ];
    assert.equal(resolveBeamHeaderCategorySynonym(records), null);
    const applied = applyStructuralMemberAuthority(
      "WB2-11.88LVL",
      baseMember({ category: "unknown" }),
      records,
    );
    assert.equal(applied.category, "unknown");
  });
});
