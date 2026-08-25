import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ObjectId } from "../../src/core/schemas/identity.schema.js";
import type { ValidationPayload } from "../../src/scopes/framing/schemas/framing-artifacts.schema.js";
import { projectReviewRootCauses } from "../../src/scopes/framing/review-workspace/projectReviewRootCauses.js";
import { buildFailedBatch } from "../../src/scopes/framing/validators/buildValidationBatch.js";
import { createObjectTarget } from "../../src/scopes/framing/validators/ids.js";
import { mergeValidationBatches } from "../../src/scopes/framing/validators/mergeValidationBatch.js";
import type { ValidationBatch } from "../../src/scopes/framing/validators/types.js";

function mergeBatches(...batches: ValidationBatch[]): ValidationPayload {
  return mergeValidationBatches(...batches);
}

function openingParentBatch(
  openingId: string,
  missingParentObjectId: string,
  rule: "opening.parent.resolved" | "opening.parentWall.resolved",
) {
  const target = createObjectTarget(openingId as ObjectId, "opening");
  const isParent = rule === "opening.parent.resolved";
  const referent = isParent ? missingParentObjectId : missingParentObjectId.replace(/^WS-/, "");
  const property = isParent ? "parentObjectId" : "parentWallId";
  const noun = isParent ? "parent object" : "parent wall";
  return buildFailedBatch(
    {
      ruleId: rule,
      level: "relationship",
      severity: "critical",
      ruleViolated: `Opening ${noun} must reference an existing object.`,
      explanation: `Opening ${openingId} references missing ${noun} ${referent}.`,
      target,
      quantityImpacts: [
        {
          quantityKey: "opening.framing",
          description: "Opening framing requires a valid parent.",
          canCalculate: false,
        },
      ],
    },
    {
      ruleId: rule,
      target,
      title: `Resolve ${noun} for opening ${openingId}`,
      description: `Opening ${openingId} references missing ${noun} ${referent}.`,
      action: {
        type: "provide-value",
        instruction: `Confirm the ${noun}.`,
        targetProperty: property,
      },
      reviewStatus: "review-required",
      blockingStatus: "blocked",
      affectedObjects: [{ objectId: openingId as ObjectId, objectType: "opening" }],
    },
  );
}

function wallHeightBatch(wallId: string) {
  const target = createObjectTarget(wallId as ObjectId, "building-wall");
  return buildFailedBatch(
    {
      ruleId: "wall.height.resolved",
      level: "object",
      severity: "critical",
      ruleViolated: "Wall height must be resolved.",
      explanation: `Wall ${wallId} has no resolved wall height.`,
      target,
      quantityImpacts: [
        {
          quantityKey: "wall.sheathing",
          description: "Wall sheathing area requires resolved wall height.",
          canCalculate: false,
        },
      ],
    },
    {
      ruleId: "wall.height.resolved",
      target,
      title: `Resolve wall height for ${wallId}`,
      description: `Wall ${wallId} (${wallId}) has no resolved wall height.`,
      action: {
        type: "provide-value",
        instruction: "Provide the resolved wall height.",
        targetProperty: "assembly.heightFeet",
      },
      reviewStatus: "review-required",
      blockingStatus: "partially-blocked",
      affectedObjects: [
        { objectId: wallId as ObjectId, objectType: "building-wall" },
      ],
    },
  );
}

function wallLocationBatch(wallId: string) {
  const target = createObjectTarget(wallId as ObjectId, "building-wall");
  return buildFailedBatch(
    {
      ruleId: "wall.location.resolved",
      level: "object",
      severity: "warning",
      ruleViolated: "Wall location must be supported.",
      explanation: `Wall ${wallId} has unresolved location classification.`,
      target,
    },
    {
      ruleId: "wall.location.resolved",
      target,
      title: `Resolve location for ${wallId}`,
      description: `Wall ${wallId} (${wallId}) has unresolved location classification.`,
      action: {
        type: "confirm",
        instruction: "Confirm interior or exterior.",
        targetProperty: "location",
      },
      reviewStatus: "review-recommended",
      blockingStatus: "not-blocked",
      affectedObjects: [
        { objectId: wallId as ObjectId, objectType: "building-wall" },
      ],
    },
  );
}

