import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { reviewItemSchema } from "../../src/core/schemas/review-item.schema.js";
import {
  validationIssueSchema,
  validationResultSchema,
} from "../../src/core/schemas/validation.schema.js";
import type { RoofFramingPayload } from "../../src/scopes/framing/schemas/framing-artifacts.schema.js";
import { validateRoofFraming } from "../../src/scopes/framing/validators/roof-framing.validator.js";
import {
  ROOF_FRAMING_RULE_IDS,
  ROOF_QUANTITY_KEYS,
} from "../../src/scopes/framing/validators/rule-ids.js";

const complete = {
  status: "complete",
  percentage: 100,
  completedItems: 1,
  totalItems: 1,
} as const;

function buildCompleteSystem(
  overrides: Partial<RoofFramingPayload["systems"][number]> = {},
): RoofFramingPayload["systems"][number] {
  return {
    id: "RFS-001",
    objectType: "roof-framing-system",
    completion: complete,
    reviewStatus: "no-review-required",
    blockingStatus: "not-blocked",
    evidenceIds: ["E-RFS-001"],
    assumptionIds: [],
    validationIssueIds: [],
    reviewItemIds: [],
    resolutionTraces: [
      {
        propertyPath: "assembly.framingType",
        method: "explicit-project-value",
        explanation: "Framing type is explicit on the plan.",
        evidenceIds: ["E-RFS-001"],
        assumptionIds: [],
        validationIssueIds: [],
        reviewItemIds: [],
      },
      {
        propertyPath: "assembly.memberSize",
        method: "explicit-project-value",
        explanation: "Member size is explicit on the schedule.",
        evidenceIds: ["E-RFS-001"],
        assumptionIds: [],
        validationIssueIds: [],
        reviewItemIds: [],
      },
      {
        propertyPath: "assembly.memberSpacingInches",
        method: "explicit-project-value",
        explanation: "Member spacing is explicit on the schedule.",
        evidenceIds: ["E-RFS-001"],
        assumptionIds: [],
        validationIssueIds: [],
        reviewItemIds: [],
      },
    ],
    name: "Main roof framing",
    level: "Roof",
    constructionPhase: "new",
    assembly: {
      framingType: "rafter",
      memberSize: "2x8",
      memberSpacingInches: 24,
    },
    planeIds: ["RP-001"],
    ...overrides,
  };
}

function buildCompletePlane(
  overrides: Partial<RoofFramingPayload["planes"][number]> = {},
): RoofFramingPayload["planes"][number] {
  return {
    id: "RP-001",
    objectType: "roof-plane",
    completion: complete,
    reviewStatus: "no-review-required",
    blockingStatus: "not-blocked",
    evidenceIds: ["E-RP-001"],
    assumptionIds: [],
    validationIssueIds: [],
    reviewItemIds: [],
    resolutionTraces: [
      {
        propertyPath: "spanDirection",
        method: "explicit-project-value",
        explanation: "Span direction is explicit on the plan.",
        evidenceIds: ["E-RP-001"],
        assumptionIds: [],
        validationIssueIds: [],
        reviewItemIds: [],
      },
      {
        propertyPath: "rafterLayoutLengthFeet",
        method: "explicit-project-value",
        explanation: "Rafter layout length is explicit on the plan.",
        evidenceIds: ["E-RP-001"],
        assumptionIds: [],
        validationIssueIds: [],
        reviewItemIds: [],
      },
      {
        propertyPath: "pitch",
        method: "explicit-project-value",
        explanation: "Pitch is explicit on the elevation.",
        evidenceIds: ["E-RP-001"],
        assumptionIds: [],
        validationIssueIds: [],
        reviewItemIds: [],
      },
      {
        propertyPath: "areaSquareFeet",
        method: "explicit-project-value",
        explanation: "Area square footage is explicit on the plan.",
        evidenceIds: ["E-RP-001"],
        assumptionIds: [],
        validationIssueIds: [],
        reviewItemIds: [],
      },
    ],
    parentSystemId: "RFS-001",
    layout: "gable",
    framingDirection: "east-west",
    spanDirection: "east-west",
    rafterLayoutLengthFeet: 40,
    pitch: "6:12",
    areaSquareFeet: 720,
    boundingWallIds: ["W-001"],
    openingIds: ["O-021"],
    structuralMemberIds: ["SM-014"],
    ...overrides,
  };
}

