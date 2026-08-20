import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { reviewItemSchema } from "../../src/core/schemas/review-item.schema.js";
import {
  validationIssueSchema,
  validationResultSchema,
} from "../../src/core/schemas/validation.schema.js";
import type { FloorFramingPayload } from "../../src/scopes/framing/schemas/framing-artifacts.schema.js";
import { validateFloorFraming } from "../../src/scopes/framing/validators/floor-framing.validator.js";
import {
  FLOOR_FRAMING_RULE_IDS,
  FLOOR_QUANTITY_KEYS,
} from "../../src/scopes/framing/validators/rule-ids.js";

const complete = {
  status: "complete",
  percentage: 100,
  completedItems: 1,
  totalItems: 1,
} as const;

function buildCompleteSystem(
  overrides: Partial<FloorFramingPayload["systems"][number]> = {},
): FloorFramingPayload["systems"][number] {
  return {
    id: "FFS-001",
    objectType: "floor-framing-system",
    completion: complete,
    reviewStatus: "no-review-required",
    blockingStatus: "not-blocked",
    evidenceIds: ["E-FFS-001"],
    assumptionIds: [],
    validationIssueIds: [],
    reviewItemIds: [],
    resolutionTraces: [
      {
        propertyPath: "assembly.joistType",
        method: "explicit-project-value",
        explanation: "Joist type is explicit on the plan.",
        evidenceIds: ["E-FFS-001"],
        assumptionIds: [],
        validationIssueIds: [],
        reviewItemIds: [],
      },
      {
        propertyPath: "assembly.joistSize",
        method: "explicit-project-value",
        explanation: "Joist size is explicit on the schedule.",
        evidenceIds: ["E-FFS-001"],
        assumptionIds: [],
        validationIssueIds: [],
        reviewItemIds: [],
      },
      {
        propertyPath: "assembly.joistSpacingInches",
        method: "explicit-project-value",
        explanation: "Joist spacing is explicit on the schedule.",
        evidenceIds: ["E-FFS-001"],
        assumptionIds: [],
        validationIssueIds: [],
        reviewItemIds: [],
      },
    ],
    name: "Level 2 floor framing",
    level: "Level 2",
    constructionPhase: "new",
    assembly: {
      joistType: "i-joist",
      joistSize: "11-7/8",
      joistSpacingInches: 16,
      rimBoard: "1-1/8 rim board",
    },
    areaIds: ["FFA-001"],
    ...overrides,
  };
}

function buildCompleteArea(
  overrides: Partial<FloorFramingPayload["areas"][number]> = {},
): FloorFramingPayload["areas"][number] {
  return {
    id: "FFA-001",
    objectType: "floor-framing-area",
    completion: complete,
    reviewStatus: "no-review-required",
    blockingStatus: "not-blocked",
    evidenceIds: ["E-FFA-001"],
    assumptionIds: [],
    validationIssueIds: [],
    reviewItemIds: [],
    resolutionTraces: [
      {
        propertyPath: "spanDirection",
        method: "explicit-project-value",
        explanation: "Span direction is explicit on the plan.",
        evidenceIds: ["E-FFA-001"],
        assumptionIds: [],
        validationIssueIds: [],
        reviewItemIds: [],
      },
      {
        propertyPath: "joistLayoutLengthFeet",
        method: "explicit-project-value",
        explanation: "Joist layout length is explicit on the plan.",
        evidenceIds: ["E-FFA-001"],
        assumptionIds: [],
        validationIssueIds: [],
        reviewItemIds: [],
      },
      {
        propertyPath: "joistMemberLengthFeet",
        method: "explicit-project-value",
        explanation: "Joist member length is explicit on the plan.",
        evidenceIds: ["E-FFA-001"],
        assumptionIds: [],
        validationIssueIds: [],
        reviewItemIds: [],
      },
      {
        propertyPath: "areaSquareFeet",
        method: "explicit-project-value",
        explanation: "Area square footage is explicit on the plan.",
        evidenceIds: ["E-FFA-001"],
        assumptionIds: [],
        validationIssueIds: [],
        reviewItemIds: [],
      },
    ],
    parentSystemId: "FFS-001",
    layout: "rectangular bay",
    framingDirection: "north-south",
    spanDirection: "north-south",
    joistLayoutLengthFeet: 20,
    joistMemberLengthFeet: 12,
    areaSquareFeet: 480,
    boundingWallIds: ["W-001"],
    openingIds: ["O-014"],
    structuralMemberIds: ["SM-008"],
    ...overrides,
  };
}

function buildRelatedMaps() {
  return {
    boundingWallsById: new Map([
      ["W-001", { objectId: "W-001", objectType: "building-wall" }],
    ]),
    openingsById: new Map([
      ["O-014", { objectId: "O-014", objectType: "opening" }],
    ]),
    structuralMembersById: new Map([
      ["SM-008", { objectId: "SM-008", objectType: "structural-member" }],
    ]),
  };
}

