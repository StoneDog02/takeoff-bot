import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { reviewItemSchema } from "../../src/core/schemas/review-item.schema.js";
import {
  validationIssueSchema,
  validationResultSchema,
} from "../../src/core/schemas/validation.schema.js";
import type { OpeningsPayload } from "../../src/scopes/framing/schemas/framing-artifacts.schema.js";
import { validateOpenings } from "../../src/scopes/framing/validators/openings.validator.js";
import {
  OPENING_QUANTITY_KEYS,
  OPENINGS_RULE_IDS,
} from "../../src/scopes/framing/validators/rule-ids.js";

const complete = {
  status: "complete",
  percentage: 100,
  completedItems: 1,
  totalItems: 1,
} as const;

function buildCompleteOpening(
  overrides: Partial<OpeningsPayload["openings"][number]> = {},
): OpeningsPayload["openings"][number] {
  return {
    id: "O-014",
    objectType: "opening",
    completion: complete,
    reviewStatus: "no-review-required",
    blockingStatus: "not-blocked",
    evidenceIds: ["E-014"],
    assumptionIds: [],
    validationIssueIds: [],
    reviewItemIds: [],
    resolutionTraces: [
      {
        propertyPath: "dimensions.nominalWidthFeet",
        method: "explicit-project-value",
        explanation: "Nominal width is explicit on the plan.",
        evidenceIds: ["E-014"],
        assumptionIds: [],
        validationIssueIds: [],
        reviewItemIds: [],
      },
      {
        propertyPath: "dimensions.nominalHeightFeet",
        method: "explicit-project-value",
        explanation: "Nominal height is explicit on the plan.",
        evidenceIds: ["E-014"],
        assumptionIds: [],
        validationIssueIds: [],
        reviewItemIds: [],
      },
      {
        propertyPath: "dimensions.roughWidthFeet",
        method: "explicit-project-value",
        explanation: "Rough width is explicit on the schedule.",
        evidenceIds: ["E-014"],
        assumptionIds: [],
        validationIssueIds: [],
        reviewItemIds: [],
      },
      {
        propertyPath: "dimensions.roughHeightFeet",
        method: "explicit-project-value",
        explanation: "Rough height is explicit on the schedule.",
        evidenceIds: ["E-014"],
        assumptionIds: [],
        validationIssueIds: [],
        reviewItemIds: [],
      },
    ],
    category: "window",
    parentObjectId: "WS-001",
    parentWallId: "W-001",
    dimensions: {
      nominalWidthFeet: 3,
      nominalHeightFeet: 4,
      roughWidthFeet: 3.5,
      roughHeightFeet: 4.5,
    },
    quantity: 1,
    scheduleReference: "Window Schedule",
    headerMemberId: "SM-008",
    fireRating: null,
    kingStudCount: null,
    jackStudCount: null,
    ...overrides,
  };
}

function buildParentMaps() {
  return {
    parentObjectsById: new Map([
      ["WS-001", { objectId: "WS-001", objectType: "wall-segment" }],
      ["W-001", { objectId: "W-001", objectType: "building-wall" }],
    ]),
    structuralMembersById: new Map([
      ["SM-008", { objectId: "SM-008", objectType: "structural-member" }],
    ]),
  };
}