function buildRelatedMaps() {
  return {
    boundingWallsById: new Map([
      ["W-001", { objectId: "W-001", objectType: "building-wall" }],
    ]),
    openingsById: new Map([
      ["O-021", { objectId: "O-021", objectType: "opening" }],
    ]),
    structuralMembersById: new Map([
      ["SM-014", { objectId: "SM-014", objectType: "structural-member" }],
    ]),
  };
}

describe("validateRoofFraming", () => {
  it("accepts a complete roof system and plane with passing results", () => {
    const batch = validateRoofFraming({
      payload: {
        systems: [buildCompleteSystem()],
        planes: [buildCompletePlane()],
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

  it("fails a dangling parent system reference on a plane", () => {
    const batch = validateRoofFraming({
      payload: {
        systems: [buildCompleteSystem()],
        planes: [
          buildCompletePlane({
            parentSystemId: "RFS-MISSING",
          }),
        ],
      },
    });

    const issue = batch.validationIssues.find(
      (entry) =>
        entry.ruleId === ROOF_FRAMING_RULE_IDS.planeParentSystemResolved,
    );

    assert.ok(issue);
    assert.equal(issue.severity, "critical");
    assert.equal(
      issue.quantityImpacts[0]?.quantityKey,
      ROOF_QUANTITY_KEYS.commonRafters,
    );
  });

  it("fails inconsistent system and plane relationships", () => {
    const batch = validateRoofFraming({
      payload: {
        systems: [
          buildCompleteSystem({
            planeIds: ["RP-MISSING"],
          }),
        ],
        planes: [buildCompletePlane()],
      },
    });

    const issue = batch.validationIssues.find(
      (entry) =>
        entry.ruleId === ROOF_FRAMING_RULE_IDS.systemPlanesConsistent,
    );

    assert.ok(issue);
    assert.equal(issue.severity, "critical");
  });

  it("fails unresolved required system assembly properties", () => {
    const batch = validateRoofFraming({
      payload: {
        systems: [
          buildCompleteSystem({
            assembly: {
              framingType: null,
              memberSize: null,
              memberSpacingInches: null,
            },
            resolutionTraces: [],
          }),
        ],
        planes: [buildCompletePlane()],
      },
    });

    const framingTypeIssue = batch.validationIssues.find(
      (entry) => entry.ruleId === ROOF_FRAMING_RULE_IDS.framingTypeResolved,
    );
    const memberSpacingIssue = batch.validationIssues.find(
      (entry) => entry.ruleId === ROOF_FRAMING_RULE_IDS.memberSpacingResolved,
    );
    const eligibilityResult = batch.validationResults.find(
      (entry) =>
        entry.ruleId === ROOF_FRAMING_RULE_IDS.framingTypeCommonRafterEligible,
    );

    assert.ok(framingTypeIssue);
    assert.ok(memberSpacingIssue);
    assert.equal(framingTypeIssue.severity, "critical");
    assert.ok(
      framingTypeIssue.quantityImpacts.every(
        (impact) => impact.canCalculate === false,
      ),
    );
    assert.equal(eligibilityResult?.outcome, "skipped");
  });

  it("warns and blocks common rafters when framing type is not stick-eligible", () => {
    const batch = validateRoofFraming({
      payload: {
        systems: [
          buildCompleteSystem({
            assembly: {
              framingType: "roof truss",
              memberSize: "2x8",
              memberSpacingInches: 24,
            },
          }),
        ],
        planes: [buildCompletePlane()],
      },
      ...buildRelatedMaps(),
    });

    const eligibilityIssue = batch.validationIssues.find(
      (entry) =>
        entry.ruleId === ROOF_FRAMING_RULE_IDS.framingTypeCommonRafterEligible,
    );

    assert.ok(eligibilityIssue);
    assert.equal(eligibilityIssue.severity, "warning");
    assert.equal(
      eligibilityIssue.quantityImpacts[0]?.quantityKey,
      ROOF_QUANTITY_KEYS.commonRafters,
    );
    assert.equal(eligibilityIssue.quantityImpacts[0]?.canCalculate, false);
  });

  it("fails unresolved span direction and layout length as critical count blockers", () => {
    const batch = validateRoofFraming({
      payload: {
        systems: [buildCompleteSystem()],
        planes: [
          buildCompletePlane({
            spanDirection: null,
            rafterLayoutLengthFeet: null,
            pitch: null,
            areaSquareFeet: null,
            resolutionTraces: [],
          }),
        ],
      },
    });

    const spanIssue = batch.validationIssues.find(
      (entry) => entry.ruleId === ROOF_FRAMING_RULE_IDS.spanDirectionResolved,
    );
    const layoutIssue = batch.validationIssues.find(
      (entry) =>
        entry.ruleId === ROOF_FRAMING_RULE_IDS.rafterLayoutLengthResolved,
    );
    const pitchIssue = batch.validationIssues.find(
      (entry) => entry.ruleId === ROOF_FRAMING_RULE_IDS.pitchResolved,
    );
    const areaIssue = batch.validationIssues.find(
      (entry) => entry.ruleId === ROOF_FRAMING_RULE_IDS.areaSquareFeetResolved,
    );

    assert.ok(spanIssue);
    assert.ok(layoutIssue);
    assert.ok(pitchIssue);
    assert.ok(areaIssue);
    assert.equal(spanIssue.severity, "critical");
    assert.equal(layoutIssue.severity, "critical");
    assert.equal(pitchIssue.severity, "warning");
    assert.equal(areaIssue.severity, "warning");
    assert.ok(
      spanIssue.quantityImpacts.every((impact) => impact.canCalculate === false),
    );
    assert.ok(
      layoutIssue.quantityImpacts.every(
        (impact) => impact.canCalculate === false,
      ),
    );
    assert.ok(
      pitchIssue.quantityImpacts.every((impact) => impact.canCalculate === true),
    );
    assert.ok(
      areaIssue.quantityImpacts.every((impact) => impact.canCalculate === true),
    );
  });

  it("does not block roof.common-rafters when only pitch or areaSquareFeet is missing", () => {
    const batch = validateRoofFraming({
      payload: {
        systems: [buildCompleteSystem()],
        planes: [
          buildCompletePlane({
            pitch: null,
            areaSquareFeet: null,
            resolutionTraces: buildCompletePlane().resolutionTraces.filter(
              (trace) =>
                trace.propertyPath !== "pitch" &&
                trace.propertyPath !== "areaSquareFeet",
            ),
          }),
        ],
      },
      ...buildRelatedMaps(),
    });

    const pitchIssue = batch.validationIssues.find(
      (entry) => entry.ruleId === ROOF_FRAMING_RULE_IDS.pitchResolved,
    );
    const areaIssue = batch.validationIssues.find(
      (entry) => entry.ruleId === ROOF_FRAMING_RULE_IDS.areaSquareFeetResolved,
    );

    assert.ok(pitchIssue);
    assert.ok(areaIssue);
    assert.equal(pitchIssue.severity, "warning");
    assert.equal(areaIssue.severity, "warning");
    assert.ok(
      pitchIssue.quantityImpacts.every((impact) => impact.canCalculate === true),
    );
    assert.ok(
      areaIssue.quantityImpacts.every((impact) => impact.canCalculate === true),
    );
    assert.equal(
      batch.validationIssues.some(
        (issue) =>
          issue.severity === "critical" &&
          issue.quantityImpacts.some(
            (impact) =>
              impact.quantityKey === ROOF_QUANTITY_KEYS.commonRafters &&
              impact.canCalculate === false,
          ),
      ),
      false,
    );
  });

  it("skips bounding wall validation when related artifacts are not provided", () => {
    const batch = validateRoofFraming({
      payload: {
        systems: [buildCompleteSystem()],
        planes: [buildCompletePlane()],
      },
    });

    const boundingWallResult = batch.validationResults.find(
      (entry) => entry.ruleId === ROOF_FRAMING_RULE_IDS.boundingWallsResolved,
    );

    assert.equal(boundingWallResult?.outcome, "skipped");
  });

  it("does not activate bounding-wall validation when only opening artifacts are provided", () => {
    const batch = validateRoofFraming({
      payload: {
        systems: [buildCompleteSystem()],
        planes: [buildCompletePlane()],
      },
      openingsById: buildRelatedMaps().openingsById,
    });

    const boundingWallResult = batch.validationResults.find(
      (entry) => entry.ruleId === ROOF_FRAMING_RULE_IDS.boundingWallsResolved,
    );
    const openingResult = batch.validationResults.find(
      (entry) =>
        entry.ruleId === ROOF_FRAMING_RULE_IDS.openingReferencesResolved,
    );

    assert.equal(boundingWallResult?.outcome, "skipped");
    assert.equal(openingResult?.outcome, "passed");
  });

  it("warns on dangling bounding wall references when related artifacts are provided", () => {
    const batch = validateRoofFraming({
      payload: {
        systems: [buildCompleteSystem()],
        planes: [
          buildCompletePlane({
            boundingWallIds: ["W-MISSING"],
          }),
        ],
      },
      ...buildRelatedMaps(),
    });

    const issue = batch.validationIssues.find(
      (entry) => entry.ruleId === ROOF_FRAMING_RULE_IDS.boundingWallsResolved,
    );

    assert.ok(issue);
    assert.equal(issue.severity, "warning");
    assert.equal(issue.quantityImpacts[0]?.canCalculate, true);
    assert.equal(
      issue.quantityImpacts[0]?.quantityKey,
      ROOF_QUANTITY_KEYS.commonRafters,
    );
  });

  it("produces deterministic IDs and output across identical reruns", () => {
    const batchInput = {
      payload: {
        systems: [
          buildCompleteSystem({
            assembly: {
              framingType: null,
              memberSize: "2x8",
              memberSpacingInches: 24,
            },
            resolutionTraces: [],
          }),
        ],
        planes: [buildCompletePlane()],
      },
    };

    const first = validateRoofFraming(batchInput);
    const second = validateRoofFraming(batchInput);

    assert.deepEqual(first, second);
    const framingTypeIssue = first.validationIssues.find(
      (entry) => entry.ruleId === ROOF_FRAMING_RULE_IDS.framingTypeResolved,
    );

    assert.equal(
      framingTypeIssue?.id,
      "VI-roof-system-assembly-framingType-resolved-object-RFS-001",
    );
  });

  it("parses generated issues, results, and review items through core schemas", () => {
    const batch = validateRoofFraming({
      payload: {
        systems: [
          buildCompleteSystem({
            planeIds: ["RP-MISSING"],
            assembly: {
              framingType: null,
              memberSize: null,
              memberSpacingInches: null,
            },
            resolutionTraces: [],
          }),
        ],
        planes: [
          buildCompletePlane({
            parentSystemId: "RFS-MISSING",
            spanDirection: null,
            rafterLayoutLengthFeet: null,
            pitch: null,
            areaSquareFeet: null,
            boundingWallIds: ["W-MISSING"],
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
