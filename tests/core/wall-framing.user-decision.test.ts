import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evidenceSchema } from "../../src/core/schemas/evidence.schema.js";
import type { ReviewItem } from "../../src/core/schemas/review-item.schema.js";
import type { UserDecision } from "../../src/core/schemas/user-decision.schema.js";
import { coordinateFramingCalculations } from "../../src/scopes/framing/calculators/calculation-coordinator.js";
import { createMaterialLineItemId } from "../../src/scopes/framing/calculators/ids.js";
import { resolveWallFraming } from "../../src/scopes/framing/resolvers/resolveWallFraming.js";
import {
  WALL_FRAMING_RULE_IDS,
  WALL_QUANTITY_KEYS,
} from "../../src/scopes/framing/validators/rule-ids.js";
import { validateWallFraming } from "../../src/scopes/framing/validators/wall-framing.validator.js";

const source = {
  page: {
    documentId: null,
    pageNumber: 1,
    sheetId: null,
    sheetTitle: null,
    pageLabel: null,
    revision: null,
  },
  region: null,
  elementLabel: "W-001",
  detailNumber: null,
  sectionNumber: null,
  scheduleName: null,
  noteReference: null,
};

function evidenceForSubject(
  subjectKey: string,
  overrides: Record<string, unknown>,
) {
  return evidenceSchema.parse({
    id: "E-PROP",
    type: "note",
    relationship: "supports",
    description: "Extracted candidate.",
    source: {
      ...source,
      elementLabel: subjectKey,
    },
    originalText: `${subjectKey} fixture line`,
    references: [],
    subjectKind: "wall" as const,
    subjectKey,
    propertyPath: "wallType",
    candidateValue: "wood stud wall",
    ...overrides,
  });
}

function completeWallEvidenceForSubject(subjectKey: string, prefix: string) {
  const isW002 = subjectKey === "W-002";
  return [
    evidenceForSubject(subjectKey, {
      id: `${prefix}-CLASS`,
      propertyPath: "wallType",
      candidateValue: "wood stud wall",
    }),
    evidenceForSubject(subjectKey, {
      id: `${prefix}-FRAMING`,
      propertyPath: "assembly.studSize",
      candidateValue: isW002 ? "2x6" : "2x4",
    }),
    evidenceForSubject(subjectKey, {
      id: `${prefix}-SPACING`,
      type: "dimension",
      propertyPath: "assembly.studSpacingInches",
      candidateValue: isW002 ? 24 : 16,
    }),
    evidenceForSubject(subjectKey, {
      id: `${prefix}-HEIGHT`,
      type: "dimension",
      propertyPath: "assembly.heightFeet",
      candidateValue: isW002 ? 9 : 8,
    }),
    evidenceForSubject(subjectKey, {
      id: `${prefix}-PLATES`,
      propertyPath: "assembly.plateCount",
      candidateValue: isW002 ? 2 : 3,
    }),
  ];
}

function twoWallConflictEvidence() {
  return [
    ...completeWallEvidenceForSubject("W-001", "E-W001"),
    evidenceForSubject("W-001", {
      id: "E-W001-GEOMETRY",
      type: "dimension",
      propertyPath: "lengthFeet",
      candidateValue: 20,
    }),
    ...completeWallEvidenceForSubject("W-002", "E-W002"),
    evidenceForSubject("W-002", {
      id: "E-W002-LENGTH-A",
      type: "dimension",
      propertyPath: "lengthFeet",
      candidateValue: 12,
    }),
    evidenceForSubject("W-002", {
      id: "E-W002-LENGTH-B",
      type: "dimension",
      propertyPath: "lengthFeet",
      candidateValue: 14,
    }),
  ];
}

function runOneConflictState() {
  const evidence = twoWallConflictEvidence();
  const wallFraming = resolveWallFraming(evidence);
  const validation = validateWallFraming(wallFraming);
  return { evidence, wallFraming, validation };
}

