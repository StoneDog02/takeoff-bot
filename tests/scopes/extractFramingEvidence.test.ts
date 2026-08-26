import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { PlanIndex } from "../../src/plans/PlanIndex.js";
import {
  buildExtractionUserContent,
  buildSystemPrompt,
  selectPagesForExtraction,
} from "../../src/scopes/framing/prompts/extractFramingEvidence.js";
import { extractedFramingEvidencePayloadSchema } from "../../src/scopes/framing/schemas/framing-artifacts.schema.js";

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

function createEvidenceRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "E-W001-SPACING",
    type: "dimension",
    relationship: "supports",
    description: "Plan note states stud spacing.",
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

function classifiedPage(input: {
  pageNumber: number;
  sheetId?: string | null;
  discipline?: "architectural" | "structural" | "other";
  pageType: "cover" | "plan" | "schedule" | "notes" | "detail" | "other";
  relevantToFraming: boolean;
}) {
  const pageKind =
    input.pageType === "other" ? "other" : input.pageType;
  return {
    pageNumber: input.pageNumber,
    sheetId: input.sheetId ?? null,
    label: null,
    pageKind,
    scopeHints: [] as const,
    discipline: input.discipline ?? "other",
    pageType: input.pageType,
    relevantToFraming: input.relevantToFraming,
    needsVisualClassification: false,
    classificationMethod: "text" as const,
    titleOrLabel: null,
    evidenceText: null,
    classificationReason: "test fixture",
    confidenceLabel: "medium" as const,
  };
}

describe("extractFramingEvidence prompts", () => {
  it("selects framing-relevant pages in reading order", () => {
    const planIndex: PlanIndex = {
      pdfPath: "./plans/sample.pdf",
      totalPages: 3,
      indexedAt: new Date().toISOString(),
      sourceContentHash: null,
      pages: [
        {
          pageNumber: 1,
          sheetId: "A1.01",
          label: "Cover Sheet",
          textContent: "cover",
        },
        {
          pageNumber: 2,
          sheetId: "A2.01",
          label: "Floor Plan",
          textContent: "plan",
        },
        {
          pageNumber: 3,
          sheetId: "S1.01",
          label: "Structural Plan",
          textContent: "structural",
        },
      ],
    };

    const selected = selectPagesForExtraction(
      planIndex,
      {
        pages: [
          classifiedPage({
            pageNumber: 1,
            sheetId: "A1.01",
            discipline: "architectural",
            pageType: "cover",
            relevantToFraming: false,
          }),
          classifiedPage({
            pageNumber: 2,
            sheetId: "A2.01",
            discipline: "architectural",
            pageType: "plan",
            relevantToFraming: true,
          }),
          classifiedPage({
            pageNumber: 3,
            sheetId: "S1.01",
            discipline: "structural",
            pageType: "plan",
            relevantToFraming: true,
          }),
        ],
      },
      {
        orderedPageNumbers: [3, 2, 1],
        rationale: ["structural before architectural"],
      },
    );

    assert.deepEqual(
      selected.map((page) => page.pageNumber),
      [3, 2],
    );
  });

  it("selects a one-page unclassified fixture for live extraction", () => {
    const planIndex: PlanIndex = {
      pdfPath: "./tests/fixtures/wall-w001-text-layer.pdf",
      totalPages: 1,
      indexedAt: new Date().toISOString(),
      sourceContentHash: null,
      pages: [
        {
          pageNumber: 1,
          sheetId: null,
          label: null,
          textContent:
            "W-001\nWall type: wood stud wall\n20 ft\n2x4\n16 in O.C.\n8 ft wall height\n3 plates",
        },
      ],
    };

    const selected = selectPagesForExtraction(
      planIndex,
      {
        pages: [
          classifiedPage({
            pageNumber: 1,
            sheetId: null,
            discipline: "other",
            pageType: "other",
            relevantToFraming: true,
          }),
        ],
      },
      {
        orderedPageNumbers: [1],
        rationale: ["single indexed page"],
      },
    );

    assert.equal(selected.length, 1);
    assert.equal(selected[0]?.pageNumber, 1);
    assert.match(selected[0]?.textContent ?? "", /W-001/);
  });

  it("instructs Claude to emit atomic candidate evidence, not resolved objects", () => {
    const prompt = buildSystemPrompt("construction-brain-context");

    assert.match(prompt, /"subjectKind"/);
    assert.match(prompt, /"subjectKey"/);
    assert.match(prompt, /For wall extraction, use "wall"/);
    assert.match(prompt, /"structural-member"/);
    assert.match(prompt, /category,\s*materialType,\s*size,\s*lengthFeet,\s*quantity,\s*location/);
    assert.match(prompt, /"subjectKind": "structural-member"/);
    assert.match(prompt, /"subjectKey": "HDR-001"/);
    assert.match(prompt, /subjectKind \+ subjectKey identify the extraction cluster/);
    assert.match(prompt, /"propertyPath"/);
    assert.match(prompt, /"candidateValue"/);
    assert.match(prompt, /one Evidence record per subjectKind \+ subjectKey \+ propertyPath \+ candidateValue/);
    assert.match(prompt, /not a resolved ObjectId/);
    assert.match(prompt, /Never drop a competing candidate/);
    assert.match(prompt, /Do not assign final ObjectIds, create ResolutionTraces/);
    assert.match(prompt, /Do not copy sheet IDs, titles, originalText, or candidate values/);
    assert.match(prompt, /Prior-stage assembly names are context only/);
    assert.match(prompt, /multiple labeled marks appear/);
    assert.match(prompt, /Never merge facts from one labeled object into another/);
    assert.match(prompt, /Preserve realistic plan marks as-is/);
    assert.match(prompt, /schedule and compact-notation reading rules/);
    assert.match(prompt, /floor \/ roof spacing-axis dimension rules/);
    assert.match(prompt, /"subjectKey": "W-002"/);
    assert.match(prompt, /construction-brain-context/);
    assert.match(prompt, /opening visual floor-plan search rules/);
    assert.match(prompt, /door swings, window symbols, garage-door openings/);
    assert.match(prompt, /Do not invent jack\/king counts, header sizes, quantities, or\n {2}framing math/);
    assert.match(prompt, /page text and\/or\nattached page visuals/);
    assert.match(prompt, /Do not stop\n {2}after finding one prominent opening/);
    assert.match(prompt, /"tileId": "t-r0-c1"/);
    assert.match(prompt, /opening type-mark \/ schedule dimension rules/);
    assert.match(prompt, /Schedule-row grounding/);
  });
});

