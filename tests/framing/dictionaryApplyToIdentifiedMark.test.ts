import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evidenceSchema } from "../../src/core/schemas/evidence.schema.js";
import { calculateStructuralMembers } from "../../src/framing/calculate/calculateStructuralMembers.js";
import { buildFramingConstructionFromEvidence } from "../../src/framing/read/readFramingPlans.js";
import { resolveStructuralMembers } from "../../src/framing/resolve/resolveStructuralMembers.js";
import {
  DICTIONARY_SCHEDULE_SIZE_MARKER,
  DICTIONARY_SIZE_CONFLICT_MARKER,
  MATERIAL_TYPE_CONFLICT_MARKER,
  SCHEDULE_MATERIAL_TYPE_MARKER,
} from "../../src/framing/resolve/structuralMemberAuthority.js";
import type { GovernedProjectDictionary } from "../../src/project-reading/schemas/projectDictionary.schema.js";

const source = {
  page: {
    documentId: null,
    pageNumber: 3,
    sheetId: null,
    sheetTitle: null,
    pageLabel: null,
    revision: null,
  },
  region: null,
  elementLabel: "WB2-8DF",
  detailNumber: null,
  sectionNumber: null,
  scheduleName: null,
  noteReference: null,
};

function governedDictionary(
  definitions: Array<{
    semanticTypeKey: string;
    properties: Array<{ propertyPath: string; rawText: string }>;
  }>,
): GovernedProjectDictionary {
  return {
    projectId: "beckstead",
    generatedAt: "2026-01-01T00:00:00.000Z",
    interpreterModel: "test",
    experimentBranch: "hybrid",
    observations: [],
    hypotheses: [],
    definitions: definitions.map((definition) => ({
      ...definition,
      sourcePage: 1,
      status: "definition" as const,
      provenance: [{ kind: "compiler" as const, toolCallId: "t1" }],
    })),
    bindings: [],
    unresolved: [],
    contradictions: [],
    metrics: { toolCalls: 0, tokens: 0, durationMs: 0 },
    governance: {
      evaluatedAt: "2026-01-01T00:00:00.000Z",
      passRate: 1,
      acceptedHypothesisIds: [],
      rejectedHypothesisIds: [],
      acceptedBindingIds: [],
      rejectedBindingIds: [],
      acceptedDefinitionKeys: definitions.map(
        (definition) => definition.semanticTypeKey,
      ),
      rejectedDefinitionKeys: [],
      validatorResults: [],
      greenOutcome: "GREEN",
      greenCriterion: "test",
    },
  };
}

function memberEvidence(input: {
  id: string;
  subjectKey: string;
  propertyPath: string;
  candidateValue: string | number;
  originalText?: string;
}) {
  return evidenceSchema.parse({
    id: input.id,
    type: "note",
    relationship: "supports",
    description: "Identified structural-member occurrence",
    source: { ...source, elementLabel: input.subjectKey },
    originalText: input.originalText ?? String(input.candidateValue),
    references: [],
    subjectKind: "structural-member",
    subjectKey: input.subjectKey,
    propertyPath: input.propertyPath,
    candidateValue: input.candidateValue,
  });
}

