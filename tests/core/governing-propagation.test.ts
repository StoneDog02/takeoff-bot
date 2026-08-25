import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { GoverningDecisionAnswer } from "../../src/core/schemas/governing-propagation.schema.js";
import type {
  ObjectId,
  ReviewItemId,
  UserDecisionId,
} from "../../src/core/schemas/identity.schema.js";
import type { ReviewItem } from "../../src/core/schemas/review-item.schema.js";
import type { ReviewRootCause } from "../../src/core/schemas/review-root-cause.schema.js";
import type { UserDecision } from "../../src/core/schemas/user-decision.schema.js";
import {
  applyGoverningDecision,
  buildCombinedOverrideIndex,
  filterOutGoverningUserDecisions,
  mergeGoverningApplicationsIntoIndex,
} from "../../src/scopes/framing/resolvers/applyGoverningDecision.js";
import {
  buildUserDecisionIndex,
  createUserOverrideTrace,
  findAppliedUserDecision,
  type SubjectBinding,
} from "../../src/scopes/framing/resolvers/applyUserDecisions.js";
import { buildFailedBatch } from "../../src/scopes/framing/validators/buildValidationBatch.js";
import { createObjectTarget } from "../../src/scopes/framing/validators/ids.js";
import { mergeValidationBatches } from "../../src/scopes/framing/validators/mergeValidationBatch.js";

function kingStudReview(openingId: string): ReviewItem {
  const batch = buildFailedBatch(
    {
      ruleId: "opening.kingStudCount.default",
      level: "object",
      severity: "warning",
      ruleViolated: "King stud count unresolved.",
      explanation: `Opening ${openingId} needs king stud count.`,
      target: createObjectTarget(openingId as ObjectId, "opening"),
      quantityImpacts: [
        {
          quantityKey: "opening.framing",
          description: "King studs affect framing count.",
          canCalculate: false,
        },
      ],
    },
    {
      ruleId: "opening.kingStudCount.default",
      target: createObjectTarget(openingId as ObjectId, "opening"),
      title: `Provide king stud count for ${openingId}`,
      description: `Opening ${openingId} needs king stud count.`,
      action: {
        type: "provide-value",
        instruction: "Provide king stud count.",
        targetProperty: "kingStudCount",
      },
      reviewStatus: "review-required",
      blockingStatus: "partially-blocked",
      affectedObjects: [{ objectId: openingId as ObjectId, objectType: "opening" }],
    },
  );
  return batch.reviewItems[0]!;
}

function makeRootCause(input: {
  id: string;
  readiness: ReviewRootCause["decisionReadiness"];
  objectIds: string[];
  reviewItemIds: string[];
  propertyPaths?: string[];
}): ReviewRootCause {
  return {
    id: input.id,
    code: input.id,
    ruleIds: ["opening.kingStudCount.default"],
    propertyPaths: input.propertyPaths ?? ["kingStudCount"],
    domain: "openings",
    scope: "population",
    decisionReadiness: input.readiness,
    groupingConfidence: "high",
    contractorSummary: `Governing ${input.id}`,
    blockingStatus: "partially-blocked",
    materialRelevant: true,
    affectedReviewItemIds: input.reviewItemIds as ReviewItemId[],
    affectedObjectIds: input.objectIds as ObjectId[],
    affectedObjectCount: input.objectIds.length,
    validationIssueIds: [],
    groupingAuthority: {
      strength: "strong",
      kind: "fixture-king-stud",
      key: "shared",
      explanation: "Fixture shared king stud authority.",
    },
    governingGroups:
      input.readiness === "INFORMATIONAL"
        ? []
        : [
            {
              id: `${input.id}::gov-1`,
              decisionReadiness: input.readiness,
              contractorSummary: `Governing ${input.id}`,
              affectedReviewItemIds: input.reviewItemIds as ReviewItemId[],
              affectedObjectIds: input.objectIds as ObjectId[],
              affectedObjectCount: input.objectIds.length,
            },
          ],
    resolutionState: "unresolved",
  };
}

function makeDecision(
  id: string,
  reviewItemId: string,
  value: number,
): UserDecision {
  return {
    id: id as UserDecisionId,
    reviewItemId: reviewItemId as ReviewItemId,
    result: {
      type: "value-provided",
      value,
      rationale: "Contractor governing answer for fixture population.",
    },
    supersedesUserDecisionId: null,
  };
}