describe("extracted framing evidence output contract", () => {
  it("parses valid structured Claude evidence through the payload schema", () => {
    const payload = extractedFramingEvidencePayloadSchema.parse({
      evidence: [
        createEvidenceRecord({
          id: "E-W001-CLASS",
          type: "note",
          description: "Plan note states the wall type.",
          originalText: "Wall W-001: new exterior non-bearing wood stud wall",
          propertyPath: "wallType",
          candidateValue: "wood stud wall",
        }),
        createEvidenceRecord(),
      ],
    });

    assert.equal(payload.evidence.length, 2);
    assert.equal(payload.evidence[0]?.subjectKey, "W-001");
    assert.equal(payload.evidence[0]?.subjectKind, "wall");
    assert.equal(payload.evidence[0]?.propertyPath, "wallType");
    assert.equal(payload.evidence[0]?.candidateValue, "wood stud wall");
    assert.equal(payload.evidence[1]?.candidateValue, 16);
  });

  it("rejects evidence missing subjectKind", () => {
    const result = extractedFramingEvidencePayloadSchema.safeParse({
      evidence: [
        {
          ...createEvidenceRecord(),
          subjectKind: undefined,
        },
      ],
    });

    assert.equal(result.success, false);
  });

  it("rejects evidence missing subjectKey", () => {
    const result = extractedFramingEvidencePayloadSchema.safeParse({
      evidence: [
        {
          ...createEvidenceRecord(),
          subjectKey: undefined,
        },
      ],
    });

    assert.equal(result.success, false);
  });

  it("rejects evidence missing propertyPath", () => {
    const result = extractedFramingEvidencePayloadSchema.safeParse({
      evidence: [
        {
          ...createEvidenceRecord(),
          propertyPath: undefined,
        },
      ],
    });

    assert.equal(result.success, false);
  });

  it("rejects an invalid candidateValue shape", () => {
    const objectValue = extractedFramingEvidencePayloadSchema.safeParse({
      evidence: [
        createEvidenceRecord({
          candidateValue: { value: 16, unit: "in" },
        }),
      ],
    });
    const emptyString = extractedFramingEvidencePayloadSchema.safeParse({
      evidence: [createEvidenceRecord({ candidateValue: "" })],
    });
    const arrayValue = extractedFramingEvidencePayloadSchema.safeParse({
      evidence: [createEvidenceRecord({ candidateValue: [16] })],
    });

    assert.equal(objectValue.success, false);
    assert.equal(emptyString.success, false);
    assert.equal(arrayValue.success, false);
  });

  it("parses multiple atomic properties for the same subjectKey", () => {
    const payload = extractedFramingEvidencePayloadSchema.parse({
      evidence: [
        createEvidenceRecord({
          id: "E-W001-CLASS",
          type: "note",
          propertyPath: "wallType",
          candidateValue: "wood stud wall",
        }),
        createEvidenceRecord({
          id: "E-W001-LOCATION",
          type: "note",
          propertyPath: "location",
          candidateValue: "exterior",
        }),
        createEvidenceRecord({
          id: "E-W001-BEARING",
          type: "note",
          propertyPath: "bearingStatus",
          candidateValue: "non-bearing",
        }),
        createEvidenceRecord({
          id: "E-W001-LENGTH",
          propertyPath: "lengthFeet",
          candidateValue: 20,
        }),
      ],
    });

    assert.equal(payload.evidence.length, 4);
    assert.deepEqual(
      [...new Set(payload.evidence.map((record) => record.subjectKey))],
      ["W-001"],
    );
    assert.deepEqual(
      payload.evidence.map((record) => record.propertyPath),
      ["wallType", "location", "bearingStatus", "lengthFeet"],
    );
  });

  it("preserves conflicting candidates as separate evidence records", () => {
    const payload = extractedFramingEvidencePayloadSchema.parse({
      evidence: [
        createEvidenceRecord({
          id: "E-W001-SPACING-SCHEDULE",
          type: "schedule",
          description: "Wall schedule states 16 in O.C.",
          originalText: "W1 2x4 @ 16\" O.C.",
          candidateValue: 16,
        }),
        createEvidenceRecord({
          id: "E-W001-SPACING-NOTE",
          type: "note",
          relationship: "supports",
          description: "Architectural note states 24 in O.C.",
          originalText: "studs at 24 in O.C.",
          candidateValue: 24,
        }),
      ],
    });

    assert.equal(payload.evidence.length, 2);
    assert.equal(payload.evidence[0]?.subjectKey, payload.evidence[1]?.subjectKey);
    assert.equal(
      payload.evidence[0]?.propertyPath,
      payload.evidence[1]?.propertyPath,
    );
    assert.deepEqual(
      payload.evidence.map((record) => record.candidateValue),
      [16, 24],
    );
  });

  it("preserves source provenance on parsed extraction output", () => {
    const payload = extractedFramingEvidencePayloadSchema.parse({
      evidence: [
        createEvidenceRecord({
          references: [
            {
              type: "schedule",
              originalText: "See Wall Type Schedule",
              target: null,
              description: "Schedule reference on A2.01",
            },
          ],
        }),
      ],
    });

    const evidence = payload.evidence[0];
    assert.equal(evidence?.source.page.sheetId, "A2.01");
    assert.equal(evidence?.source.page.pageNumber, 2);
    assert.equal(evidence?.source.elementLabel, "W-001");
    assert.equal(evidence?.originalText, "studs 2x4 at 16 in O.C.");
    assert.equal(evidence?.references[0]?.type, "schedule");
    assert.equal(evidence?.type, "dimension");
    assert.equal(evidence?.relationship, "supports");
  });

  it("includes parentSystemTag relationship examples in system prompt", () => {
    const prompt = buildSystemPrompt("construction-brain-context");
    assert.match(prompt, /parentSystemTag/);
    assert.match(prompt, /floor-framing-area/);
    assert.match(prompt, /Shared assembly callout text alone does not establish/);
  });

  it("includes project context block in extraction preamble when provided", async () => {
    const blocks = await buildExtractionUserContent({
      pages: [
        {
          pageNumber: 4,
          sheetId: "A1",
          label: "Floor Plan",
          textContent: "MAIN FLOOR AREA = 1621 SF",
        },
      ],
      buildingAssemblies: { assemblyNames: [], notes: [] },
      extractionBundle: {
        bundleId: "test:floor",
        scopeName: "framing",
        intent: "floor-framing",
        orderedPageNumbers: [4],
        members: [
          {
            pageNumber: 4,
            role: "primary",
            visualDetailLevel: "none",
            sheetId: null,
            label: null,
            reason: "test",
          },
        ],
        routingNotes: [],
        imageBudget: {
          maxImages: 20,
          estimatedImages: 0,
          tilesPerDetailedPage: 4,
        },
      },
      extractionProjectContext: {
        intent: "floor-framing",
        bundlePageNumbers: [4],
        knownSystemTags: ["FFS-MAIN-FLOOR-SYSTEM"],
        knownAreaTags: ["FFA-MAIN-FLOOR-AREA"],
        dictionaryBindings: [],
        crossPageNotes: [],
        contextDisclaimer: "CONTEXT ONLY — not plan evidence",
      },
    });

    const text = blocks
      .filter((block) => block.type === "text")
      .map((block) => ("text" in block ? block.text : ""))
      .join("\n");
    assert.match(text, /Project context \(not plan text\)/);
    assert.match(text, /FFS-MAIN-FLOOR-SYSTEM/);
    assert.match(text, /Do not emit relationships from context alone/);
  });
});