function openingDimensionBatch(openingId: string, rule: string) {
  const target = createObjectTarget(openingId as ObjectId, "opening");
  return buildFailedBatch(
    {
      ruleId: rule,
      level: "object",
      severity: "critical",
      ruleViolated: "Opening dimensions must be resolved.",
      explanation: `Opening ${openingId} has unresolved dimensions.`,
      target,
      quantityImpacts: [
        {
          quantityKey: "opening.framing",
          description: "Opening framing requires dimensions.",
          canCalculate: false,
        },
      ],
    },
    {
      ruleId: rule,
      target,
      title: `Resolve dimensions for ${openingId}`,
      description: `Opening ${openingId} has unresolved dimensions.`,
      action: {
        type: "provide-value",
        instruction: "Provide opening dimensions.",
        targetProperty: "dimensions",
      },
      reviewStatus: "review-required",
      blockingStatus: "blocked",
      affectedObjects: [{ objectId: openingId as ObjectId, objectType: "opening" }],
    },
  );
}

describe("projectReviewRootCauses L1 grouping unit proof", () => {
  it("groups same root + same governing scope (opening missing parent wall)", () => {
    const validation = mergeBatches(
      openingParentBatch("O-1", "WS-physical-run:p4:abc", "opening.parent.resolved"),
      openingParentBatch("O-1", "physical-run:p4:abc", "opening.parentWall.resolved"),
      openingParentBatch("O-2", "WS-physical-run:p4:abc", "opening.parent.resolved"),
      openingParentBatch("O-2", "physical-run:p4:abc", "opening.parentWall.resolved"),
    );

    const projection = projectReviewRootCauses({ validation });
    const parentCause = projection.rootCauses.find(
      (cause) => cause.groupingAuthority.kind === "missing-parent-wall",
    );

    assert.ok(parentCause);
    assert.equal(parentCause.decisionReadiness, "ACTIONABLE_SINGLE_DECISION");
    assert.equal(parentCause.affectedReviewItemIds.length, 4);
    assert.equal(parentCause.affectedObjectCount, 2);
    assert.equal(parentCause.groupingAuthority.key, "physical-run:p4:abc");
    assert.equal(parentCause.governingGroups.length, 1);

    const governing = projection.primaryQueue.find(
      (entry) => entry.kind === "governing-issue",
    );
    assert.ok(governing);
    assert.equal(governing.dependentReviewItemCount, 4);
  });

  it("does not merge same property path with different roots into one actionable decision", () => {
    const validation = mergeBatches(
      openingDimensionBatch("O-A", "opening.dimensions.rough.resolved"),
      openingDimensionBatch("O-B", "opening.dimensions.nominal.resolved"),
    );

    const projection = projectReviewRootCauses({ validation });
    assert.equal(
      projection.rootCauses.filter(
        (cause) => cause.decisionReadiness === "ACTIONABLE_SINGLE_DECISION",
      ).length,
      0,
    );
    assert.equal(projection.summary.objectSpecificDecisions, 2);
    assert.equal(projection.summary.contractorPrimaryQueueCount, 2);
  });

  it("represents wall height as NEEDS_PARTITIONING, not one answerable value", () => {
    const validation = mergeBatches(
      wallHeightBatch("W-1"),
      wallHeightBatch("W-2"),
      wallHeightBatch("W-3"),
    );

    const projection = projectReviewRootCauses({ validation });
    const height = projection.rootCauses.find(
      (cause) => cause.code === "wall.height.authority_unresolved",
    );
    assert.ok(height);
    assert.equal(height.decisionReadiness, "NEEDS_PARTITIONING");
    assert.equal(height.affectedObjectCount, 3);
    assert.match(height.contractorSummary, /Additional grouping is required/i);
    assert.equal(
      projection.primaryQueue.filter(
        (entry) =>
          entry.kind === "governing-issue" &&
          entry.decisionReadiness === "NEEDS_PARTITIONING",
      ).length,
      1,
    );
  });

  it("keeps object-specific issues object-specific", () => {
    const validation = mergeBatches(
      openingDimensionBatch("O-ONLY", "opening.dimensions.rough.resolved"),
    );
    const projection = projectReviewRootCauses({ validation });
    assert.equal(projection.summary.objectSpecificDecisions, 1);
    assert.equal(projection.primaryQueue[0]?.kind, "object-specific-review");
  });

  it("excludes informational reviews from the primary contractor queue", () => {
    const validation = mergeBatches(
      wallLocationBatch("W-LOC-1"),
      wallLocationBatch("W-LOC-2"),
      openingDimensionBatch("O-BLOCK", "opening.dimensions.rough.resolved"),
    );
    const projection = projectReviewRootCauses({ validation });
    const informational = projection.rootCauses.find(
      (cause) => cause.decisionReadiness === "INFORMATIONAL",
    );
    assert.ok(informational);
    assert.equal(informational.affectedReviewItemIds.length, 2);
    assert.ok(
      projection.secondaryInformationalRootCauseIds.includes(informational.id),
    );
    assert.equal(
      projection.primaryQueue.some(
        (entry) =>
          entry.kind === "object-specific-review" &&
          entry.reviewItemId.includes("location"),
      ),
      false,
    );
    assert.equal(projection.summary.objectSpecificDecisions, 1);
  });

  it("is deterministic and preserves all raw review IDs as dependents or object-specific", () => {
    const validation = mergeBatches(
      openingParentBatch("O-1", "WS-physical-run:x", "opening.parent.resolved"),
      openingParentBatch("O-2", "WS-physical-run:x", "opening.parent.resolved"),
      wallHeightBatch("W-1"),
      wallHeightBatch("W-2"),
      wallLocationBatch("W-1"),
      openingDimensionBatch("O-Z", "opening.dimensions.rough.resolved"),
    );

    const first = projectReviewRootCauses({ validation });
    const second = projectReviewRootCauses({ validation });
    assert.deepEqual(first, second);

    const rawIds = new Set(validation.reviewItems.map((item) => item.id));
    const covered = new Set([
      ...first.dependentReviewItemIds,
      ...first.primaryQueue
        .filter((entry) => entry.kind === "object-specific-review")
        .map((entry) => entry.reviewItemId),
    ]);
    for (const id of rawIds) {
      assert.ok(covered.has(id), `expected review ${id} to remain covered`);
    }
    assert.equal(first.summary.rawReviewItems, validation.reviewItems.length);
  });
});