describe("Plan Dictionary apply to identified structural-member marks", () => {
  it("establishes size from dictionary when occurrence has category only", () => {
    const dictionary = governedDictionary([
      {
        semanticTypeKey: "WB2-8DF",
        properties: [{ propertyPath: "size", rawText: "(2)-2x8 DF#2" }],
      },
      {
        semanticTypeKey: "WB2-11.88LVL",
        properties: [{ propertyPath: "size", rawText: '(2)-1.75"x11.875"' }],
      },
    ]);
    const payload = resolveStructuralMembers(
      [
        memberEvidence({
          id: "E-WB2-8DF-P3-CALLOUT",
          subjectKey: "WB2-8DF",
          propertyPath: "category",
          candidateValue: "beam",
          originalText: "WB2-8DF TYP. U.N.O.",
        }),
      ],
      { projectDictionary: dictionary },
    );

    assert.equal(payload.structuralMembers.length, 1);
    const member = payload.structuralMembers[0];
    assert.equal(member?.id, "SM-WB2-8DF");
    assert.equal(member?.category, "beam");
    assert.equal(member?.size, "(2)-2x8 DF#2");
    assert.equal(member?.lengthFeet, null);
    assert.equal(
      member?.resolutionTraces.some(
        (trace) =>
          trace.propertyPath === "size" &&
          trace.method === "supported-inference" &&
          trace.explanation.includes(DICTIONARY_SCHEDULE_SIZE_MARKER),
      ),
      true,
    );
  });

  it("does not mint a member from a dictionary-only mark with no occurrence", () => {
    const dictionary = governedDictionary([
      {
        semanticTypeKey: "WB2-11.88LVL",
        properties: [{ propertyPath: "size", rawText: '(2)-1.75"x11.875"' }],
      },
    ]);

    const empty = resolveStructuralMembers([], {
      projectDictionary: dictionary,
    });
    assert.equal(empty.structuralMembers.length, 0);

    const withUnrelatedOccurrence = resolveStructuralMembers(
      [
        memberEvidence({
          id: "E-WB2-8DF-P3-CALLOUT",
          subjectKey: "WB2-8DF",
          propertyPath: "category",
          candidateValue: "beam",
          originalText: "WB2-8DF TYP. U.N.O.",
        }),
      ],
      { projectDictionary: dictionary },
    );
    assert.equal(withUnrelatedOccurrence.structuralMembers.length, 1);
    assert.equal(withUnrelatedOccurrence.structuralMembers[0]?.id, "SM-WB2-8DF");
    assert.equal(
      withUnrelatedOccurrence.structuralMembers.some(
        (member) => member.id === "SM-WB2-11.88LVL",
      ),
      false,
    );
  });

  it("leaves size unresolved when occurrence size conflicts with dictionary", () => {
    const dictionary = governedDictionary([
      {
        semanticTypeKey: "WB2-8DF",
        properties: [{ propertyPath: "size", rawText: "(2)-2x8 DF#2" }],
      },
    ]);
    const payload = resolveStructuralMembers(
      [
        memberEvidence({
          id: "E-WB2-8DF-P3-CALLOUT",
          subjectKey: "WB2-8DF",
          propertyPath: "category",
          candidateValue: "beam",
          originalText: "WB2-8DF TYP. U.N.O.",
        }),
        memberEvidence({
          id: "E-WB2-8DF-SIZE",
          subjectKey: "WB2-8DF",
          propertyPath: "size",
          candidateValue: "2x10",
        }),
      ],
      { projectDictionary: dictionary },
    );

    const member = payload.structuralMembers[0];
    assert.equal(payload.structuralMembers.length, 1);
    assert.equal(member?.size, null);
    assert.equal(member?.size === "(2)-2x8 DF#2", false);
    assert.equal(member?.size === "2x10", false);
    assert.equal(
      member?.resolutionTraces.some(
        (trace) =>
          trace.propertyPath === "size" &&
          trace.method === "unresolved" &&
          trace.explanation.includes(DICTIONARY_SIZE_CONFLICT_MARKER),
      ),
      true,
    );
  });

  it("fills category from dictionary when occurrence category is unset", () => {
    const dictionary = governedDictionary([
      {
        semanticTypeKey: "WB2-8DF",
        properties: [
          { propertyPath: "size", rawText: "(2)-2x8 DF#2" },
          { propertyPath: "category", rawText: "beam" },
        ],
      },
    ]);
    const payload = resolveStructuralMembers(
      [
        memberEvidence({
          id: "E-WB2-8DF-MARK",
          subjectKey: "WB2-8DF",
          propertyPath: "location",
          candidateValue: "Level 1",
          originalText: "WB2-8DF TYP. U.N.O.",
        }),
      ],
      { projectDictionary: dictionary },
    );

    const member = payload.structuralMembers[0];
    assert.equal(member?.category, "beam");
    assert.equal(member?.size, "(2)-2x8 DF#2");
  });

  it("production construction path receives the governed dictionary", () => {
    const dictionary = governedDictionary([
      {
        semanticTypeKey: "WB2-8DF",
        properties: [{ propertyPath: "size", rawText: "(2)-2x8 DF#2" }],
      },
    ]);
    const construction = buildFramingConstructionFromEvidence(
      [
        memberEvidence({
          id: "E-WB2-8DF-P3-CALLOUT",
          subjectKey: "WB2-8DF",
          propertyPath: "category",
          candidateValue: "beam",
          originalText: "WB2-8DF TYP. U.N.O.",
        }),
      ],
      { projectDictionary: dictionary },
    );

    const member = construction.structuralMembers.structuralMembers[0];
    assert.equal(member?.size, "(2)-2x8 DF#2");
    assert.equal(member?.lengthFeet, null);
  });

  it("fills LVL materialType from dictionary size so the calculator emits LF", () => {
    const dictionary = governedDictionary([
      {
        semanticTypeKey: "WB2-11.88LVL",
        properties: [
          { propertyPath: "size", rawText: '(2)-1.3/4"x11.7/8" LVL' },
        ],
      },
    ]);
    const payload = resolveStructuralMembers(
      [
        memberEvidence({
          id: "E-WB211.88LVL-CATEGORY",
          subjectKey: "WB2-11.88LVL",
          propertyPath: "category",
          candidateValue: "header",
          originalText: 'WB2-11.88LVL x 23\'-6" LONG',
        }),
        memberEvidence({
          id: "E-WB211.88LVL-LENGTH",
          subjectKey: "WB2-11.88LVL",
          propertyPath: "lengthFeet",
          candidateValue: 23.5,
          originalText: 'WB2-11.88LVL x 23\'-6" LONG',
        }),
      ],
      { projectDictionary: dictionary },
    );

    const member = payload.structuralMembers[0];
    assert.equal(payload.structuralMembers.length, 1);
    assert.equal(member?.id, "SM-WB2-11.88LVL");
    assert.equal(member?.category, "header");
    assert.equal(member?.size, '(2)-1.3/4"x11.7/8" LVL');
    assert.equal(member?.lengthFeet, 23.5);
    assert.equal(member?.quantity, 1);
    assert.equal(member?.materialType, "lvl");
    assert.equal(
      member?.resolutionTraces.some(
        (trace) =>
          trace.propertyPath === "materialType" &&
          trace.method === "supported-inference" &&
          trace.explanation.includes(SCHEDULE_MATERIAL_TYPE_MARKER),
      ),
      true,
    );

    const lines = calculateStructuralMembers(payload);
    assert.equal(lines.length, 1);
    assert.equal(lines[0]?.quantity, 23.5);
    assert.equal(lines[0]?.unit, "linear-foot");
    assert.equal(lines[0]?.category, "engineered-wood");
    assert.match(lines[0]?.material ?? "", /LVL/i);
  });

  it("does not emit when dimensional size has no material token", () => {
    const payload = resolveStructuralMembers([
      memberEvidence({
        id: "E-HDR-CAT",
        subjectKey: "HDR-001",
        propertyPath: "category",
        candidateValue: "header",
      }),
      memberEvidence({
        id: "E-HDR-SIZE",
        subjectKey: "HDR-001",
        propertyPath: "size",
        candidateValue: "2x10",
      }),
      memberEvidence({
        id: "E-HDR-LEN",
        subjectKey: "HDR-001",
        propertyPath: "lengthFeet",
        candidateValue: 8,
        originalText: 'HDR-001 x 8\'-0" LONG',
      }),
    ]);

    const member = payload.structuralMembers[0];
    assert.equal(member?.size, "2x10");
    assert.equal(member?.lengthFeet, 8);
    assert.equal(member?.quantity, 1);
    assert.equal(member?.materialType, null);
    assert.equal(calculateStructuralMembers(payload).length, 0);
  });

  it("leaves materialType unresolved when evidenced value conflicts with dictionary", () => {
    const dictionary = governedDictionary([
      {
        semanticTypeKey: "WB2-11.88LVL",
        properties: [
          { propertyPath: "size", rawText: '(2)-1.3/4"x11.7/8" LVL' },
          { propertyPath: "materialType", rawText: "LVL" },
        ],
      },
    ]);
    const payload = resolveStructuralMembers(
      [
        memberEvidence({
          id: "E-WB211.88LVL-CATEGORY",
          subjectKey: "WB2-11.88LVL",
          propertyPath: "category",
          candidateValue: "header",
        }),
        memberEvidence({
          id: "E-WB211.88LVL-MATERIAL",
          subjectKey: "WB2-11.88LVL",
          propertyPath: "materialType",
          candidateValue: "psl",
        }),
        memberEvidence({
          id: "E-WB211.88LVL-LENGTH",
          subjectKey: "WB2-11.88LVL",
          propertyPath: "lengthFeet",
          candidateValue: 23.5,
          originalText: 'WB2-11.88LVL x 23\'-6" LONG',
        }),
      ],
      { projectDictionary: dictionary },
    );

    const member = payload.structuralMembers[0];
    assert.equal(member?.materialType, null);
    assert.equal(member?.materialType === "lvl", false);
    assert.equal(member?.materialType === "psl", false);
    assert.equal(
      member?.resolutionTraces.some(
        (trace) =>
          trace.propertyPath === "materialType" &&
          trace.method === "unresolved" &&
          trace.explanation.includes(MATERIAL_TYPE_CONFLICT_MARKER),
      ),
      true,
    );
    assert.equal(calculateStructuralMembers(payload).length, 0);
  });
});
