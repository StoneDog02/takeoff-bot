import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { reviewItemSchema } from "../../src/core/schemas/review-item.schema.js";
import {
  validationIssueSchema,
  validationResultSchema,
} from "../../src/core/schemas/validation.schema.js";
import type { SheathingPayload } from "../../src/scopes/framing/schemas/framing-artifacts.schema.js";
import {
  SHEATHING_QUANTITY_KEYS,
  SHEATHING_RULE_IDS,
} from "../../src/scopes/framing/validators/rule-ids.js";
import { validateSheathing } from "../../src/scopes/framing/validators/sheathing.validator.js";

const complete = {
  status: "complete",
  percentage: 100,
  completedItems: 1,
  totalItems: 1,
} as const;

function buildCompleteSystem(
  overrides: Partial<SheathingPayload["systems"][number]> = {},
): SheathingPayload["systems"][number] {
  return {
    id: "SHS-001",
    objectType: "sheathing-system",
    completion: complete,
    reviewStatus: "no-review-required",
    blockingStatus: "not-blocked",
    evidenceIds: ["E-SHS-001"],
    assumptionIds: [],
    validationIssueIds: [],
    reviewItemIds: [],
    resolutionTraces: [
      {
        propertyPath: "panelSpecification.panelType",
        method: "explicit-project-value",
        explanation: "Panel type is explicit in structural notes.",
        evidenceIds: ["E-SHS-001"],
        assumptionIds: [],
        validationIssueIds: [],
        reviewItemIds: [],
      },
      {
        propertyPath: "panelSpecification.thickness",
        method: "explicit-project-value",
        explanation: "Panel thickness is explicit in structural notes.",
        evidenceIds: ["E-SHS-001"],
        assumptionIds: [],
        validationIssueIds: [],
        reviewItemIds: [],
      },
    ],
    name: "Level 1 exterior wall sheathing",
    level: "Level 1",
    application: "wall",
    constructionPhase: "new",
    panelSpecification: {
      panelType: "OSB",
      thickness: '7/16"',
      grade: null,
      spanRating: null,
      exposureRating: null,
      edgeTreatment: null,
      specificationReference: "S1.0 wall sheathing note",
    },
    areaIds: ["SHA-001"],
    ...overrides,
  };
}

function buildCompleteArea(
  overrides: Partial<SheathingPayload["areas"][number]> = {},
): SheathingPayload["areas"][number] {
  return {
    id: "SHA-001",
    objectType: "sheathing-area",
    completion: complete,
    reviewStatus: "no-review-required",
    blockingStatus: "not-blocked",
    evidenceIds: ["E-SHA-001"],
    assumptionIds: [],
    validationIssueIds: [],
    reviewItemIds: [],
    resolutionTraces: [
      {
        propertyPath: "areaSquareFeet",
        method: "explicit-project-value",
        explanation: "Area is explicit on the elevation.",
        evidenceIds: ["E-SHA-001"],
        assumptionIds: [],
        validationIssueIds: [],
        reviewItemIds: [],
      },
    ],
    parentSystemId: "SHS-001",
    layout: "horizontal",
    areaSquareFeet: 320,
    coveredObjectIds: ["W-001"],
    openingIds: ["O-014"],
    ...overrides,
  };
}

function buildRelatedMaps() {
  return {
    relatedObjectsById: new Map([
      ["W-001", { objectId: "W-001", objectType: "building-wall" }],
    ]),
    openingsById: new Map([
      ["O-014", { objectId: "O-014", objectType: "opening" }],
    ]),
  };
}