describe("projectReviewRootCauses L2 mixed dependency proof", () => {
  it("projects mixed actionable / needs-partitioning / object-specific / informational correctly", () => {
    const validation = mergeBatches(
      // actionable shared root (4 RIs → 1 governing)
      openingParentBatch("O-1", "WS-physical-run:shared", "opening.parent.resolved"),
      openingParentBatch("O-1", "physical-run:shared", "opening.parentWall.resolved"),
      openingParentBatch("O-2", "WS-physical-run:shared", "opening.parent.resolved"),
      openingParentBatch("O-2", "physical-run:shared", "opening.parentWall.resolved"),
      // needs partitioning
      wallHeightBatch("W-A"),
      wallHeightBatch("W-B"),
      // object-specific
      openingDimensionBatch("O-SPEC", "opening.dimensions.rough.resolved"),
      // informational
      wallLocationBatch("W-A"),
      wallLocationBatch("W-B"),
    );

    const projection = projectReviewRootCauses({ validation });

    assert.equal(projection.summary.rawReviewItems, 9);
    assert.equal(projection.summary.actionableGoverningDecisions, 1);
    assert.equal(projection.summary.needsPartitioningGroups, 1);
    assert.equal(projection.summary.informationalIssues, 1);
    assert.equal(projection.summary.objectSpecificDecisions, 1);
    // primary = 1 actionable + 1 needs-partitioning + 1 object-specific
    assert.equal(projection.summary.contractorPrimaryQueueCount, 3);
    assert.equal(projection.summary.largestGroupSize, 4);

    const parent = projection.rootCauses.find(
      (cause) => cause.decisionReadiness === "ACTIONABLE_SINGLE_DECISION",
    );
    assert.ok(parent);
    assert.equal(parent.affectedReviewItemIds.length, 4);

    const height = projection.rootCauses.find(
      (cause) => cause.decisionReadiness === "NEEDS_PARTITIONING",
    );
    assert.ok(height);
    assert.equal(height.affectedObjectCount, 2);
  });
});
