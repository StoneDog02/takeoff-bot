import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  projectDictionarySchema,
} from "../../src/project-reading/schemas/projectDictionary.schema.js";
import { DictionaryGovernor } from "../../src/project-reading/dictionaryGovernor.js";
import type { CompilerInvestigationFacade } from "../../src/project-reading/compilerInvestigationFacade.js";

function mockFacadeWithScheduleCache(
  entries: Array<{ toolCallId: string; ocrText: string }>,
): CompilerInvestigationFacade {
  const cache = new Map(
    entries.map((e) => [
      e.toolCallId,
      {
        toolCallId: e.toolCallId,
        pageNumber: 1,
        bbox: { x0: 0, y0: 0, x1: 10, y1: 10 },
        imagePath: "",
        ocrText: e.ocrText,
      },
    ]),
  );
  return {
    searchProjectText: () => [],
    findTextPattern: () => [],
    getPhysicalRun: async () => null,
    getRegionOcrCache: () => cache,
    getRegionOcrEntry: (id: string) => cache.get(id),
  } as unknown as CompilerInvestigationFacade;
}

describe("B2.2L.6 definition governance", () => {
  it("accepts definition when property rawText matches schedule OCR cache", async () => {
    const facade = mockFacadeWithScheduleCache([
      {
        toolCallId: "schedule-p1-r0-panel",
        ocrText: "7/16 OSB SHEATHING ONE SIDE",
      },
      {
        toolCallId: "schedule-p1-r0-field",
        ocrText: "8d NAILS 12 OC",
      },
    ]);
    const governor = new DictionaryGovernor(facade);
    const dict = projectDictionarySchema.parse({
      projectId: "test",
      generatedAt: new Date().toISOString(),
      interpreterModel: "test",
      experimentBranch: "compiler_heavy",
      observations: [],
      hypotheses: [],
      definitions: [
        {
          semanticTypeKey: "SW1",
          sourcePage: 1,
          properties: [
            {
              propertyPath: "assembly.sheathingType",
              rawText: "7/16 OSB",
            },
            {
              propertyPath: "assembly.nailingPattern.field",
              rawText: "8d NAILS",
            },
          ],
          status: "definition",
          provenance: [
            {
              kind: "compiler",
              pageNumber: 1,
              toolCallId: "schedule-p1-r0-row",
            },
          ],
        },
      ],
      bindings: [],
      unresolved: [],
      contradictions: [],
      metrics: { toolCalls: 0, tokens: 0, durationMs: 0 },
    });

    const report = await governor.govern(dict);
    assert.ok(report.acceptedDefinitionKeys.includes("SW1"));
    assert.ok(
      report.validatorResults.some(
        (r) =>
          r.validator === "verifyDefinitionPropertyCitation" &&
          r.claimId === "SW1" &&
          r.passed,
      ),
    );
  });

  it("rejects definition when property rawText absent from schedule OCR cache", async () => {
    const facade = mockFacadeWithScheduleCache([
      {
        toolCallId: "schedule-p1-r0-panel",
        ocrText: "GYPSUM WALLBOARD",
      },
    ]);
    const governor = new DictionaryGovernor(facade);
    const dict = projectDictionarySchema.parse({
      projectId: "test",
      generatedAt: new Date().toISOString(),
      interpreterModel: "test",
      experimentBranch: "compiler_heavy",
      observations: [],
      hypotheses: [],
      definitions: [
        {
          semanticTypeKey: "SW2",
          sourcePage: 1,
          properties: [
            {
              propertyPath: "assembly.sheathingType",
              rawText: "15/32 CDX PLYWOOD",
            },
          ],
          status: "definition",
          provenance: [
            {
              kind: "compiler",
              pageNumber: 1,
              toolCallId: "schedule-p1-r1-row",
            },
          ],
        },
      ],
      bindings: [],
      unresolved: [],
      contradictions: [],
      metrics: { toolCalls: 0, tokens: 0, durationMs: 0 },
    });

    const report = await governor.govern(dict);
    assert.ok(report.rejectedDefinitionKeys.includes("SW2"));
    assert.ok(
      report.validatorResults.some(
        (r) =>
          r.validator === "verifyDefinitionPropertyCitation" &&
          !r.passed,
      ),
    );
  });
});
