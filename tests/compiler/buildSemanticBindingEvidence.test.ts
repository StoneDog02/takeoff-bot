import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { compiledDrawingPageSchema } from "../../src/compiler/schemas/compiledDrawingPage.schema.js";
import { buildSemanticBindingEvidenceFromCompiledPages } from "../../src/framing/geometry/buildSemanticBindingEvidenceFromCompiledPages.js";
import {
  BINDING_AUTHORITY_GRADE_PROPERTY_PATH,
  SEMANTIC_TYPE_KEY_PROPERTY_PATH,
} from "../../src/framing/geometry/semanticBindingConstants.js";
import { emptySemanticMarkRecoveryBlock } from "../helpers/emptySemanticMarkRecoveryBlock.js";

function minimalPage(overrides: Record<string, unknown> = {}) {
  return compiledDrawingPageSchema.parse({
    pdfPath: "tests/fixtures/example.pdf",
    pageNumber: 4,
    pageWidth: 1000,
    pageHeight: 800,
    pageRole: {
      role: "plan",
      allowsWallPlanLengthEvidence: true,
      planHits: [],
      elevationHits: [],
      sectionHits: [],
      detailHits: [],
      rawItemCount: 0,
      method: "test",
    },
    text: { rawItemCount: 0, primitives: [], imperialCandidates: [] },
    geometry: {
      segmentCount: 0,
      faceCount: 0,
      pairCount: 0,
      physicalRunCount: 1,
      pbgRuns: [],
      rejectedRunCount: 0,
      dims: [],
      dimSourceCounts: { detected: 0, "near-high-seed": 0, "virtual-text": 0 },
    },
    transcriptions: [],
    ptPerFt: 12,
    ownership: {
      associatedUnique: 0,
      ambiguous: 0,
      weakLength: 0,
      overallUniqueAndLengthOk: 0,
      overallLengthOkRate: null,
      associations: [],
    },
    governance: {
      pageRole: {
        role: "plan",
        allowsWallPlanLengthEvidence: true,
        planHits: [],
        elevationHits: [],
        sectionHits: [],
        detailHits: [],
        rawItemCount: 0,
        method: "test",
      },
      decisions: [],
      emitDimIds: [],
      scaleByDim: {},
      counts: {
        emit: 0,
        rejectPageRole: 0,
        rejectOwnership: 0,
        rejectVirtual: 0,
        rejectScale: 0,
        unresolvedScale: 0,
        passScale: 0,
      },
    },
    semanticBinding: {
      emitBindingIds: ["bind-1"],
      bindings: [
        {
          bindingId: "bind-1",
          physicalRunKey: "physical-run:p4:test",
          semanticSubjectKey: "SW2",
          semanticTextCategory: "type-or-assembly-identifier",
          relationship: "direct-mark",
          authorityMethod: "mark-spatial-ownership",
          authorityGrade: "A",
          status: "assigned",
          emit: true,
          sourcePageNumber: 4,
          sourceTextPrimitiveId: "t1",
          spatialScore: 100,
          uniquenessMargin: 2,
          competingCandidates: [],
          notes: [],
        },
      ],
      propagationOpportunities: [],
      ownershipAssociations: [],
    },
    semanticMarkRecovery: emptySemanticMarkRecoveryBlock,
    timingMs: { total: 1, transcription: 0 },
    ...overrides,
  });
}

describe("buildSemanticBindingEvidenceFromCompiledPages", () => {
  it("emits semanticTypeKey and bindingAuthorityGrade on physical-run subjects", () => {
    const evidence = buildSemanticBindingEvidenceFromCompiledPages([minimalPage()]);

    assert.equal(evidence.length, 2);
    const typeRecord = evidence.find(
      (record) => record.propertyPath === SEMANTIC_TYPE_KEY_PROPERTY_PATH,
    );
    const gradeRecord = evidence.find(
      (record) => record.propertyPath === BINDING_AUTHORITY_GRADE_PROPERTY_PATH,
    );

    assert.ok(typeRecord);
    assert.equal(typeRecord.subjectKey, "physical-run:p4:test");
    assert.equal(typeRecord.candidateValue, "SW2");
    assert.ok(gradeRecord);
    assert.equal(gradeRecord.candidateValue, "A");
  });

  it("skips non-emit bindings", () => {
    const page = minimalPage({
      semanticBinding: {
        emitBindingIds: [],
        bindings: [
          {
            bindingId: "bind-1",
            physicalRunKey: "physical-run:p4:test",
            semanticSubjectKey: "SW2",
            semanticTextCategory: "type-or-assembly-identifier",
            relationship: "direct-mark",
            authorityMethod: "mark-spatial-ownership",
            authorityGrade: "A",
            status: "ambiguous",
            emit: false,
            sourcePageNumber: 4,
            sourceTextPrimitiveId: "t1",
            spatialScore: 100,
            uniquenessMargin: 1,
            competingCandidates: [],
            notes: [],
          },
        ],
        propagationOpportunities: [],
        ownershipAssociations: [],
      },
    });

    assert.equal(buildSemanticBindingEvidenceFromCompiledPages([page]).length, 0);
  });
});
