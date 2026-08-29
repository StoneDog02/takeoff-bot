import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { runProjectLearning } from "../../src/project-interpreter/projectLearning/runProjectLearning.js";
import { validateProjectLearningDefinitions } from "../../src/project-interpreter/projectLearning/validateProjectLearningDefinitions.js";
import { projectLearningCandidateSchema } from "../../src/project-interpreter/projectLearning/projectLearningTypes.js";
import type { PlanIndex } from "../../src/plans/PlanIndex.js";
import type { ClassifiedPlanPage } from "../../src/plans/pageClassification.js";

describe("project learning Claude interpret vs validation gate", () => {
  it("uses deterministic interpret path when live Claude is disabled (CI)", async () => {
    const planIndex = {
      pdfPath: "/tmp/fixture.pdf",
      pages: [{ pageNumber: 1, textContent: "" }],
    } as unknown as PlanIndex;
    const classifiedPages = [
      {
        pageNumber: 1,
        pageKind: "schedule",
        contentRoles: ["schedule"],
      },
    ] as unknown as ClassifiedPlanPage[];

    const result = await runProjectLearning({
      projectId: "ci",
      planIndex,
      classifiedPages,
      artifactOutputDir: "/tmp/pl-ci-interpret",
      allowLiveOdl: false,
      allowLiveClaudeInterpret: false,
      seedCandidates: [
        projectLearningCandidateSchema.parse({
          id: "pl-sw2",
          pageNumber: 1,
          sourceKind: "fixture",
          elementType: "table",
          rawValue: "SW2 row",
          validationStatus: "harvested",
          definitionKind: "shear-wall",
        }),
      ],
      interpretProposals: [
        {
          candidateId: "pl-sw2",
          semanticTypeKey: "SW2",
          definitionKind: "shear-wall",
          properties: [{ propertyPath: "sheathing", rawText: '7/16" OSB' }],
          interpretedValue: "SW2 sheathing",
        },
      ],
    });

    assert.equal(result.payload.metrics.interpretPath, "deterministic");
    assert.equal(result.validatedDefinitions.length, 1);
    assert.equal(result.validatedDefinitions[0]?.semanticTypeKey, "SW2");
  });

  it("does not validate Claude-like proposals that fail the key/property gate", () => {
    const interpreted = [
      projectLearningCandidateSchema.parse({
        id: "bad",
        pageNumber: 1,
        sourceKind: "ocr-fullpage",
        elementType: "full-page-ocr",
        rawValue: "noise",
        validationStatus: "interpreted",
        definitionKind: "shear-wall",
        semanticTypeKey: "NOT-A-MARK",
        properties: [{ propertyPath: "x", rawText: "y" }],
      }),
    ];
    const validated = validateProjectLearningDefinitions({
      candidates: interpreted,
    });
    assert.equal(validated.validatedDefinitions.length, 0);
    assert.equal(validated.candidates[0]?.validationStatus, "rejected");
  });
});
