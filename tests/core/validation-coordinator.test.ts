import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validationPayloadSchema } from "../../src/scopes/framing/schemas/framing-artifacts.schema.js";
import {
  buildRelatedObjectMaps,
  hasParentArtifacts,
} from "../../src/scopes/framing/validators/buildRelatedObjectMaps.js";
import {
  FLOOR_FRAMING_RULE_IDS,
  OPENINGS_RULE_IDS,
  STRUCTURAL_MEMBER_RULE_IDS,
  WALL_FRAMING_RULE_IDS,
} from "../../src/scopes/framing/validators/rule-ids.js";
import { coordinateFramingValidation } from "../../src/scopes/framing/validators/validation-coordinator.js";

const complete = {
  status: "complete",
  percentage: 100,
  completedItems: 1,
  totalItems: 1,
} as const;

function buildIntegratedInput() {
  return {
    wallFraming: {
      walls: [
        {
          id: "W-001",
          objectType: "building-wall" as const,
          completion: complete,
          reviewStatus: "no-review-required" as const,
          blockingStatus: "not-blocked" as const,
          evidenceIds: ["E-001"],
          assumptionIds: [],
          validationIssueIds: [],
          reviewItemIds: [],
          resolutionTraces: [
            {
              propertyPath: "assembly.heightFeet",
              method: "explicit-project-value" as const,
              explanation: "Height is explicit on the plan.",
              evidenceIds: ["E-001"],
              assumptionIds: [],
              validationIssueIds: [],
              reviewItemIds: [],
            },
          ],
          name: "Exterior wall W-001",
          level: "Level 1",
          wallType: "exterior-wood-stud-wall" as const,
          location: "exterior" as const,
          bearingStatus: "non-bearing" as const,
          isShearOrBraced: false,
          fireRating: null,
          constructionPhase: "new" as const,
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
          objectType: "wall-segment" as const,
          completion: complete,
          reviewStatus: "no-review-required" as const,
          blockingStatus: "not-blocked" as const,
          evidenceIds: ["E-002"],
          assumptionIds: [],
          validationIssueIds: [],
          reviewItemIds: [],
          resolutionTraces: [
            {
              propertyPath: "lengthFeet",
              method: "explicit-project-value" as const,
              explanation: "Length is explicit on the plan.",
              evidenceIds: ["E-002"],
              assumptionIds: [],
              validationIssueIds: [],
              reviewItemIds: [],
            },
          ],
          parentWallId: "W-001",
          lengthFeet: 24,
          openingIds: ["O-014"],
        },
      ],
    },
    openings: {
      openings: [
        {
          id: "O-014",
          objectType: "opening" as const,
          completion: complete,
          reviewStatus: "no-review-required" as const,
          blockingStatus: "not-blocked" as const,
          evidenceIds: ["E-014"],
          assumptionIds: [],
          validationIssueIds: [],
          reviewItemIds: [],
          resolutionTraces: [],
          category: "window" as const,
          identityRole: "occurrence" as const,
          absorbedSubjectKeys: [],
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
        },
      ],
    },
    structuralMembers: {
      structuralMembers: [
        {
          id: "SM-008",
          objectType: "structural-member" as const,
          completion: complete,
          reviewStatus: "no-review-required" as const,
          blockingStatus: "not-blocked" as const,
          evidenceIds: ["E-008"],
          assumptionIds: [],
          validationIssueIds: [],
          reviewItemIds: [],
          resolutionTraces: [],
          category: "header" as const,
          materialType: "lvl",
          size: "1.75x11.875",
          plyCount: 2,
          lengthFeet: 6,
          quantity: 1,
          location: "W-001 window header",
          associatedObjectIds: ["O-014", "W-001"],
          supportedObjectIds: [],
          supportingObjectIds: ["W-001"],
          connectorIds: ["CN-001"],
        },
      ],
    },
    connectorsHardware: {
      connectors: [
        {
          id: "CN-001",
          objectType: "connector" as const,
          completion: complete,
          reviewStatus: "no-review-required" as const,
          blockingStatus: "not-blocked" as const,
          evidenceIds: ["E-009"],
          assumptionIds: [],
          validationIssueIds: [],
          reviewItemIds: [],
          resolutionTraces: [],
          connectorType: "hanger",
          model: "HU210",
          associatedObjectIds: ["SM-008"],
          hardwareIds: [],
          fastenerIds: [],
        },
      ],
      hardware: [],
      fasteners: [],
    },
  };
}