function makeAnswer(input: {
  id: string;
  userDecisionId: string;
  rootCauseId: string;
  readiness?: ReviewRootCause["decisionReadiness"];
  objectIds: string[];
  reviewItemIds: string[];
  value?: number;
  targetProperty?: string;
}): GoverningDecisionAnswer {
  return {
    id: input.id,
    userDecisionId: input.userDecisionId as UserDecisionId,
    rootCauseId: input.rootCauseId,
    governingGroupId: `${input.rootCauseId}::gov-1`,
    decisionReadinessAtSubmit: input.readiness ?? "ACTIONABLE_SINGLE_DECISION",
    targetProperty: input.targetProperty ?? "kingStudCount",
    value: input.value ?? 2,
    affectedObjectIdsSnapshot: input.objectIds as ObjectId[],
    affectedReviewItemIdsSnapshot: input.reviewItemIds as ReviewItemId[],
    groupingAuthorityKind: "fixture-king-stud",
    groupingAuthorityKey: "shared",
  };
}

function bindingsFor(objectIds: string[]): Map<ObjectId, SubjectBinding> {
  return new Map(
    objectIds.map((objectId) => [
      objectId as ObjectId,
      { subjectKey: objectId, subjectKind: "opening" as const },
    ]),
  );
}

describe("M.10 governing decision propagation", () => {
  it("L1: one actionable governing decision applies to N eligible dependents with one provenance id", () => {
    const objectIds = ["O-A", "O-B", "O-C"];
    const reviews = objectIds.map(kingStudReview);
    const reviewItemsById = new Map(
      reviews.map((item) => [item.id, item] as const),
    );
    const reviewItemIds = reviews.map((item) => item.id);
    const rootCause = makeRootCause({
      id: "RC-fixture-king-stud-shared",
      readiness: "ACTIONABLE_SINGLE_DECISION",
      objectIds,
      reviewItemIds,
    });
    const decision = makeDecision("UD-gov-1", reviewItemIds[0]!, 3);
    const answer = makeAnswer({
      id: "GA-1",
      userDecisionId: "UD-gov-1",
      rootCauseId: rootCause.id,
      objectIds,
      reviewItemIds,
      value: 3,
    });

    const { propagationResult, applications } = applyGoverningDecision({
      answer,
      userDecision: decision,
      rootCause,
      reviewItemsById,
      subjectBindingByObjectId: bindingsFor(objectIds),
    });

    assert.equal(propagationResult.status, "APPLIED_FULL");
    assert.equal(propagationResult.appliedCount, 3);
    assert.equal(propagationResult.skippedCount, 0);
    assert.equal(applications.length, 3);
    assert.ok(applications.every((app) => app.decision.id === "UD-gov-1"));
    assert.ok(applications.every((app) => app.value === 3));

    const index = mergeGoverningApplicationsIntoIndex(new Map(), applications);
    for (const objectId of objectIds) {
      const applied = findAppliedUserDecision(
        index,
        objectId as ObjectId,
        "kingStudCount",
      );
      assert.ok(applied);
      const trace = createUserOverrideTrace(applied!);
      assert.deepEqual(trace.userDecisionIds, ["UD-gov-1"]);
    }

    // Idempotent: same inputs → same applied set
    const second = applyGoverningDecision({
      answer,
      userDecision: decision,
      rootCause,
      reviewItemsById,
      subjectBindingByObjectId: bindingsFor(objectIds),
    });
    assert.deepEqual(
      second.propagationResult.appliedObjectIds,
      propagationResult.appliedObjectIds,
    );
    assert.equal(second.propagationResult.appliedCount, 3);
  });

  it("L1: stronger authority is not overwritten; stale dependent skipped; invalid value rejected", () => {
    const objectIds = ["O-A", "O-B", "O-STALE"];
    const reviews = ["O-A", "O-B"].map(kingStudReview);
    const reviewItemsById = new Map(
      reviews.map((item) => [item.id, item] as const),
    );
    const reviewItemIds = reviews.map((item) => item.id);
    const liveRootCause = makeRootCause({
      id: "RC-fixture-king-stud-shared",
      readiness: "ACTIONABLE_SINGLE_DECISION",
      objectIds: ["O-A", "O-B"],
      reviewItemIds,
    });
    const decision = makeDecision("UD-gov-2", reviewItemIds[0]!, 2);
    const answer = makeAnswer({
      id: "GA-2",
      userDecisionId: "UD-gov-2",
      rootCauseId: liveRootCause.id,
      objectIds,
      reviewItemIds: [...reviewItemIds, "RI-missing-stale" as ReviewItemId],
    });

    const { propagationResult } = applyGoverningDecision({
      answer,
      userDecision: decision,
      rootCause: liveRootCause,
      reviewItemsById,
      subjectBindingByObjectId: bindingsFor(["O-A", "O-B", "O-STALE"]),
      eligibility: {
        strongerAuthorityObjectIds: new Set(["O-B" as ObjectId]),
      },
    });

    assert.equal(propagationResult.status, "APPLIED_PARTIAL");
    assert.equal(propagationResult.appliedCount, 1);
    assert.equal(propagationResult.appliedObjectIds[0], "O-A");
    const byObject = new Map(
      propagationResult.dependents.map((d) => [d.objectId, d.result]),
    );
    assert.equal(byObject.get("O-A" as ObjectId), "APPLIED");
    assert.equal(
      byObject.get("O-B" as ObjectId),
      "ALREADY_RESOLVED_STRONGER_AUTHORITY",
    );
    assert.equal(byObject.get("O-STALE" as ObjectId), "NO_LONGER_APPLICABLE");

    const badDecision = makeDecision("UD-gov-bad", reviewItemIds[0]!, -1);
    const badAnswer = makeAnswer({
      id: "GA-bad",
      userDecisionId: "UD-gov-bad",
      rootCauseId: liveRootCause.id,
      objectIds: ["O-A"],
      reviewItemIds: [reviewItemIds[0]!],
      value: -1,
    });
    // Force invalid by using a non-normalizable path value via wrong property
    const invalidPropAnswer = {
      ...badAnswer,
      targetProperty: "kingStudCount",
      value: -1,
    };
    const rejected = applyGoverningDecision({
      answer: invalidPropAnswer,
      userDecision: {
        ...badDecision,
        result: {
          type: "value-provided",
          value: -1,
          rationale: "Invalid king stud count.",
        },
      },
      rootCause: liveRootCause,
      reviewItemsById,
      subjectBindingByObjectId: bindingsFor(["O-A"]),
    });
    assert.equal(rejected.propagationResult.status, "REJECTED");
    assert.match(
      rejected.propagationResult.rejectionReason ?? "",
      /not valid/i,
    );
  });

  it("L1: NEEDS_PARTITIONING and INFORMATIONAL reject fan-out", () => {
    const reviews = [kingStudReview("O-A"), kingStudReview("O-B")];
    const reviewItemsById = new Map(
      reviews.map((item) => [item.id, item] as const),
    );
    const reviewItemIds = reviews.map((item) => item.id);
    const decision = makeDecision("UD-gov-3", reviewItemIds[0]!, 2);

    for (const readiness of [
      "NEEDS_PARTITIONING",
      "INFORMATIONAL",
    ] as const) {
      const rootCause = makeRootCause({
        id: `RC-fixture-${readiness}`,
        readiness,
        objectIds: ["O-A", "O-B"],
        reviewItemIds,
      });
      const answer = makeAnswer({
        id: `GA-${readiness}`,
        userDecisionId: "UD-gov-3",
        rootCauseId: rootCause.id,
        readiness,
        objectIds: ["O-A", "O-B"],
        reviewItemIds,
      });
      const { propagationResult, applications } = applyGoverningDecision({
        answer,
        userDecision: decision,
        rootCause,
        reviewItemsById,
        subjectBindingByObjectId: bindingsFor(["O-A", "O-B"]),
      });
      assert.equal(propagationResult.status, "REJECTED");
      assert.equal(applications.length, 0);
      assert.match(
        propagationResult.rejectionReason ?? "",
        /ACTIONABLE_SINGLE_DECISION/,
      );
    }
  });

  it("L2 mixed: actionable fan-out with stronger/stale skips; partitioning rejected; object-specific remains 1:1", () => {
    const actionableObjects = ["O-1", "O-2", "O-3", "O-STALE"];
    const actionableReviews = ["O-1", "O-2", "O-3"].map(kingStudReview);
    const objectSpecificReview = kingStudReview("O-SOLO");
    const allReviews = [...actionableReviews, objectSpecificReview];
    const reviewItemsById = new Map(
      allReviews.map((item) => [item.id, item] as const),
    );
    const actionableReviewIds = actionableReviews.map((r) => r.id);

    const actionableRoot = makeRootCause({
      id: "RC-fixture-actionable",
      readiness: "ACTIONABLE_SINGLE_DECISION",
      objectIds: ["O-1", "O-2", "O-3"],
      reviewItemIds: actionableReviewIds,
    });
    const partitioningRoot = makeRootCause({
      id: "RC-fixture-partition",
      readiness: "NEEDS_PARTITIONING",
      objectIds: ["W-1", "W-2"],
      reviewItemIds: actionableReviewIds,
      propertyPaths: ["assembly.heightFeet"],
    });
    const informationalRoot = makeRootCause({
      id: "RC-fixture-info",
      readiness: "INFORMATIONAL",
      objectIds: ["W-1"],
      reviewItemIds: actionableReviewIds,
      propertyPaths: ["location"],
    });

    const governingDecision = makeDecision(
      "UD-gov-mixed",
      actionableReviewIds[0]!,
      4,
    );
    const governingAnswer = makeAnswer({
      id: "GA-mixed",
      userDecisionId: "UD-gov-mixed",
      rootCauseId: actionableRoot.id,
      objectIds: actionableObjects,
      reviewItemIds: actionableReviewIds,
      value: 4,
    });

    const objectSpecificDecision = makeDecision(
      "UD-solo",
      objectSpecificReview.id,
      5,
    );

    const { propagationResult, applications } = applyGoverningDecision({
      answer: governingAnswer,
      userDecision: governingDecision,
      rootCause: actionableRoot,
      reviewItemsById,
      subjectBindingByObjectId: bindingsFor(actionableObjects),
      eligibility: {
        strongerAuthorityObjectIds: new Set(["O-2" as ObjectId]),
      },
    });

    assert.equal(propagationResult.appliedCount, 2);
    assert.deepEqual(propagationResult.appliedObjectIds, ["O-1", "O-3"]);
    const results = Object.fromEntries(
      propagationResult.dependents.map((d) => [d.objectId, d.result]),
    );
    assert.equal(results["O-1"], "APPLIED");
    assert.equal(results["O-2"], "ALREADY_RESOLVED_STRONGER_AUTHORITY");
    assert.equal(results["O-3"], "APPLIED");
    assert.equal(results["O-STALE"], "NO_LONGER_APPLICABLE");

    const partitionReject = applyGoverningDecision({
      answer: {
        ...governingAnswer,
        id: "GA-partition-attempt",
        rootCauseId: partitioningRoot.id,
        decisionReadinessAtSubmit: "NEEDS_PARTITIONING",
        targetProperty: "assembly.heightFeet",
        affectedObjectIdsSnapshot: ["W-1", "W-2"] as ObjectId[],
      },
      userDecision: {
        ...governingDecision,
        id: "UD-gov-mixed" as UserDecisionId,
        result: {
          type: "value-provided",
          value: 9,
          rationale: "Illegal height fan-out.",
        },
      },
      rootCause: partitioningRoot,
      reviewItemsById,
      subjectBindingByObjectId: new Map([
        [
          "W-1" as ObjectId,
          { subjectKey: "W-1", subjectKind: "building-wall" as const },
        ],
        [
          "W-2" as ObjectId,
          { subjectKey: "W-2", subjectKind: "building-wall" as const },
        ],
      ]),
    });
    assert.equal(partitionReject.propagationResult.status, "REJECTED");

    const infoReject = applyGoverningDecision({
      answer: {
        ...governingAnswer,
        id: "GA-info-attempt",
        rootCauseId: informationalRoot.id,
        decisionReadinessAtSubmit: "INFORMATIONAL",
        targetProperty: "location",
        value: "exterior",
        affectedObjectIdsSnapshot: ["W-1"] as ObjectId[],
      },
      userDecision: {
        ...governingDecision,
        result: {
          type: "value-provided",
          value: "exterior",
          rationale: "Illegal informational fan-out.",
        },
      },
      rootCause: informationalRoot,
      reviewItemsById,
      subjectBindingByObjectId: new Map([
        [
          "W-1" as ObjectId,
          { subjectKey: "W-1", subjectKind: "building-wall" as const },
        ],
      ]),
    });
    assert.equal(infoReject.propagationResult.status, "REJECTED");

    const ordinary = filterOutGoverningUserDecisions(
      [governingDecision, objectSpecificDecision],
      [governingAnswer],
    );
    assert.equal(ordinary.length, 1);
    assert.equal(ordinary[0]!.id, "UD-solo");

    const ordinaryIndex = buildUserDecisionIndex(
      {
        userDecisions: ordinary,
        reviewItemsById,
        evidenceById: new Map(),
      },
      new Map([
        [
          "O-SOLO" as ObjectId,
          { subjectKey: "O-SOLO", subjectKind: "opening" as const },
        ],
      ]),
    );

    const { index, propagationResults } = buildCombinedOverrideIndex({
      ordinaryIndex,
      governingAnswers: [governingAnswer],
      userDecisions: [governingDecision, objectSpecificDecision],
      rootCausesById: new Map([[actionableRoot.id, actionableRoot]]),
      reviewItemsById,
      subjectBindingByObjectId: bindingsFor(["O-1", "O-2", "O-3", "O-SOLO"]),
      eligibilityByAnswerId: new Map([
        [
          governingAnswer.id,
          { strongerAuthorityObjectIds: new Set(["O-2" as ObjectId]) },
        ],
      ]),
    });

    assert.equal(propagationResults[0]!.appliedCount, 2);
    assert.ok(findAppliedUserDecision(index, "O-1" as ObjectId, "kingStudCount"));
    assert.equal(
      findAppliedUserDecision(index, "O-2" as ObjectId, "kingStudCount"),
      undefined,
    );
    assert.ok(findAppliedUserDecision(index, "O-SOLO" as ObjectId, "kingStudCount"));
    assert.equal(
      findAppliedUserDecision(index, "O-SOLO" as ObjectId, "kingStudCount")
        ?.decision.id,
      "UD-solo",
    );
    assert.equal(applications.every((a) => a.decision.id === "UD-gov-mixed"), true);

    // Raw review inventory remains auditable (not deleted by propagation)
    const validation = mergeValidationBatches(
      ...allReviews.map((review) => ({
        validationIssues: [],
        validationResults: [],
        reviewItems: [review],
      })),
    );
    assert.equal(validation.reviewItems.length, allReviews.length);
  });

  it("L3 Beckstead IDs: production negative-control root causes reject fan-out", () => {
    const reviews = [kingStudReview("O-A")];
    const reviewItemsById = new Map(
      reviews.map((item) => [item.id, item] as const),
    );
    const reviewItemIds = reviews.map((item) => item.id);
    const decision = makeDecision("UD-beckstead-neg", reviewItemIds[0]!, 2);

    const cases: Array<{
      id: string;
      readiness: ReviewRootCause["decisionReadiness"];
      property: string;
      value: string | number;
    }> = [
      {
        id: "RC-wall-height-unpartitioned-all",
        readiness: "NEEDS_PARTITIONING",
        property: "assembly.heightFeet",
        value: 9,
      },
      {
        id: "RC-floor-parent-system-sentinel-FFS-UNRESOLVED",
        readiness: "NEEDS_PARTITIONING",
        property: "parentSystemId",
        value: "FFS-1",
      },
      {
        id: "RC-informational-rule-wall.location.resolved",
        readiness: "INFORMATIONAL",
        property: "location",
        value: "exterior",
      },
      {
        id: "RC-informational-rule-wall.bearing.resolved",
        readiness: "INFORMATIONAL",
        property: "bearingStatus",
        value: "bearing",
      },
    ];

    for (const testCase of cases) {
      const rootCause = makeRootCause({
        id: testCase.id,
        readiness: testCase.readiness,
        objectIds: ["O-A"],
        reviewItemIds,
        propertyPaths: [testCase.property],
      });
      const { propagationResult, applications } = applyGoverningDecision({
        answer: makeAnswer({
          id: `GA-${testCase.id}`,
          userDecisionId: "UD-beckstead-neg",
          rootCauseId: testCase.id,
          readiness: testCase.readiness,
          objectIds: ["O-A"],
          reviewItemIds,
          targetProperty: testCase.property,
          value: testCase.value as number,
        }),
        userDecision: {
          ...decision,
          result: {
            type: "value-provided",
            value: testCase.value,
            rationale: "Negative-control reject proof.",
          },
        },
        rootCause,
        reviewItemsById,
        subjectBindingByObjectId: bindingsFor(["O-A"]),
      });
      assert.equal(propagationResult.status, "REJECTED", testCase.id);
      assert.equal(applications.length, 0, testCase.id);
    }
  });
});
