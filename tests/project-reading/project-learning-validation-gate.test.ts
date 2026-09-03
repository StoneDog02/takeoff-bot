import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { interpretProjectLearningRegionsDeterministic } from "../../src/project-reading/projectLearning/interpretProjectLearningRegions.js";
import {
  contextEligibleDefinitions,
  validateProjectLearningDefinitions,
} from "../../src/project-reading/projectLearning/validateProjectLearningDefinitions.js";
import {
  isContextEligible,
  projectLearningCandidateSchema,
  type ProjectLearningCandidate,
} from "../../src/project-reading/projectLearning/projectLearningTypes.js";
import { runProjectLearning } from "../../src/project-reading/projectLearning/runProjectLearning.js";
import type { PlanIndex } from "../../src/pdf/PlanIndex.js";
import type { ClassifiedPlanPage } from "../../src/pdf/pageClassification.js";

function harvestedCandidate(
  partial: Partial<ProjectLearningCandidate> &
    Pick<ProjectLearningCandidate, "id" | "rawValue">,
): ProjectLearningCandidate {
  return projectLearningCandidateSchema.parse({
    pageNumber: 1,
    sourceKind: "odl-hybrid",
    elementType: "table",
    validationStatus: "harvested",
    ...partial,
  });
}

describe("project learning validation gate", () => {
  it("keeps raw Hybrid harvest candidates out of context-eligible set", () => {
    const raw = harvestedCandidate({
      id: "pl-raw-sw",
      rawValue: "SW2 7/16 OSB noisy OCR cell",
      definitionKind: "shear-wall",
    });
    assert.equal(isContextEligible(raw.validationStatus), false);

    const interpreted = interpretProjectLearningRegionsDeterministic({
      candidates: [raw],
    });
    assert.equal(interpreted[0]?.validationStatus, "harvested");

    const validated = validateProjectLearningDefinitions({
      candidates: interpreted,
    });
    assert.equal(validated.validatedDefinitions.length, 0);
    assert.equal(contextEligibleDefinitions(validated.candidates).length, 0);
    assert.equal(validated.candidates[0]?.validationStatus, "harvested");
  });

  it("promotes interpreted proposals with valid keys to validated definitions", () => {
    const seed = harvestedCandidate({
      id: "pl-sw2",
      rawValue: "table shear wall",
      definitionKind: "shear-wall",
    });
    const interpreted = interpretProjectLearningRegionsDeterministic({
      candidates: [seed],
      proposals: [
        {
          candidateId: "pl-sw2",
          semanticTypeKey: "SW2",
          definitionKind: "shear-wall",
          properties: [{ propertyPath: "sheathing", rawText: '7/16" OSB' }],
          interpretedValue: "SW2 sheathing 7/16 OSB",
        },
      ],
    });
    assert.equal(interpreted[0]?.validationStatus, "interpreted");

    const validated = validateProjectLearningDefinitions({
      candidates: interpreted,
      provenanceToolCallId: "project-learning-test",
    });
    assert.equal(validated.acceptedKeys.includes("SW2"), true);
    assert.equal(validated.validatedDefinitions.length, 1);
    assert.equal(validated.candidates[0]?.validationStatus, "validated");
    assert.ok(isContextEligible("validated"));
  });

  it("marks cross-check disagreements as conflict, not context-eligible", () => {
    const seed = harvestedCandidate({
      id: "pl-sw2-conflict",
      rawValue: "table",
      definitionKind: "shear-wall",
    });
    const interpreted = interpretProjectLearningRegionsDeterministic({
      candidates: [seed],
      proposals: [
        {
          candidateId: "pl-sw2-conflict",
          semanticTypeKey: "SW2",
          definitionKind: "shear-wall",
          properties: [{ propertyPath: "sheathing", rawText: "PLYWOOD A" }],
          interpretedValue: "SW2 PLYWOOD A",
        },
      ],
    });
    const validated = validateProjectLearningDefinitions({
      candidates: interpreted,
      crossCheckByKey: new Map([["SW2", ["7/16 OSB"]]]),
    });
    assert.equal(validated.candidates[0]?.validationStatus, "conflict");
    assert.equal(validated.validatedDefinitions.length, 0);
    assert.equal(contextEligibleDefinitions(validated.candidates).length, 0);
  });

  it("runProjectLearning with seeds never injects harvested-only into validatedDefinitions", async () => {
    const planIndex = {
      pdfPath: "/tmp/fixture.pdf",
      pages: [{ pageNumber: 1, textContent: "", sheetId: null, label: null }],
    } as unknown as PlanIndex;
    const classifiedPages = [
      {
        pageNumber: 1,
        pageKind: "schedule",
        contentRoles: ["schedule"],
      },
    ] as unknown as ClassifiedPlanPage[];

    const result = await runProjectLearning({
      projectId: "fixture",
      planIndex,
      classifiedPages,
      artifactOutputDir: "/tmp/project-learning-test",
      allowLiveOdl: false,
      seedCandidates: [
        harvestedCandidate({
          id: "pl-noise",
          rawValue: "Hybrid OCR garbage SW2 ???",
          sourceKind: "odl-hybrid",
        }),
      ],
    });

    assert.ok(
      result.payload.candidates.every((c) => c.validationStatus === "harvested"),
    );
    assert.equal(result.validatedDefinitions.length, 0);
  });
});