function buildFloorFraming() {
  return {
    systems: [
      {
        id: "FFS-001",
        objectType: "floor-framing-system" as const,
        completion: complete,
        reviewStatus: "no-review-required" as const,
        blockingStatus: "not-blocked" as const,
        evidenceIds: ["E-FFS-001"],
        assumptionIds: [],
        validationIssueIds: [],
        reviewItemIds: [],
        resolutionTraces: [
          {
            propertyPath: "assembly.joistType",
            method: "explicit-project-value" as const,
            explanation: "Joist type is explicit on the plan.",
            evidenceIds: ["E-FFS-001"],
            assumptionIds: [],
            validationIssueIds: [],
            reviewItemIds: [],
          },
          {
            propertyPath: "assembly.joistSize",
            method: "explicit-project-value" as const,
            explanation: "Joist size is explicit on the schedule.",
            evidenceIds: ["E-FFS-001"],
            assumptionIds: [],
            validationIssueIds: [],
            reviewItemIds: [],
          },
          {
            propertyPath: "assembly.joistSpacingInches",
            method: "explicit-project-value" as const,
            explanation: "Joist spacing is explicit on the schedule.",
            evidenceIds: ["E-FFS-001"],
            assumptionIds: [],
            validationIssueIds: [],
            reviewItemIds: [],
          },
        ],
        name: "Level 2 floor framing",
        level: "Level 2",
        constructionPhase: "new" as const,
        assembly: {
          joistType: "i-joist",
          joistSize: "11-7/8",
          joistSpacingInches: 16,
          rimBoard: "1-1/8 rim board",
        },
        areaIds: ["FFA-001"],
      },
    ],
    areas: [
      {
        id: "FFA-001",
        objectType: "floor-framing-area" as const,
        completion: complete,
        reviewStatus: "no-review-required" as const,
        blockingStatus: "not-blocked" as const,
        evidenceIds: ["E-FFA-001"],
        assumptionIds: [],
        validationIssueIds: [],
        reviewItemIds: [],
        resolutionTraces: [
          {
            propertyPath: "spanDirection",
            method: "explicit-project-value" as const,
            explanation: "Span direction is explicit on the plan.",
            evidenceIds: ["E-FFA-001"],
            assumptionIds: [],
            validationIssueIds: [],
            reviewItemIds: [],
          },
          {
            propertyPath: "joistLayoutLengthFeet",
            method: "explicit-project-value" as const,
            explanation: "Joist layout length is explicit on the plan.",
            evidenceIds: ["E-FFA-001"],
            assumptionIds: [],
            validationIssueIds: [],
            reviewItemIds: [],
          },
          {
            propertyPath: "areaSquareFeet",
            method: "explicit-project-value" as const,
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
      },
    ],
  };
}

describe("buildRelatedObjectMaps", () => {
  it("indexes objects from every provided artifact payload", () => {
    const input = buildIntegratedInput();
    const { relatedObjectsById, connectorsById } = buildRelatedObjectMaps(input);

    assert.ok(relatedObjectsById.has("W-001"));
    assert.ok(relatedObjectsById.has("WS-001"));
    assert.ok(relatedObjectsById.has("O-014"));
    assert.ok(relatedObjectsById.has("SM-008"));
    assert.ok(connectorsById.has("CN-001"));
    assert.equal(hasParentArtifacts(input), true);
  });
});

describe("coordinateFramingValidation", () => {
  it("returns an empty validation payload when no artifacts are provided", () => {
    const payload = coordinateFramingValidation({});

    assert.deepEqual(payload, {
      validationIssues: [],
      validationResults: [],
      reviewItems: [],
    });
    validationPayloadSchema.parse(payload);
  });

  it("runs only the wall validator when only wall framing is provided", () => {
    const input = buildIntegratedInput();
    const payload = coordinateFramingValidation({
      wallFraming: input.wallFraming,
    });

    assert.ok(
      payload.validationResults.some(
        (result) => result.ruleId === WALL_FRAMING_RULE_IDS.typeResolved,
      ),
    );
    assert.ok(
      !payload.validationResults.some((result) =>
        result.ruleId.startsWith("opening."),
      ),
    );
  });

  it("resolves cross-artifact opening and member references when artifacts are supplied together", () => {
    const payload = coordinateFramingValidation(buildIntegratedInput());

    assert.equal(payload.validationIssues.length, 2);
    assert.equal(payload.reviewItems.length, 2);
    assert.ok(
      payload.reviewItems.some((item) => item.title.includes("Confirm rough sill size")),
    );
    assert.ok(
      payload.reviewItems.some((item) => item.title.includes("Confirm cripple stud layout")),
    );
    assert.ok(
      payload.validationIssues.some(
        (issue) => issue.ruleId === OPENINGS_RULE_IDS.roughSillSizeDefault,
      ),
    );
    assert.ok(
      payload.validationIssues.some(
        (issue) => issue.ruleId === OPENINGS_RULE_IDS.crippleLayoutDefault,
      ),
    );
    assert.ok(
      payload.validationResults.some(
        (result) =>
          result.ruleId === OPENINGS_RULE_IDS.parentResolved &&
          result.outcome === "passed",
      ),
    );
    assert.ok(
      payload.validationResults.some(
        (result) =>
          result.ruleId === OPENINGS_RULE_IDS.headerReferenceResolved &&
          result.outcome === "passed",
      ),
    );
  });

  it("skips opening parent validation when parent artifacts are absent", () => {
    const input = buildIntegratedInput();
    const payload = coordinateFramingValidation({
      openings: input.openings,
      structuralMembers: input.structuralMembers,
    });

    const parentResult = payload.validationResults.find(
      (result) => result.ruleId === OPENINGS_RULE_IDS.parentResolved,
    );

    assert.equal(parentResult?.outcome, "skipped");
  });

  it("does not activate floor bounding-wall validation when only unrelated artifacts are supplied", () => {
    const input = buildIntegratedInput();
    const payload = coordinateFramingValidation({
      floorFraming: buildFloorFraming(),
      connectorsHardware: input.connectorsHardware,
    });

    const boundingWallResult = payload.validationResults.find(
      (result) =>
        result.ruleId === FLOOR_FRAMING_RULE_IDS.boundingWallsResolved,
    );
    const openingResult = payload.validationResults.find(
      (result) =>
        result.ruleId === FLOOR_FRAMING_RULE_IDS.openingReferencesResolved,
    );

    assert.equal(boundingWallResult?.outcome, "skipped");
    assert.equal(openingResult?.outcome, "skipped");
  });

  it("activates floor bounding-wall validation when wall artifacts are supplied", () => {
    const input = buildIntegratedInput();
    const payload = coordinateFramingValidation({
      wallFraming: input.wallFraming,
      floorFraming: buildFloorFraming(),
    });

    const boundingWallResult = payload.validationResults.find(
      (result) =>
        result.ruleId === FLOOR_FRAMING_RULE_IDS.boundingWallsResolved,
    );
    const openingResult = payload.validationResults.find(
      (result) =>
        result.ruleId === FLOOR_FRAMING_RULE_IDS.openingReferencesResolved,
    );

    assert.equal(boundingWallResult?.outcome, "passed");
    assert.equal(openingResult?.outcome, "skipped");
  });

  it("fails dangling floor bounding-wall references when wall artifacts are supplied", () => {
    const input = buildIntegratedInput();
    const floorFraming = buildFloorFraming();
    floorFraming.areas[0] = {
      ...floorFraming.areas[0]!,
      boundingWallIds: ["W-MISSING"],
    };

    const payload = coordinateFramingValidation({
      wallFraming: input.wallFraming,
      floorFraming,
    });

    const boundingWallResult = payload.validationResults.find(
      (result) =>
        result.ruleId === FLOOR_FRAMING_RULE_IDS.boundingWallsResolved,
    );

    assert.equal(boundingWallResult?.outcome, "failed");
  });

  it("does not activate member associated-object validation when only connector artifacts are supplied", () => {
    const input = buildIntegratedInput();
    const payload = coordinateFramingValidation({
      structuralMembers: input.structuralMembers,
      connectorsHardware: input.connectorsHardware,
    });

    const associatedResult = payload.validationResults.find(
      (result) =>
        result.ruleId === STRUCTURAL_MEMBER_RULE_IDS.associatedObjectsResolved,
    );
    const connectorResult = payload.validationResults.find(
      (result) =>
        result.ruleId ===
        STRUCTURAL_MEMBER_RULE_IDS.connectorReferencesResolved,
    );

    assert.equal(associatedResult?.outcome, "skipped");
    assert.equal(connectorResult?.outcome, "passed");
  });

  it("merges subsystem validation batches without duplicate record IDs", () => {
    const payload = coordinateFramingValidation(buildIntegratedInput());
    const issueIds = payload.validationIssues.map((issue) => issue.id);
    const resultIds = payload.validationResults.map((result) => result.id);
    const reviewItemIds = payload.reviewItems.map((item) => item.id);

    assert.equal(new Set(issueIds).size, issueIds.length);
    assert.equal(new Set(resultIds).size, resultIds.length);
    assert.equal(new Set(reviewItemIds).size, reviewItemIds.length);
  });

  it("produces deterministic output across identical reruns", () => {
    const input = buildIntegratedInput();
    const first = coordinateFramingValidation(input);
    const second = coordinateFramingValidation(input);

    assert.deepEqual(first, second);
  });

  it("parses merged output through the validation payload schema", () => {
    const payload = coordinateFramingValidation(buildIntegratedInput());

    validationPayloadSchema.parse(payload);
  });
});
