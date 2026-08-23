import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { compiledDrawingPageSchema } from "../../../src/drawing-compiler/schemas/compiledDrawingPage.schema.js";
import { buildGovernedSemanticCompilerEvidence } from "../../../src/scopes/framing/geometry/buildGovernedSemanticCompilerEvidence.js";
import {
  PROJECT_DICTIONARY_BINDING_PASS_ID,
} from "../../../src/scopes/framing/geometry/buildProjectDictionaryBindingEvidence.js";
import {
  BINDING_AUTHORITY_GRADE_PROPERTY_PATH,
  SEMANTIC_TYPE_KEY_PROPERTY_PATH,
} from "../../../src/scopes/framing/geometry/semanticBindingConstants.js";
import { resolveWallFraming } from "../../../src/scopes/framing/resolvers/resolveWallFraming.js";
import type { Evidence } from "../../../src/core/schemas/evidence.schema.js";
import type { GovernedProjectDictionary } from "../../../src/project-interpreter/schemas/projectDictionary.schema.js";
import { assignProjectDictionaryBindingEvidence } from "../../../src/scopes/framing/geometry/buildProjectDictionaryBindingEvidence.js";
import { emptySemanticMarkRecoveryBlock } from "../../helpers/emptySemanticMarkRecoveryBlock.js";

const RUN_KEY = "physical-run:p4:74b4eaebc40a";

function minimalPageWithSw4Definition() {
  return compiledDrawingPageSchema.parse({
    pdfPath: "tests/fixtures/example.pdf",
    pageNumber: 1,
    pageWidth: 1000,
    pageHeight: 800,
    pageRole: {
      role: "plan",
      allowsWallPlanLengthEvidence: false,
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
      physicalRunCount: 0,
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
        allowsWallPlanLengthEvidence: false,
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
      emitBindingIds: [],
      bindings: [],
      propagationOpportunities: [],
      ownershipAssociations: [],
    },
    semanticMarkRecovery: emptySemanticMarkRecoveryBlock,
    semanticDefinitions: {
      definitions: [
        {
          definitionId: "def-sw4",
          semanticTypeKey: "SW4",
          definitionKind: "shear-wall",
          sourcePageNumber: 1,
          sourceRegion: { x0: 0, y0: 0, x1: 100, y1: 100 },
          properties: [
            {
              propertyPath: "assembly.sheathingType",
              rawText: "7/16 OSB",
              candidateValue: "7/16 OSB",
            },
          ],
          provenance: { extractionMethod: "row-band-ocr", rowIndex: 4 },
        },
      ],
      metrics: {
        rowsExtracted: 1,
        keysRecovered: 1,
        propertiesRecovered: 1,
        timingMs: 1,
      },
    },
    timingMs: { total: 1, transcription: 0 },
  });
}

function baseEvidence(
  subjectKey: string,
  propertyPath: string,
  candidateValue: string | number | boolean,
  id: string,
): Evidence {
  return {
    id,
    type: "tag",
    relationship: "supports",
    description: `${propertyPath} for ${subjectKey}`,
    source: {
      page: {
        documentId: null,
        pageNumber: 4,
        sheetId: null,
        sheetTitle: null,
        pageLabel: null,
        revision: null,
      },
      region: null,
      tileId: null,
      elementLabel: subjectKey,
      detailNumber: null,
      sectionNumber: null,
      scheduleName: null,
      noteReference: null,
    },
    originalText: String(candidateValue),
    references: [],
    subjectKind: "wall",
    subjectKey,
    propertyPath,
    candidateValue,
    extractionPassId: null,
    bundleId: null,
  };
}

describe("governed semantic compiler Evidence wire", () => {
  it("merges definition and dictionary Evidence into resolution without SW4 on class-bound run", () => {
    const page = minimalPageWithSw4Definition();
    const dictionary: GovernedProjectDictionary = {
      projectId: "test",
      generatedAt: new Date().toISOString(),
      interpreterModel: "test",
      experimentBranch: "compiler_heavy",
      observations: [],
      hypotheses: [],
      definitions: [],
      bindings: [
        {
          physicalRunKey: RUN_KEY,
          referenceKey: "shear-wall",
          status: "established_binding",
          mechanism: "graphic-convention",
          provenance: [
            {
              kind: "compiler",
              pageNumber: 4,
              toolCallId: "orientation-line-style-audit",
            },
          ],
        },
      ],
      unresolved: [],
      contradictions: [],
      metrics: { toolCalls: 0, tokens: 0, durationMs: 0 },
      governance: {
        evaluatedAt: new Date().toISOString(),
        passRate: 1,
        acceptedHypothesisIds: [],
        rejectedHypothesisIds: [],
        acceptedBindingIds: [RUN_KEY],
        rejectedBindingIds: [],
        validatorResults: [],
        greenOutcome: "GREEN",
        greenCriterion: "test",
      },
    };

    const evidence = buildGovernedSemanticCompilerEvidence([page], dictionary);
    assert.ok(
      evidence.some((e) => e.extractionPassId === "b2.2l.3-definition"),
    );
    assert.ok(
      evidence.some((e) => e.extractionPassId === PROJECT_DICTIONARY_BINDING_PASS_ID),
    );

    const resolved = resolveWallFraming([
      ...evidence,
      baseEvidence(RUN_KEY, "lengthFeet", 12, "E-LEN"),
    ]);
    const runWall = resolved.walls.find((w) => w.name === RUN_KEY);
    assert.ok(runWall);
    assert.equal(runWall.semanticTypeKey, null);
    assert.equal(runWall.wallType, "shear-wall");
    assert.equal(runWall.isShearOrBraced, true);
    assert.equal(runWall.assembly.studSize, null);

    const sw4Wall = resolved.walls.find((w) => w.name === "SW4");
    assert.ok(sw4Wall);
  });

  it("subtype dictionary binding permits SW2 inheritance", () => {
    const binding = assignProjectDictionaryBindingEvidence({
      physicalRunKey: "physical-run:p4:dining",
      referenceKey: "SW2",
      status: "established_binding",
      mechanism: "graphic-convention",
      provenance: [{ kind: "compiler", pageNumber: 4, toolCallId: "t" }],
    });

    const resolved = resolveWallFraming([
      ...binding,
      baseEvidence("physical-run:p4:dining", "lengthFeet", 12, "E-LEN"),
      baseEvidence("SW2", "wallType", "exterior-wood-stud-wall", "E-TYPE"),
      baseEvidence("SW2", "assembly.studSize", "2x4", "E-STUD"),
      baseEvidence("SW2", "assembly.studSpacingInches", 16, "E-SPACE"),
      baseEvidence("SW2", "assembly.plateCount", 3, "E-PLATE"),
    ]);

    const runWall = resolved.walls.find((w) => w.name === "physical-run:p4:dining");
    assert.ok(runWall);
    assert.equal(runWall.semanticTypeKey, "SW2");
    assert.equal(runWall.assembly.studSize, "2x4");
    assert.equal(runWall.assembly.studSpacingInches, 16);
  });
});