function ws002LengthReviewItem(validation: ReturnType<typeof validateWallFraming>): ReviewItem {
  const reviewItem = validation.reviewItems.find(
    (item) =>
      item.affectedObjects.length === 1 &&
      item.affectedObjects[0]?.objectId === "WS-002" &&
      item.action.targetProperty === "lengthFeet",
  );
  if (!reviewItem) {
    throw new Error("Expected WS-002 length Review Item.");
  }
  return reviewItem;
}

function conflictResolvedDecision(
  reviewItem: ReviewItem,
  overrides: Partial<UserDecision> = {},
): UserDecision {
  return {
    id: "UD-WS002-LENGTH-001",
    reviewItemId: reviewItem.id,
    result: {
      type: "conflict-resolved",
      value: 14,
      acceptedEvidenceIds: ["E-W002-LENGTH-B"],
      rejectedEvidenceIds: ["E-W002-LENGTH-A"],
      rationale: "Reviewer selected 14 ft from conflicting candidates.",
    },
    supersedesUserDecisionId: null,
    ...overrides,
  };
}

describe("wall framing user decision resolution", () => {
  it("keeps Run-1 conflict behavior without User Decisions", () => {
    const { wallFraming, validation } = runOneConflictState();
    const segment001 = wallFraming.segments.find((segment) => segment.id === "WS-001");
    const segment002 = wallFraming.segments.find((segment) => segment.id === "WS-002");

    assert.equal(segment001?.lengthFeet, 20);
    assert.equal(segment002?.lengthFeet, null);

    assert.equal(
      validation.validationResults.find(
        (entry) =>
          entry.ruleId === WALL_FRAMING_RULE_IDS.geometryLengthResolved &&
          entry.target.kind === "object" &&
          entry.target.objectId === "WS-002",
      )?.outcome,
      "failed",
    );

    const materials = coordinateFramingCalculations({
      wallFraming,
      validation,
    }).materials;
    assert.equal(materials.length, 2);
    assert.equal(
      materials.find(
        (item) =>
          item.id === createMaterialLineItemId(WALL_QUANTITY_KEYS.studs, "WS-001"),
      )?.quantity,
      16,
    );
    assert.equal(
      materials.find(
        (item) =>
          item.id === createMaterialLineItemId(WALL_QUANTITY_KEYS.plates, "WS-001"),
      )?.quantity,
      60,
    );
  });

  it("applies conflict-resolved User Decision to WS-002.lengthFeet = 14", () => {
    const runOne = runOneConflictState();
    const reviewItem = ws002LengthReviewItem(runOne.validation);
    const reviewItemSnapshot = structuredClone(reviewItem);
    const evidenceSnapshot = structuredClone(runOne.evidence);
    const decision = conflictResolvedDecision(reviewItem);

    const wallFraming = resolveWallFraming(runOne.evidence, {
      userDecisions: [decision],
      reviewItemsById: new Map([[reviewItem.id, reviewItem]]),
    });
    const validation = validateWallFraming(wallFraming);
    const materials = coordinateFramingCalculations({
      wallFraming,
      validation,
    }).materials;

    const segment001 = wallFraming.segments.find((segment) => segment.id === "WS-001");
    const segment002 = wallFraming.segments.find((segment) => segment.id === "WS-002");
    assert.equal(segment001?.lengthFeet, 20);
    assert.equal(segment002?.lengthFeet, 14);

    const trace002 = segment002?.resolutionTraces.find(
      (entry) => entry.propertyPath === "lengthFeet",
    );
    assert.equal(trace002?.method, "user-override");
    assert.deepEqual(trace002?.userDecisionIds, ["UD-WS002-LENGTH-001"]);
    assert.deepEqual(trace002?.reviewItemIds, [reviewItem.id]);
    assert.deepEqual(trace002?.evidenceIds, ["E-W002-LENGTH-A", "E-W002-LENGTH-B"]);

    assert.equal(
      validation.validationResults.find(
        (entry) =>
          entry.ruleId === WALL_FRAMING_RULE_IDS.geometryLengthResolved &&
          entry.target.kind === "object" &&
          entry.target.objectId === "WS-002",
      )?.outcome,
      "passed",
    );

    assert.equal(materials.length, 4);
    assert.equal(
      materials.find(
        (item) =>
          item.id === createMaterialLineItemId(WALL_QUANTITY_KEYS.studs, "WS-002"),
      )?.quantity,
      8,
    );
    assert.equal(
      materials.find(
        (item) =>
          item.id === createMaterialLineItemId(WALL_QUANTITY_KEYS.plates, "WS-002"),
      )?.quantity,
      28,
    );

    assert.deepEqual(runOne.evidence, evidenceSnapshot);
    assert.deepEqual(reviewItem, reviewItemSnapshot);
  });

  it("leaves resolveWallFraming(evidence) deep-equivalent aside from empty userDecisionIds on traces", () => {
    const evidence = twoWallConflictEvidence();
    const withoutOptions = resolveWallFraming(evidence);
    const withEmptyOptions = resolveWallFraming(evidence, {
      userDecisions: [],
      reviewItemsById: new Map(),
    });

    assert.deepEqual(withoutOptions, withEmptyOptions);
    assert.equal(
      withoutOptions.segments
        .flatMap((segment) => segment.resolutionTraces)
        .every((trace) => trace.userDecisionIds.length === 0),
      true,
    );
  });

  it("returns deterministic output ordering regardless of decision input order", () => {
    const runOne = runOneConflictState();
    const reviewItem = ws002LengthReviewItem(runOne.validation);
    const decision = conflictResolvedDecision(reviewItem);
    const options = {
      userDecisions: [decision],
      reviewItemsById: new Map([[reviewItem.id, reviewItem]]),
    };

    assert.deepEqual(
      resolveWallFraming(runOne.evidence, options),
      resolveWallFraming([...runOne.evidence].reverse(), options),
    );
  });

  it("does not apply a User Decision to W-001", () => {
    const runOne = runOneConflictState();
    const reviewItem = ws002LengthReviewItem(runOne.validation);
    const wallFraming = resolveWallFraming(runOne.evidence, {
      userDecisions: [conflictResolvedDecision(reviewItem)],
      reviewItemsById: new Map([[reviewItem.id, reviewItem]]),
    });

    const segment001 = wallFraming.segments.find((segment) => segment.id === "WS-001");
    const trace001 = segment001?.resolutionTraces.find(
      (entry) => entry.propertyPath === "lengthFeet",
    );
    assert.equal(segment001?.lengthFeet, 20);
    assert.equal(trace001?.method, "explicit-project-value");
    assert.deepEqual(trace001?.userDecisionIds, []);
  });

  it("uses supersession to ignore an older active decision", () => {
    const runOne = runOneConflictState();
    const reviewItem = ws002LengthReviewItem(runOne.validation);
    const superseded = conflictResolvedDecision(reviewItem, { id: "UD-OLD" });
    const replacement = conflictResolvedDecision(reviewItem, {
      id: "UD-NEW",
      supersedesUserDecisionId: "UD-OLD",
    });

    const wallFraming = resolveWallFraming(runOne.evidence, {
      userDecisions: [superseded, replacement],
      reviewItemsById: new Map([[reviewItem.id, reviewItem]]),
    });
    const trace002 = wallFraming.segments
      .find((segment) => segment.id === "WS-002")
      ?.resolutionTraces.find((entry) => entry.propertyPath === "lengthFeet");

    assert.equal(wallFraming.segments.find((segment) => segment.id === "WS-002")?.lengthFeet, 14);
    assert.deepEqual(trace002?.userDecisionIds, ["UD-NEW"]);
  });

  it("rejects multiple active decisions for the same target", () => {
    const runOne = runOneConflictState();
    const reviewItem = ws002LengthReviewItem(runOne.validation);
    const first = conflictResolvedDecision(reviewItem, { id: "UD-001" });
    const second = conflictResolvedDecision(reviewItem, { id: "UD-002" });

    assert.throws(
      () =>
        resolveWallFraming(runOne.evidence, {
          userDecisions: [first, second],
          reviewItemsById: new Map([[reviewItem.id, reviewItem]]),
        }),
      /Multiple active User Decisions target WS-002\.lengthFeet/,
    );
  });

  it("rejects missing accepted Evidence", () => {
    const runOne = runOneConflictState();
    const reviewItem = ws002LengthReviewItem(runOne.validation);
    const decision = conflictResolvedDecision(reviewItem, {
      result: {
        type: "conflict-resolved",
        value: 14,
        acceptedEvidenceIds: ["E-MISSING"],
        rejectedEvidenceIds: ["E-W002-LENGTH-A"],
        rationale: "Reviewer selected 14 ft from conflicting candidates.",
      },
    });

    assert.throws(
      () =>
        resolveWallFraming(runOne.evidence, {
          userDecisions: [decision],
          reviewItemsById: new Map([[reviewItem.id, reviewItem]]),
        }),
      /missing accepted Evidence E-MISSING/,
    );
  });

  it("rejects accepted Evidence from the wrong subject", () => {
    const runOne = runOneConflictState();
    const reviewItem = ws002LengthReviewItem(runOne.validation);
    const decision = conflictResolvedDecision(reviewItem, {
      result: {
        type: "conflict-resolved",
        value: 20,
        acceptedEvidenceIds: ["E-W001-GEOMETRY"],
        rejectedEvidenceIds: ["E-W002-LENGTH-A"],
        rationale: "Reviewer selected 14 ft from conflicting candidates.",
      },
    });

    assert.throws(
      () =>
        resolveWallFraming(runOne.evidence, {
          userDecisions: [decision],
          reviewItemsById: new Map([[reviewItem.id, reviewItem]]),
        }),
      /belongs to subject W-001, not W-002/,
    );
  });

  it("rejects accepted Evidence with the wrong propertyPath", () => {
    const runOne = runOneConflictState();
    const reviewItem = ws002LengthReviewItem(runOne.validation);
    const decision = conflictResolvedDecision(reviewItem, {
      result: {
        type: "conflict-resolved",
        value: 14,
        acceptedEvidenceIds: ["E-W002-FRAMING"],
        rejectedEvidenceIds: ["E-W002-LENGTH-A"],
        rationale: "Reviewer selected 14 ft from conflicting candidates.",
      },
    });

    assert.throws(
      () =>
        resolveWallFraming(runOne.evidence, {
          userDecisions: [decision],
          reviewItemsById: new Map([[reviewItem.id, reviewItem]]),
        }),
      /targets property assembly\.studSize, not lengthFeet/,
    );
  });

  it("rejects a decision value that does not match accepted Evidence", () => {
    const runOne = runOneConflictState();
    const reviewItem = ws002LengthReviewItem(runOne.validation);
    const decision = conflictResolvedDecision(reviewItem, {
      result: {
        type: "conflict-resolved",
        value: 12,
        acceptedEvidenceIds: ["E-W002-LENGTH-B"],
        rejectedEvidenceIds: ["E-W002-LENGTH-A"],
        rationale: "Reviewer selected 14 ft from conflicting candidates.",
      },
    });

    assert.throws(
      () =>
        resolveWallFraming(runOne.evidence, {
          userDecisions: [decision],
          reviewItemsById: new Map([[reviewItem.id, reviewItem]]),
        }),
      /value does not match accepted Evidence candidate value/,
    );
  });

  it("rejects overlapping accepted and rejected Evidence", () => {
    const runOne = runOneConflictState();
    const reviewItem = ws002LengthReviewItem(runOne.validation);
    const decision = conflictResolvedDecision(reviewItem, {
      result: {
        type: "conflict-resolved",
        value: 14,
        acceptedEvidenceIds: ["E-W002-LENGTH-B"],
        rejectedEvidenceIds: ["E-W002-LENGTH-B"],
        rationale: "Reviewer selected 14 ft from conflicting candidates.",
      },
    });

    assert.throws(
      () =>
        resolveWallFraming(runOne.evidence, {
          userDecisions: [decision],
          reviewItemsById: new Map([[reviewItem.id, reviewItem]]),
        }),
      /cannot be both accepted and rejected/,
    );
  });

  it("rejects accepted Evidence with the wrong subjectKind", () => {
    const runOne = runOneConflictState();
    const reviewItem = ws002LengthReviewItem(runOne.validation);
    const decision = conflictResolvedDecision(reviewItem, {
      result: {
        type: "conflict-resolved",
        value: 14,
        acceptedEvidenceIds: ["E-W002-LENGTH-B"],
        rejectedEvidenceIds: ["E-W002-LENGTH-A"],
        rationale: "Reviewer selected 14 ft from conflicting candidates.",
      },
    });
    const evidenceWithMemberKind = runOne.evidence.map((record) =>
      record.id === "E-W002-LENGTH-B"
        ? { ...record, subjectKind: "structural-member" as const }
        : record,
    );

    assert.throws(
      () =>
        resolveWallFraming(evidenceWithMemberKind, {
          userDecisions: [decision],
          reviewItemsById: new Map([[reviewItem.id, reviewItem]]),
        }),
      /belongs to subjectKind structural-member, not wall/,
    );
  });

  it("rejects a Review Item that targets the wrong object", () => {
    const runOne = runOneConflictState();
    const reviewItem = {
      ...ws002LengthReviewItem(runOne.validation),
      affectedObjects: [{ objectId: "WS-001", objectType: "wall-segment" }],
    };
    const decision = conflictResolvedDecision(reviewItem);

    assert.throws(
      () =>
        resolveWallFraming(runOne.evidence, {
          userDecisions: [decision],
          reviewItemsById: new Map([[reviewItem.id, reviewItem]]),
        }),
      /belongs to subject W-002, not W-001/,
    );
  });

  it("rejects a Review Item that targets the wrong property", () => {
    const runOne = runOneConflictState();
    const reviewItem = {
      ...ws002LengthReviewItem(runOne.validation),
      action: {
        type: "provide-value" as const,
        instruction: "Provide plate count.",
        targetProperty: "assembly.plateCount",
      },
    };
    const decision = conflictResolvedDecision(reviewItem);

    assert.throws(
      () =>
        resolveWallFraming(runOne.evidence, {
          userDecisions: [decision],
          reviewItemsById: new Map([[reviewItem.id, reviewItem]]),
        }),
      /targets property lengthFeet, not assembly\.plateCount/,
    );
  });

  it("accepts value-provided decisions for wall provide-value Review Items", () => {
    const runOne = runOneConflictState();
    const reviewItem = ws002LengthReviewItem(runOne.validation);
    assert.equal(reviewItem.action.type, "provide-value");

    const decision = {
      ...conflictResolvedDecision(reviewItem),
      result: {
        type: "value-provided" as const,
        value: 14,
        rationale: "Entered a corrected value.",
      },
    };

    const wallFraming = resolveWallFraming(runOne.evidence, {
      userDecisions: [decision],
      reviewItemsById: new Map([[reviewItem.id, reviewItem]]),
    });
    const segment002 = wallFraming.segments.find(
      (segment) => segment.id === "WS-002",
    );
    assert.equal(segment002?.lengthFeet, 14);
    const lengthTrace = segment002?.resolutionTraces.find(
      (trace) => trace.propertyPath === "lengthFeet",
    );
    assert.equal(lengthTrace?.method, "user-override");
    assert.deepEqual(lengthTrace?.userDecisionIds, [decision.id]);
  });

  it("rejects stale accepted Evidence when the current input no longer contains it", () => {
    const runOne = runOneConflictState();
    const reviewItem = ws002LengthReviewItem(runOne.validation);
    const decision = conflictResolvedDecision(reviewItem);
    const evidenceWithoutAccepted = runOne.evidence.filter(
      (record) => record.id !== "E-W002-LENGTH-B",
    );

    assert.throws(
      () =>
        resolveWallFraming(evidenceWithoutAccepted, {
          userDecisions: [decision],
          reviewItemsById: new Map([[reviewItem.id, reviewItem]]),
        }),
      /missing accepted Evidence E-W002-LENGTH-B/,
    );
  });
});