describe("validateOpenings", () => {
  it("passes when parentObjectId is null during independent resolution", () => {
    const batch = validateOpenings({
      payload: {
        openings: [
          buildCompleteOpening({
            parentObjectId: null,
            parentWallId: null,
            headerMemberId: null,
          }),
        ],
      },
    });

    const parentResult = batch.validationResults.find(
      (entry) => entry.ruleId === OPENINGS_RULE_IDS.parentResolved,
    );

    assert.equal(parentResult?.outcome, "passed");
    assert.equal(batch.validationIssues.length, 0);
  });

  it("accepts a complete opening with passing results", () => {
    const maps = buildParentMaps();
    const batch = validateOpenings({
      payload: { openings: [buildCompleteOpening()] },
      ...maps,
    });

    assert.equal(batch.validationIssues.length, 4);
    assert.equal(batch.reviewItems.length, 4);
    assert.ok(
      batch.reviewItems.some((item) => item.title.includes("Confirm king stud count")),
    );
    assert.ok(
      batch.reviewItems.some((item) => item.title.includes("Resolve jack stud count")),
    );
    assert.ok(
      batch.reviewItems.some((item) => item.title.includes("Confirm rough sill size")),
    );
    assert.ok(
      batch.reviewItems.some((item) => item.title.includes("Confirm cripple stud layout")),
    );
    assert.ok(
      batch.validationIssues.some(
        (issue) => issue.ruleId === OPENINGS_RULE_IDS.kingStudCountDefault,
      ),
    );
    assert.ok(
      batch.validationIssues.some(
        (issue) => issue.ruleId === OPENINGS_RULE_IDS.jackStudCountResolved,
      ),
    );
    assert.ok(
      batch.validationIssues.some(
        (issue) => issue.ruleId === OPENINGS_RULE_IDS.roughSillSizeDefault,
      ),
    );
    assert.ok(
      batch.validationIssues.some(
        (issue) => issue.ruleId === OPENINGS_RULE_IDS.crippleLayoutDefault,
      ),
    );
    assert.ok(batch.validationResults.length > 0);
    assert.ok(
      batch.validationResults.every(
        (result) =>
          result.outcome === "passed" ||
          result.ruleId === OPENINGS_RULE_IDS.kingStudCountDefault ||
          result.ruleId === OPENINGS_RULE_IDS.jackStudCountResolved ||
          result.ruleId === OPENINGS_RULE_IDS.roughSillSizeDefault ||
          result.ruleId === OPENINGS_RULE_IDS.crippleLayoutDefault,
      ),
    );
  });

  it("blocks only jack-studs when header is linked and jack count is missing", () => {
    const batch = validateOpenings({
      payload: {
        openings: [
          buildCompleteOpening({
            kingStudCount: 2,
            resolutionTraces: [
              ...buildCompleteOpening().resolutionTraces,
              {
                propertyPath: "kingStudCount",
                method: "explicit-project-value",
                explanation: "Explicit king count.",
                evidenceIds: ["E-014"],
                assumptionIds: [],
                validationIssueIds: [],
                reviewItemIds: [],
              },
            ],
          }),
        ],
      },
      ...buildParentMaps(),
    });

    const jackIssue = batch.validationIssues.find(
      (issue) => issue.ruleId === OPENINGS_RULE_IDS.jackStudCountResolved,
    );
    assert.ok(jackIssue);
    assert.equal(jackIssue.severity, "warning");
    assert.deepEqual(
      jackIssue.quantityImpacts.map((impact) => [
        impact.quantityKey,
        impact.canCalculate,
      ]),
      [[OPENING_QUANTITY_KEYS.jackStuds, false]],
    );
    assert.equal(
      batch.validationIssues.some(
        (issue) =>
          issue.quantityImpacts.some(
            (impact) =>
              impact.quantityKey === OPENING_QUANTITY_KEYS.kingStuds &&
              impact.canCalculate === false,
          ),
      ),
      false,
    );
  });

  it("skips jack count review when no header is linked", () => {
    const batch = validateOpenings({
      payload: {
        openings: [buildCompleteOpening({ headerMemberId: null })],
      },
      ...buildParentMaps(),
    });

    assert.equal(
      batch.validationIssues.some(
        (issue) => issue.ruleId === OPENINGS_RULE_IDS.jackStudCountResolved,
      ),
      false,
    );
  });

  it("fails a dangling parent reference with an actionable review item", () => {
    const batch = validateOpenings({
      payload: {
        openings: [
          buildCompleteOpening({
            parentObjectId: "WS-MISSING",
          }),
        ],
      },
      parentObjectsById: buildParentMaps().parentObjectsById,
    });

    const issue = batch.validationIssues.find(
      (entry) => entry.ruleId === OPENINGS_RULE_IDS.parentResolved,
    );
    const reviewItem = batch.reviewItems.find(
      (entry) => entry.validationIssueIds.includes(issue!.id),
    );

    assert.ok(issue);
    assert.equal(issue.severity, "critical");
    assert.ok(reviewItem);
    assert.equal(reviewItem.blockingStatus, "blocked");
  });

  it("skips parent validation when parent artifacts are not provided", () => {
    const batch = validateOpenings({
      payload: { openings: [buildCompleteOpening()] },
    });

    const parentResult = batch.validationResults.find(
      (entry) => entry.ruleId === OPENINGS_RULE_IDS.parentResolved,
    );

    assert.equal(parentResult?.outcome, "skipped");
  });

  it("fails unresolved opening category", () => {
    const batch = validateOpenings({
      payload: {
        openings: [buildCompleteOpening({ category: "unknown" })],
      },
      ...buildParentMaps(),
    });

    const issue = batch.validationIssues.find(
      (entry) => entry.ruleId === OPENINGS_RULE_IDS.categoryResolved,
    );

    assert.ok(issue);
    assert.equal(issue.severity, "critical");
    assert.equal(
      issue.quantityImpacts[0]?.quantityKey,
      OPENING_QUANTITY_KEYS.framing,
    );
  });

  it("fails missing required nominal dimensions", () => {
    const batch = validateOpenings({
      payload: {
        openings: [
          buildCompleteOpening({
            dimensions: {
              nominalWidthFeet: null,
              nominalHeightFeet: null,
              roughWidthFeet: 3.5,
              roughHeightFeet: 4.5,
            },
            resolutionTraces: [],
          }),
        ],
      },
      ...buildParentMaps(),
    });

    const issue = batch.validationIssues.find(
      (entry) => entry.ruleId === OPENINGS_RULE_IDS.nominalDimensionsResolved,
    );

    assert.ok(issue);
    assert.equal(issue.severity, "critical");
    assert.ok(
      issue.quantityImpacts.every((impact) => impact.canCalculate === false),
    );
  });

  it("warns on unresolved rough dimensions without blocking nominal-based framing", () => {
    const batch = validateOpenings({
      payload: {
        openings: [
          buildCompleteOpening({
            dimensions: {
              nominalWidthFeet: 3,
              nominalHeightFeet: 4,
              roughWidthFeet: null,
              roughHeightFeet: null,
            },
            resolutionTraces: [],
          }),
        ],
      },
      ...buildParentMaps(),
    });

    const issue = batch.validationIssues.find(
      (entry) => entry.ruleId === OPENINGS_RULE_IDS.roughDimensionsResolved,
    );

    assert.ok(issue);
    assert.equal(issue.severity, "warning");
    assert.equal(
      issue.quantityImpacts.find(
        (impact) => impact.quantityKey === OPENING_QUANTITY_KEYS.framing,
      )?.canCalculate,
      true,
    );
    assert.equal(
      issue.quantityImpacts.find(
        (impact) => impact.quantityKey === OPENING_QUANTITY_KEYS.roughSill,
      )?.canCalculate,
      false,
    );
  });

  it("fails unresolved header member reference when a header ID is present", () => {
    const maps = buildParentMaps();
    const batch = validateOpenings({
      payload: {
        openings: [
          buildCompleteOpening({
            headerMemberId: "SM-MISSING",
          }),
        ],
      },
      parentObjectsById: maps.parentObjectsById,
      structuralMembersById: maps.structuralMembersById,
    });

    const issue = batch.validationIssues.find(
      (entry) => entry.ruleId === OPENINGS_RULE_IDS.headerReferenceResolved,
    );

    assert.ok(issue);
    assert.equal(issue.severity, "critical");
    assert.deepEqual(
      issue.quantityImpacts.map((impact) => impact.quantityKey),
      [OPENING_QUANTITY_KEYS.header],
    );
  });

  it("skips header validation when structural member artifacts are not provided", () => {
    const batch = validateOpenings({
      payload: { openings: [buildCompleteOpening()] },
      parentObjectsById: buildParentMaps().parentObjectsById,
    });

    const headerResult = batch.validationResults.find(
      (entry) => entry.ruleId === OPENINGS_RULE_IDS.headerReferenceResolved,
    );

    assert.equal(headerResult?.outcome, "skipped");
  });

  it("produces deterministic IDs and output across identical reruns", () => {
    const batchInput = {
      payload: {
        openings: [buildCompleteOpening({ category: "unknown" })],
      },
      ...buildParentMaps(),
    };

    const first = validateOpenings(batchInput);
    const second = validateOpenings(batchInput);

    assert.deepEqual(first, second);
    const categoryIssue = first.validationIssues.find(
      (entry) => entry.ruleId === OPENINGS_RULE_IDS.categoryResolved,
    );

    assert.equal(
      categoryIssue?.id,
      "VI-opening-category-resolved-object-O-014",
    );
  });

  it("parses generated issues, results, and review items through core schemas", () => {
    const batch = validateOpenings({
      payload: {
        openings: [
          buildCompleteOpening({
            category: "unknown",
            parentObjectId: "WS-MISSING",
            headerMemberId: "SM-MISSING",
            dimensions: {
              nominalWidthFeet: null,
              nominalHeightFeet: null,
              roughWidthFeet: null,
              roughHeightFeet: null,
            },
            resolutionTraces: [],
          }),
        ],
      },
      ...buildParentMaps(),
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
