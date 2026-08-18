import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { reviewItemSchema } from "../../src/core/schemas/review-item.schema.js";
import {
  validationIssueSchema,
  validationResultSchema,
} from "../../src/core/schemas/validation.schema.js";
import type { WallFramingPayload } from "../../src/scopes/framing/schemas/framing-artifacts.schema.js";
import {
  WALL_FRAMING_RULE_IDS,
  WALL_QUANTITY_KEYS,
} from "../../src/scopes/framing/validators/rule-ids.js";
import { validateWallFraming } from "../../src/scopes/framing/validators/wall-framing.validator.js";

const complete = {
  status: "complete",
  percentage: 100,
  completedItems: 1,
  totalItems: 1,
} as const;

function buildCompletePayload(
  overrides: Partial<WallFramingPayload> = {},
): WallFramingPayload {
  return {
    walls: [
      {
        id: "W-001",
        objectType: "building-wall",
        completion: complete,
        reviewStatus: "no-review-required",
        blockingStatus: "not-blocked",
        evidenceIds: ["E-001"],
        assumptionIds: [],
        validationIssueIds: [],
        reviewItemIds: [],
        resolutionTraces: [
          {
            propertyPath: "assembly.heightFeet",
            method: "explicit-project-value",
            explanation: "Height is explicit on the plan.",
            evidenceIds: ["E-001"],
            assumptionIds: [],
            validationIssueIds: [],
            reviewItemIds: [],
          },
        ],
        name: "Exterior wall W-001",
        level: "Level 1",
        wallType: "exterior-wood-stud-wall",
        location: "exterior",
        bearingStatus: "non-bearing",
        isShearOrBraced: false,
        fireRating: null,
        constructionPhase: "new",
        assembly: {
          material: "dimensional-lumber",
          studSize: "2x4",
          studSpacingInches: 16,
          heightFeet: 8,
          plateCount: 3,
          sheathing: null,
        },
        segmentIds: ["WS-001"],
      },
    ],
    segments: [
      {
        id: "WS-001",
        objectType: "wall-segment",
        completion: complete,
        reviewStatus: "no-review-required",
        blockingStatus: "not-blocked",
        evidenceIds: ["E-002"],
        assumptionIds: [],
        validationIssueIds: [],
        reviewItemIds: [],
        resolutionTraces: [
          {
            propertyPath: "lengthFeet",
            method: "explicit-project-value",
            explanation: "Length is explicit on the plan.",
            evidenceIds: ["E-002"],
            assumptionIds: [],
            validationIssueIds: [],
            reviewItemIds: [],
          },
        ],
        parentWallId: "W-001",
        lengthFeet: 24,
        openingIds: [],
      },
    ],
    ...overrides,
  };
}

