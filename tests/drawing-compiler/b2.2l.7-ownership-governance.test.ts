import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  projectDictionarySchema,
  type ProjectDictionary,
} from "../../src/project-interpreter/schemas/projectDictionary.schema.js";
import { DictionaryGovernor } from "../../src/project-interpreter/dictionaryGovernor.js";
import type { CompilerInvestigationFacade } from "../../src/project-interpreter/compilerInvestigationFacade.js";
import { recoverGraphicConventionReferences } from "../../src/drawing-compiler/plan-annotations/recoverGraphicConventionReferences.js";
import type { PbgRun } from "../../src/drawing-compiler/pbg/consolidatePhysicalRuns.js";
import type { Segment } from "../../src/drawing-compiler/sgg/extractSegments.js";

function mockFacade(runKey = "physical-run:p4:test"): CompilerInvestigationFacade {
  const cache = new Map([
    [
      "orientation-p1-keyed-note",
      {
        toolCallId: "orientation-p1-keyed-note",
        pageNumber: 1,
        bbox: { x0: 0, y0: 0, x1: 10, y1: 10 },
        imagePath: "",
        ocrText: "SW_ INDICATES SHEAR WALL SCHEDULE",
      },
    ],
  ]);
  return {
    searchProjectText: () => [],
    findTextPattern: () => [],
    getPhysicalRun: async () => ({
      physicalRunKey: runKey,
      pageNumber: 4,
      orientation: "H",
      wallAuthority: "high",
      centerline: { x1: 0, y1: 0, x2: 100, y2: 0 },
      lengthPt: 100,
      thicknessPt: 6,
    }),
    getRegionOcrCache: () => cache,
    getRegionOcrEntry: (id: string) => cache.get(id),
  } as unknown as CompilerInvestigationFacade;
}

function baseDictionary(partial: Partial<ProjectDictionary> = {}): ProjectDictionary {
  return projectDictionarySchema.parse({
    projectId: "test",
    generatedAt: new Date().toISOString(),
    interpreterModel: "test",
    experimentBranch: "compiler_heavy",
    observations: [],
    hypotheses: [],
    definitions: [],
    bindings: [],
    unresolved: [],
    contradictions: [],
    metrics: { toolCalls: 0, tokens: 0, durationMs: 0 },
    ...partial,
  });
}

describe("B2.2L.7 ownership governance", () => {
  it("accepts shear-wall class binding with keyed-note + compiler provenance", async () => {
    const facade = mockFacade("physical-run:p4:wall-1");
    const governor = new DictionaryGovernor(facade);
    const dict = baseDictionary({
      hypotheses: [
        {
          id: "hyp-graphic-shear-class",
          status: "established_rule",
          conventionClass: "heavy-linework",
          claim:
            "Heavy structural wall linework on main floor plan indicates shear-wall class when S1.1 keyed-note governs graphic convention.",
          provenance: [
            { kind: "compiler", pageNumber: 4, toolCallId: "orientation-line-style-audit" },
            {
              kind: "ocr",
              pageNumber: 1,
              toolCallId: "orientation-p1-keyed-note",
            },
          ],
        },
      ],
      bindings: [
        {
          physicalRunKey: "physical-run:p4:wall-1",
          referenceKey: "shear-wall",
          status: "established_binding",
          mechanism: "graphic-convention",
          provenance: [
            { kind: "compiler", pageNumber: 4, toolCallId: "orientation-line-style-audit" },
            {
              kind: "ocr",
              pageNumber: 1,
              toolCallId: "orientation-p1-keyed-note",
            },
          ],
        },
      ],
    });

    const report = await governor.govern(dict);
    assert.ok(report.acceptedBindingIds.includes("physical-run:p4:wall-1"));
    assert.ok(report.acceptedHypothesisIds.includes("hyp-graphic-shear-class"));
  });

  it("rejects graphic rule from schedule-only provenance", async () => {
    const facade = mockFacade();
    const governor = new DictionaryGovernor(facade);
    const dict = baseDictionary({
      hypotheses: [
        {
          id: "hyp-bad",
          status: "established_rule",
          conventionClass: "heavy-linework",
          claim: "Heavy line means shear wall per schedule row.",
          provenance: [
            {
              kind: "artifact",
              artifactPath: "artifacts/schedule-definitions.json",
              pageNumber: 1,
              toolCallId: "t1",
            },
          ],
        },
      ],
    });

    const report = await governor.govern(dict);
    assert.ok(report.rejectedHypothesisIds.includes("hyp-bad"));
  });

  it("legend gate blocks graphic references without orientation authorization", () => {
    const run: PbgRun = {
      id: "r1",
      physicalRunKey: "physical-run:p4:a",
      pageNumber: 4,
      orientation: "H",
      sourceCandidateIds: [],
      faceSegmentIds: [],
      thicknessPt: 6,
      centerline: { x1: 0, y1: 0, x2: 100, y2: 0 },
      endpoints: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      lengthPt: 100,
      mid: { x: 50, y: 0 },
      openingGapSuspects: [],
      junctions: [],
      connectedRunIds: [],
      wallAuthority: "high",
      authorityScore: 1,
      authorityReasons: [],
    };
    const seg: Segment = {
      id: 1,
      x1: 0,
      y1: 0,
      x2: 100,
      y2: 0,
      length: 100,
      angleDeg: 0,
      orientation: "H",
      strokeWidth: 3,
    };

    const without = recoverGraphicConventionReferences({
      segments: [seg],
      pbgRuns: [run],
      pageNumber: 4,
      pageWidth: 1000,
      pageHeight: 1000,
      referenceMechanism: "GRAPHIC_CONVENTION",
    });
    assert.equal(without.metrics.referencesEmitted, 0);

    const withAuth = recoverGraphicConventionReferences({
      segments: [seg],
      pbgRuns: [run],
      pageNumber: 4,
      pageWidth: 1000,
      pageHeight: 1000,
      referenceMechanism: "GRAPHIC_CONVENTION",
      orientationContext: {
        sourceFingerprint: null,
        definitions: [],
        establishedRules: [
          {
            id: "hyp-graphic",
            status: "established_rule",
            conventionClass: "heavy-linework",
            claim: "Heavy line graphic convention governs shear class.",
            provenance: [
              { kind: "compiler", pageNumber: 4, toolCallId: "t1" },
            ],
          },
        ],
        dictionaryDefinitions: [],
        referenceMechanismHint: "GRAPHIC_CONVENTION",
        graphicConventionAuthorized: true,
      },
    });
    assert.ok(withAuth.metrics.referencesEmitted >= 0);
    for (const ref of withAuth.references) {
      assert.equal(ref.referenceKey, "shear-wall");
    }
  });
});