describe("validateFloorFraming", () => {
  it("accepts a complete floor system and area with passing results", () => {
    const batch = validateFloorFraming({
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
    const batch = validateFloorFraming({
      payload: {
        systems: [buildCompleteSystem()],
        areas: [
          buildCompleteArea({
            parentSystemId: "FFS-MISSING",
          }),
        ],
      },
    });

    const issue = batch.validationIssues.find(
      (entry) => entry.ruleId === FLOOR_FRAMING_RULE_IDS.areaParentSystemResolved,
    );

    assert.ok(issue);
    assert.equal(issue.severity, "critical");
    assert.equal(
      issue.quantityImpacts[0]?.quantityKey,
      FLOOR_QUANTITY_KEYS.joists,
    );
  });

  it("fails inconsistent system and area relationships", () => {
    const batch = validateFloorFraming({
      payload: {
        systems: [
          buildCompleteSystem({
            areaIds: ["FFA-MISSING"],
          }),
        ],
        areas: [buildCompleteArea()],
      },
    });

    const issue = batch.validationIssues.find(
      (entry) => entry.ruleId === FLOOR_FRAMING_RULE_IDS.systemAreasConsistent,
    );

    assert.ok(issue);
    assert.equal(issue.severity, "critical");
  });

  it("fails unresolved required system assembly properties", () => {
    const batch = validateFloorFraming({
      payload: {
        systems: [
          buildCompleteSystem({
            assembly: {
              joistType: null,
              joistSize: null,
              joistSpacingInches: null,
              rimBoard: null,
            },
            resolutionTraces: [],
          }),
        ],
        areas: [buildCompleteArea()],
      },
    });

    const joistSizeIssue = batch.validationIssues.find(
      (entry) => entry.ruleId === FLOOR_FRAMING_RULE_IDS.joistSizeResolved,
    );

    assert.ok(joistSizeIssue);
    assert.equal(joistSizeIssue.severity, "critical");
    assert.ok(
      joistSizeIssue.quantityImpacts.every((impact) => impact.canCalculate === false),
    );
  });

  it("fails unresolved span direction and layout length as critical joist blockers", () => {
    const batch = validateFloorFraming({
      payload: {
        systems: [buildCompleteSystem()],
        areas: [
          buildCompleteArea({
            spanDirection: null,
            joistLayoutLengthFeet: null,
            areaSquareFeet: null,
            resolutionTraces: [],
          }),
        ],
      },
    });

    const spanIssue = batch.validationIssues.find(
      (entry) => entry.ruleId === FLOOR_FRAMING_RULE_IDS.spanDirectionResolved,
    );
    const layoutIssue = batch.validationIssues.find(
      (entry) =>
        entry.ruleId === FLOOR_FRAMING_RULE_IDS.joistLayoutLengthResolved,
    );
    const areaIssue = batch.validationIssues.find(
      (entry) => entry.ruleId === FLOOR_FRAMING_RULE_IDS.areaSquareFeetResolved,
    );

    assert.ok(spanIssue);
    assert.ok(layoutIssue);
    assert.ok(areaIssue);
    assert.equal(spanIssue.severity, "critical");
    assert.equal(layoutIssue.severity, "critical");
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
      areaIssue.quantityImpacts.every((impact) => impact.canCalculate === true),
    );
  });

  it("does not block floor.joists when only areaSquareFeet is missing", () => {
    const batch = validateFloorFraming({
      payload: {
        systems: [buildCompleteSystem()],
        areas: [
          buildCompleteArea({
            areaSquareFeet: null,
            resolutionTraces: buildCompleteArea().resolutionTraces.filter(
              (trace) => trace.propertyPath !== "areaSquareFeet",
            ),
          }),
        ],
      },
    });

    const areaIssue = batch.validationIssues.find(
      (entry) => entry.ruleId === FLOOR_FRAMING_RULE_IDS.areaSquareFeetResolved,
    );
    assert.ok(areaIssue);
    assert.equal(areaIssue.severity, "warning");
    assert.ok(
      areaIssue.quantityImpacts.every((impact) => impact.canCalculate === true),
    );
    assert.equal(
      batch.validationIssues.some(
        (issue) =>
          issue.severity === "critical" &&
          issue.quantityImpacts.some(
            (impact) =>
              impact.quantityKey === FLOOR_QUANTITY_KEYS.joists &&
              impact.canCalculate === false,
          ),
      ),
      false,
    );
  });

  it("blocks only floor.joist-linear-feet when member length is missing", () => {
    const batch = validateFloorFraming({
      payload: {
        systems: [buildCompleteSystem()],
        areas: [
          buildCompleteArea({
            joistMemberLengthFeet: null,
            resolutionTraces: buildCompleteArea().resolutionTraces.filter(
              (trace) => trace.propertyPath !== "joistMemberLengthFeet",
            ),
          }),
        ],
      },
    });

    const memberIssue = batch.validationIssues.find(
      (entry) =>
        entry.ruleId === FLOOR_FRAMING_RULE_IDS.joistMemberLengthResolved,
    );
    assert.ok(memberIssue);
    assert.equal(memberIssue.severity, "warning");
    const countImpact = memberIssue.quantityImpacts.find(
      (impact) => impact.quantityKey === FLOOR_QUANTITY_KEYS.joists,
    );
    const lfImpact = memberIssue.quantityImpacts.find(
      (impact) => impact.quantityKey === FLOOR_QUANTITY_KEYS.joistLinearFeet,
    );
    assert.equal(countImpact?.canCalculate, true);
    assert.equal(lfImpact?.canCalculate, false);
  });

  it("blocks only LF for unsupported joist type classifications", () => {
    const batch = validateFloorFraming({
      payload: {
        systems: [
          buildCompleteSystem({
            assembly: {
              joistType: "floor-truss",
              joistSize: "18",
              joistSpacingInches: 24,
              rimBoard: null,
            },
          }),
        ],
        areas: [buildCompleteArea()],
      },
    });

    const typeIssue = batch.validationIssues.find(
      (entry) =>
        entry.ruleId === FLOOR_FRAMING_RULE_IDS.joistLinearFeetTypeSupported,
    );
    assert.ok(typeIssue);
    assert.equal(
      typeIssue.quantityImpacts.find(
        (impact) => impact.quantityKey === FLOOR_QUANTITY_KEYS.joists,
      )?.canCalculate,
      true,
    );
    assert.equal(
      typeIssue.quantityImpacts.find(
        (impact) => impact.quantityKey === FLOOR_QUANTITY_KEYS.joistLinearFeet,
      )?.canCalculate,
      false,
    );
  });

  it("skips bounding wall validation when related artifacts are not provided", () => {
    const batch = validateFloorFraming({
      payload: {
        systems: [buildCompleteSystem()],
        areas: [buildCompleteArea()],
      },
    });

    const boundingWallResult = batch.validationResults.find(
      (entry) => entry.ruleId === FLOOR_FRAMING_RULE_IDS.boundingWallsResolved,
    );

    assert.equal(boundingWallResult?.outcome, "skipped");
  });

  it("does not activate bounding-wall validation when only opening artifacts are provided", () => {
    const batch = validateFloorFraming({
      payload: {
        systems: [buildCompleteSystem()],
        areas: [buildCompleteArea()],
      },
      openingsById: buildRelatedMaps().openingsById,
    });

    const boundingWallResult = batch.validationResults.find(
      (entry) => entry.ruleId === FLOOR_FRAMING_RULE_IDS.boundingWallsResolved,
    );
    const openingResult = batch.validationResults.find(
      (entry) =>
        entry.ruleId === FLOOR_FRAMING_RULE_IDS.openingReferencesResolved,
    );

    assert.equal(boundingWallResult?.outcome, "skipped");
    assert.equal(openingResult?.outcome, "passed");
  });

  it("warns on dangling bounding wall references when related artifacts are provided", () => {
    const batch = validateFloorFraming({
      payload: {
        systems: [buildCompleteSystem()],
        areas: [
          buildCompleteArea({
            boundingWallIds: ["W-MISSING"],
          }),
        ],
      },
      ...buildRelatedMaps(),
    });

    const issue = batch.validationIssues.find(
      (entry) => entry.ruleId === FLOOR_FRAMING_RULE_IDS.boundingWallsResolved,
    );

    assert.ok(issue);
    assert.equal(issue.severity, "warning");
    assert.equal(issue.quantityImpacts[0]?.canCalculate, true);
  });

  it("produces deterministic IDs and output across identical reruns", () => {
    const batchInput = {
      payload: {
        systems: [
          buildCompleteSystem({
            assembly: {
              joistType: null,
              joistSize: "11-7/8",
              joistSpacingInches: 16,
              rimBoard: null,
            },
            resolutionTraces: [],
          }),
        ],
        areas: [buildCompleteArea()],
      },
    };

    const first = validateFloorFraming(batchInput);
    const second = validateFloorFraming(batchInput);

    assert.deepEqual(first, second);
    const joistTypeIssue = first.validationIssues.find(
      (entry) => entry.ruleId === FLOOR_FRAMING_RULE_IDS.joistTypeResolved,
    );

    assert.equal(
      joistTypeIssue?.id,
      "VI-floor-system-assembly-joistType-resolved-object-FFS-001",
    );
  });

  it("parses generated issues, results, and review items through core schemas", () => {
    const batch = validateFloorFraming({
      payload: {
        systems: [
          buildCompleteSystem({
            areaIds: ["FFA-MISSING"],
            assembly: {
              joistType: null,
              joistSize: null,
              joistSpacingInches: null,
              rimBoard: null,
            },
            resolutionTraces: [],
          }),
        ],
        areas: [
          buildCompleteArea({
            parentSystemId: "FFS-MISSING",
            spanDirection: null,
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