describe("validateWallFraming", () => {
  it("accepts a complete wall and segment with passing results", () => {
    const batch = validateWallFraming(buildCompletePayload());

    assert.equal(batch.validationIssues.length, 0);
    assert.equal(batch.reviewItems.length, 0);
    assert.ok(batch.validationResults.length > 0);
    assert.ok(
      batch.validationResults.every((result) => result.outcome === "passed"),
    );
  });

  it("fails a dangling segment parent with an actionable review item", () => {
    const payload = buildCompletePayload({
      segments: [
        {
          ...buildCompletePayload().segments[0]!,
          parentWallId: "W-MISSING",
        },
      ],
    });

    const batch = validateWallFraming(payload);
    const issue = batch.validationIssues.find(
      (entry) => entry.ruleId === WALL_FRAMING_RULE_IDS.segmentParentResolved,
    );
    const reviewItem = batch.reviewItems.find(
      (entry) => entry.origin === "validation",
    );

    assert.ok(issue);
    assert.equal(issue.severity, "critical");
    assert.ok(reviewItem);
    assert.equal(reviewItem.kind, "actionable");
    assert.equal(reviewItem.blockingStatus, "blocked");
    assert.deepEqual(issue.reviewItemIds, [reviewItem.id]);
    assert.deepEqual(reviewItem.validationIssueIds, [issue.id]);
  });

  it("fails inconsistent wall and segment relationships", () => {
    const payload = buildCompletePayload({
      walls: [
        {
          ...buildCompletePayload().walls[0]!,
          segmentIds: [],
        },
      ],
    });

    const batch = validateWallFraming(payload);
    const issue = batch.validationIssues.find(
      (entry) => entry.ruleId === WALL_FRAMING_RULE_IDS.segmentsConsistent,
    );

    assert.ok(issue);
    assert.match(issue.explanation, /not listed on the wall/);
  });

  it("fails unresolved wall type", () => {
    const payload = buildCompletePayload({
      walls: [
        {
          ...buildCompletePayload().walls[0]!,
          wallType: null,
        },
      ],
    });

    const batch = validateWallFraming(payload);
    const issue = batch.validationIssues.find(
      (entry) => entry.ruleId === WALL_FRAMING_RULE_IDS.typeResolved,
    );

    assert.ok(issue);
    assert.equal(issue.severity, "critical");
  });

  it("creates warning issues for unresolved location and bearing", () => {
    const payload = buildCompletePayload({
      walls: [
        {
          ...buildCompletePayload().walls[0]!,
          location: "unknown",
          bearingStatus: "unknown",
        },
      ],
    });

    const batch = validateWallFraming(payload);
    const locationIssue = batch.validationIssues.find(
      (entry) => entry.ruleId === WALL_FRAMING_RULE_IDS.locationResolved,
    );
    const bearingIssue = batch.validationIssues.find(
      (entry) => entry.ruleId === WALL_FRAMING_RULE_IDS.bearingResolved,
    );

    assert.ok(locationIssue);
    assert.equal(locationIssue.severity, "warning");
    assert.ok(bearingIssue);
    assert.equal(bearingIssue.severity, "warning");
    assert.equal(
      batch.reviewItems.find((item) => item.id === locationIssue.reviewItemIds[0])
        ?.blockingStatus,
      "not-blocked",
    );
  });

  it("blocks only length-dependent quantities when segment length is missing", () => {
    const payload = buildCompletePayload({
      segments: [
        {
          ...buildCompletePayload().segments[0]!,
          lengthFeet: null,
          resolutionTraces: [],
        },
      ],
    });

    const batch = validateWallFraming(payload);
    const issue = batch.validationIssues.find(
      (entry) => entry.ruleId === WALL_FRAMING_RULE_IDS.geometryLengthResolved,
    );

    assert.ok(issue);
    assert.equal(issue.severity, "blocking");
    assert.deepEqual(
      issue.quantityImpacts.map((impact) => impact.quantityKey),
      [WALL_QUANTITY_KEYS.studs, WALL_QUANTITY_KEYS.plates],
    );
    assert.ok(
      issue.quantityImpacts.every((impact) => impact.canCalculate === false),
    );
  });

  it("blocks only height-dependent quantities when wall height is missing", () => {
    const payload = buildCompletePayload({
      walls: [
        {
          ...buildCompletePayload().walls[0]!,
          assembly: {
            ...buildCompletePayload().walls[0]!.assembly,
            heightFeet: null,
          },
          resolutionTraces: [],
        },
      ],
    });

    const batch = validateWallFraming(payload);
    const issue = batch.validationIssues.find(
      (entry) => entry.ruleId === WALL_FRAMING_RULE_IDS.heightResolved,
    );

    assert.ok(issue);
    assert.equal(issue.severity, "warning");
    const studsImpact = issue.quantityImpacts.find(
      (impact) => impact.quantityKey === WALL_QUANTITY_KEYS.studs,
    );
    const platesImpact = issue.quantityImpacts.find(
      (impact) => impact.quantityKey === WALL_QUANTITY_KEYS.plates,
    );
    const sheathingImpact = issue.quantityImpacts.find(
      (impact) => impact.quantityKey === WALL_QUANTITY_KEYS.sheathing,
    );

    assert.equal(studsImpact?.canCalculate, true);
    assert.equal(platesImpact?.canCalculate, true);
    assert.equal(sheathingImpact?.canCalculate, false);
    assert.equal(
      batch.reviewItems.find((item) => item.id === issue.reviewItemIds[0])
        ?.blockingStatus,
      "partially-blocked",
    );
  });

  it("passes unresolved height when a resolution trace records a resolved method", () => {
    const payload = buildCompletePayload({
      walls: [
        {
          ...buildCompletePayload().walls[0]!,
          assembly: {
            ...buildCompletePayload().walls[0]!.assembly,
            heightFeet: null,
          },
          resolutionTraces: [
            {
              propertyPath: "assembly.heightFeet",
              method: "approved-default",
              explanation: "Approved default applied during resolution.",
              evidenceIds: ["E-001"],
              assumptionIds: ["A-001"],
              validationIssueIds: [],
              reviewItemIds: [],
            },
          ],
        },
      ],
    });

    const batch = validateWallFraming(payload);
    const heightResult = batch.validationResults.find(
      (result) => result.ruleId === WALL_FRAMING_RULE_IDS.heightResolved,
    );

    assert.equal(heightResult?.outcome, "passed");
  });

  it("produces deterministic IDs and output across identical reruns", () => {
    const payload = buildCompletePayload({
      walls: [
        {
          ...buildCompletePayload().walls[0]!,
          wallType: null,
        },
      ],
    });

    const first = validateWallFraming(payload);
    const second = validateWallFraming(payload);

    assert.deepEqual(first, second);
    const typeIssue = first.validationIssues.find(
      (entry) => entry.ruleId === WALL_FRAMING_RULE_IDS.typeResolved,
    );
    const typeResult = first.validationResults.find(
      (entry) => entry.ruleId === WALL_FRAMING_RULE_IDS.typeResolved,
    );
    const typeReviewItem = first.reviewItems.find((entry) =>
      entry.validationIssueIds.includes(typeIssue!.id),
    );

    assert.equal(typeIssue?.id, "VI-wall-type-resolved-object-W-001");
    assert.equal(typeResult?.id, "VR-wall-type-resolved-object-W-001");
    assert.equal(typeReviewItem?.id, "RI-wall-type-resolved-object-W-001");
  });

  it("parses generated issues, results, and review items through core schemas", () => {
    const payload = buildCompletePayload({
      walls: [
        {
          ...buildCompletePayload().walls[0]!,
          wallType: null,
          location: "unknown",
          assembly: {
            ...buildCompletePayload().walls[0]!.assembly,
            heightFeet: null,
          },
          resolutionTraces: [],
        },
      ],
      segments: [
        {
          ...buildCompletePayload().segments[0]!,
          lengthFeet: null,
          resolutionTraces: [],
        },
      ],
    });

    const batch = validateWallFraming(payload);

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