describe("validateSheathing", () => {
  it("accepts a complete sheathing system and area with passing results", () => {
    const batch = validateSheathing({
      payload: {
        systems: [buildCompleteSystem()],
        areas: [buildCompleteArea()],
      },
      ...buildRelatedMaps(),
    });

    assert.equal(batch.validationIssues.length, 0);
    assert.equal(batch.reviewItems.length, 0);
    assert.ok(batch.validationResults.length > 0);
    assert.ok(
      batch.validationResults.every((result) => result.outcome === "passed"),
    );
  });

  it("fails a dangling parent system reference on an area", () => {
    const batch = validateSheathing({
      payload: {
        systems: [buildCompleteSystem()],
        areas: [buildCompleteArea({ parentSystemId: "SHS-MISSING" })],
      },
    });

    const issue = batch.validationIssues.find(
      (entry) =>
        entry.ruleId === SHEATHING_RULE_IDS.areaParentSystemResolved,
    );

    assert.ok(issue);
    assert.equal(issue.severity, "critical");
    assert.ok(
      issue.quantityImpacts.every((impact) => impact.canCalculate === false),
    );
  });

  it("fails inconsistent system and area relationships", () => {
    const batch = validateSheathing({
      payload: {
        systems: [buildCompleteSystem({ areaIds: ["SHA-MISSING"] })],
        areas: [buildCompleteArea()],
      },
    });

    const issue = batch.validationIssues.find(
      (entry) => entry.ruleId === SHEATHING_RULE_IDS.systemAreasConsistent,
    );

    assert.ok(issue);
    assert.equal(issue.severity, "critical");
  });

  it("fails unresolved sheathing application without blocking area takeoff", () => {
    const batch = validateSheathing({
      payload: {
        systems: [buildCompleteSystem({ application: "unknown" })],
        areas: [buildCompleteArea()],
      },
    });

    const issue = batch.validationIssues.find(
      (entry) => entry.ruleId === SHEATHING_RULE_IDS.applicationResolved,
    );

    assert.ok(issue);
    assert.equal(issue.severity, "critical");
    assert.equal(
      issue.quantityImpacts.find(
        (impact) => impact.quantityKey === SHEATHING_QUANTITY_KEYS.material,
      )?.canCalculate,
      false,
    );
    assert.equal(
      issue.quantityImpacts.find(
        (impact) => impact.quantityKey === SHEATHING_QUANTITY_KEYS.area,
      )?.canCalculate,
      true,
    );
  });

  it("fails missing required panel type and thickness without blocking area takeoff", () => {
    const batch = validateSheathing({
      payload: {
        systems: [
          buildCompleteSystem({
            panelSpecification: {
              panelType: null,
              thickness: null,
              grade: null,
              spanRating: null,
              exposureRating: null,
              edgeTreatment: null,
              specificationReference: null,
            },
            resolutionTraces: [],
          }),
        ],
        areas: [buildCompleteArea()],
      },
    });

    const typeIssue = batch.validationIssues.find(
      (entry) => entry.ruleId === SHEATHING_RULE_IDS.panelTypeResolved,
    );
    const thicknessIssue = batch.validationIssues.find(
      (entry) => entry.ruleId === SHEATHING_RULE_IDS.thicknessResolved,
    );

    assert.ok(typeIssue);
    assert.ok(thicknessIssue);
    assert.equal(typeIssue.severity, "critical");
    assert.equal(
      thicknessIssue.quantityImpacts.find(
        (impact) => impact.quantityKey === SHEATHING_QUANTITY_KEYS.material,
      )?.canCalculate,
      false,
    );
    assert.equal(
      thicknessIssue.quantityImpacts.find(
        (impact) => impact.quantityKey === SHEATHING_QUANTITY_KEYS.area,
      )?.canCalculate,
      true,
    );
  });

  it("fails unresolved sheathing area square footage without blocking material specification", () => {
    const batch = validateSheathing({
      payload: {
        systems: [buildCompleteSystem()],
        areas: [
          buildCompleteArea({
            areaSquareFeet: null,
            resolutionTraces: [],
          }),
        ],
      },
    });

    const issue = batch.validationIssues.find(
      (entry) => entry.ruleId === SHEATHING_RULE_IDS.areaSquareFeetResolved,
    );

    assert.ok(issue);
    assert.equal(issue.severity, "critical");
    assert.equal(
      issue.quantityImpacts.find(
        (impact) => impact.quantityKey === SHEATHING_QUANTITY_KEYS.area,
      )?.canCalculate,
      false,
    );
    assert.equal(
      issue.quantityImpacts.find(
        (impact) => impact.quantityKey === SHEATHING_QUANTITY_KEYS.material,
      )?.canCalculate,
      true,
    );
  });

  it("warns on dangling covered object references", () => {
    const batch = validateSheathing({
      payload: {
        systems: [buildCompleteSystem()],
        areas: [buildCompleteArea({ coveredObjectIds: ["W-MISSING"] })],
      },
      relatedObjectsById: buildRelatedMaps().relatedObjectsById,
    });

    const issue = batch.validationIssues.find(
      (entry) => entry.ruleId === SHEATHING_RULE_IDS.coveredObjectsResolved,
    );

    assert.ok(issue);
    assert.equal(issue.severity, "warning");
    assert.equal(issue.quantityImpacts[0]?.canCalculate, true);
  });

  it("warns on dangling opening references", () => {
    const batch = validateSheathing({
      payload: {
        systems: [buildCompleteSystem()],
        areas: [buildCompleteArea({ openingIds: ["O-MISSING"] })],
      },
      openingsById: buildRelatedMaps().openingsById,
    });

    const issue = batch.validationIssues.find(
      (entry) =>
        entry.ruleId === SHEATHING_RULE_IDS.openingReferencesResolved,
    );

    assert.ok(issue);
    assert.equal(issue.severity, "warning");
    assert.equal(issue.quantityImpacts[0]?.canCalculate, true);
  });

  it("skips covered-object and opening validation when related artifacts are not provided", () => {
    const batch = validateSheathing({
      payload: {
        systems: [buildCompleteSystem()],
        areas: [buildCompleteArea()],
      },
    });

    const coveredResult = batch.validationResults.find(
      (entry) => entry.ruleId === SHEATHING_RULE_IDS.coveredObjectsResolved,
    );
    const openingResult = batch.validationResults.find(
      (entry) =>
        entry.ruleId === SHEATHING_RULE_IDS.openingReferencesResolved,
    );

    assert.equal(coveredResult?.outcome, "skipped");
    assert.equal(openingResult?.outcome, "skipped");
  });

  it("produces deterministic IDs and output across identical reruns", () => {
    const batchInput = {
      payload: {
        systems: [buildCompleteSystem({ application: "unknown" })],
        areas: [buildCompleteArea()],
      },
    };

    const first = validateSheathing(batchInput);
    const second = validateSheathing(batchInput);

    assert.deepEqual(first, second);
    const applicationIssue = first.validationIssues.find(
      (entry) => entry.ruleId === SHEATHING_RULE_IDS.applicationResolved,
    );

    assert.equal(
      applicationIssue?.id,
      "VI-sheathing-system-application-resolved-object-SHS-001",
    );
  });

  it("parses generated issues, results, and review items through core schemas", () => {
    const batch = validateSheathing({
      payload: {
        systems: [
          buildCompleteSystem({
            application: "unknown",
            areaIds: ["SHA-MISSING"],
            panelSpecification: {
              panelType: null,
              thickness: null,
              grade: null,
              spanRating: null,
              exposureRating: null,
              edgeTreatment: null,
              specificationReference: null,
            },
            resolutionTraces: [],
          }),
        ],
        areas: [
          buildCompleteArea({
            parentSystemId: "SHS-MISSING",
            areaSquareFeet: null,
            coveredObjectIds: ["W-MISSING"],
            openingIds: ["O-MISSING"],
            resolutionTraces: [],
          }),
        ],
      },
      ...buildRelatedMaps(),
    });

    for (const issue of batch.validationIssues) {
      validationIssueSchema.parse(issue);
    }
    for (const result of batch.validationResults) {
      validationResultSchema.parse(result);
    }
    for (const item of batch.reviewItems) {
      reviewItemSchema.parse(item);
    }
  });
});
