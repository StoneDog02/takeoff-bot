import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { openingCoverageSchema } from "../../src/scopes/framing/audit/auditMetrics.schema.js";
import { collectOpeningCoverage } from "../../src/scopes/framing/audit/collectOpeningCoverage.js";
import type { LoadedAuditArtifacts } from "../../src/scopes/framing/audit/collectFramingAuditMetrics.js";
import type { Opening } from "../../src/scopes/framing/schemas/opening.schema.js";

describe("B2.2M.3 opening coverage metrics", () => {
  it("tracks material-authoritative openings separately from detected count", () => {
    const opening: Opening = {
      id: "O-001",
      objectType: "opening",
      completion: {
        status: "complete",
        percentage: 100,
        completedItems: 1,
        totalItems: 1,
      },
      reviewStatus: "no-review-required",
      blockingStatus: "not-blocked",
      evidenceIds: ["E-DIM-STATUS"],
      assumptionIds: [],
      validationIssueIds: [],
      reviewItemIds: [],
      resolutionTraces: [],
      category: "door",
      identityRole: "occurrence",
      absorbedSubjectKeys: [],
      parentObjectId: "WS-001",
      parentWallId: "W-001",
      dimensions: {
        nominalWidthFeet: 3,
        nominalHeightFeet: 7,
        roughWidthFeet: 3.5,
        roughHeightFeet: 7.5,
      },
      quantity: 1,
      scheduleReference: null,
      detailReference: null,
      headerMemberId: null,
      fireRating: null,
      kingStudCount: null,
      jackStudCount: null,
      positionOffsetFeetFromSegmentStart: 4,
    };

    const artifacts: LoadedAuditArtifacts = {
      compiledPages: { pages: [] },
      evidence: [
        {
          id: "E-DIM-STATUS",
          type: "geometry",
          relationship: "supports",
          description: "dim ownership",
          source: {
            page: {
              documentId: null,
              pageNumber: 4,
              sheetId: null,
              sheetTitle: null,
              pageLabel: null,
              revision: null,
            },
            region: null,
            elementLabel: null,
            detailNumber: null,
            sectionNumber: null,
            scheduleName: null,
            noteReference: null,
          },
          originalText: "ESTABLISHED",
          references: [],
          subjectKind: "opening",
          subjectKey: "O-001",
          propertyPath: "dimensionOwnershipStatus",
          candidateValue: "ESTABLISHED",
          extractionPassId: null,
          bundleId: null,
        },
      ],
      wallFraming: {
        walls: [
          {
            id: "W-001",
            objectType: "building-wall",
            completion: opening.completion,
            reviewStatus: "no-review-required",
            blockingStatus: "not-blocked",
            evidenceIds: [],
            assumptionIds: [],
            validationIssueIds: [],
            reviewItemIds: [],
            resolutionTraces: [],
            name: "W-001",
            level: null,
            wallType: "wood-stud-wall",
            semanticTypeKey: null,
            bindingAuthorityGrade: null,
            location: "unknown",
            bearingStatus: "unknown",
            isShearOrBraced: null,
            fireRating: null,
            constructionPhase: "unknown",
            assembly: {
              material: "dimensional-lumber",
              studSize: "2x4",
              studSpacingInches: 16,
              heightFeet: null,
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
            completion: opening.completion,
            reviewStatus: "no-review-required",
            blockingStatus: "not-blocked",
            evidenceIds: [],
            assumptionIds: [],
            validationIssueIds: [],
            reviewItemIds: [],
            resolutionTraces: [
              {
                propertyPath: "lengthFeet",
                method: "explicit-project-value",
                explanation: "length",
                evidenceIds: [],
                assumptionIds: [],
                validationIssueIds: [],
                reviewItemIds: [],
              },
            ],
            parentWallId: "W-001",
            lengthFeet: 20,
            openingIds: [],
          },
        ],
      },
      openings: { openings: [opening] },
      structuralMembers: null,
      floorFraming: null,
      roofFraming: null,
      sheathing: null,
      validation: null,
      calculations: null,
      takeoff: null,
      projectDictionary: null,
    };

    const coverage = collectOpeningCoverage(artifacts);
    openingCoverageSchema.parse(coverage);
    assert.equal(coverage.openingsDetected, 1);
    assert.equal(coverage.openingsMaterialAuthoritative, 1);
    assert.ok(coverage.regularStudQuantityDelta < 0);
    assert.equal(
      coverage.productionStudQuantityDelta,
      coverage.regularStudQuantityDelta,
    );
    assert.equal(coverage.segmentsBlockedByOpeningOverlap, 0);
  });

  it("reports zero production delta when eligible openings overlap on a segment", () => {
    const base = {
      objectType: "opening" as const,
      completion: {
        status: "complete" as const,
        percentage: 100,
        completedItems: 1,
        totalItems: 1,
      },
      reviewStatus: "no-review-required" as const,
      blockingStatus: "not-blocked" as const,
      assumptionIds: [] as string[],
      validationIssueIds: [] as string[],
      reviewItemIds: [] as string[],
      resolutionTraces: [],
      category: "door" as const,
      identityRole: "occurrence" as const,
      absorbedSubjectKeys: [] as string[],
      parentObjectId: "WS-001",
      parentWallId: "W-001",
      quantity: 1,
      scheduleReference: null,
      detailReference: null,
      headerMemberId: null,
      fireRating: null,
      kingStudCount: null,
      jackStudCount: null,
    };

    const openingA: Opening = {
      ...base,
      id: "O-001",
      evidenceIds: ["E-DIM-A"],
      dimensions: {
        nominalWidthFeet: 3,
        nominalHeightFeet: 7,
        roughWidthFeet: 3,
        roughHeightFeet: 7.5,
      },
      positionOffsetFeetFromSegmentStart: 4,
    };
    const openingB: Opening = {
      ...base,
      id: "O-002",
      evidenceIds: ["E-DIM-B"],
      dimensions: {
        nominalWidthFeet: 3,
        nominalHeightFeet: 7,
        roughWidthFeet: 3,
        roughHeightFeet: 7.5,
      },
      positionOffsetFeetFromSegmentStart: 5,
    };

    const evidence = [openingA, openingB].map((o) => ({
      id: o.evidenceIds[0]!,
      type: "geometry" as const,
      relationship: "supports" as const,
      description: "dim",
      source: {
        page: {
          documentId: null,
          pageNumber: 4,
          sheetId: null,
          sheetTitle: null,
          pageLabel: null,
          revision: null,
        },
        region: null,
        elementLabel: null,
        detailNumber: null,
        sectionNumber: null,
        scheduleName: null,
        noteReference: null,
      },
      originalText: "ESTABLISHED",
      references: [],
      subjectKind: "opening" as const,
      subjectKey: o.id,
      propertyPath: "dimensionOwnershipStatus",
      candidateValue: "ESTABLISHED",
      extractionPassId: null,
      bundleId: null,
    }));

    const artifacts: LoadedAuditArtifacts = {
      compiledPages: { pages: [] },
      evidence,
      wallFraming: {
        walls: [
          {
            id: "W-001",
            objectType: "building-wall",
            completion: openingA.completion,
            reviewStatus: "no-review-required",
            blockingStatus: "not-blocked",
            evidenceIds: [],
            assumptionIds: [],
            validationIssueIds: [],
            reviewItemIds: [],
            resolutionTraces: [],
            name: "W-001",
            level: null,
            wallType: "wood-stud-wall",
            semanticTypeKey: null,
            bindingAuthorityGrade: null,
            location: "unknown",
            bearingStatus: "unknown",
            isShearOrBraced: null,
            fireRating: null,
            constructionPhase: "unknown",
            assembly: {
              material: "dimensional-lumber",
              studSize: "2x4",
              studSpacingInches: 16,
              heightFeet: null,
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
            completion: openingA.completion,
            reviewStatus: "no-review-required",
            blockingStatus: "not-blocked",
            evidenceIds: [],
            assumptionIds: [],
            validationIssueIds: [],
            reviewItemIds: [],
            resolutionTraces: [
              {
                propertyPath: "lengthFeet",
                method: "explicit-project-value",
                explanation: "length",
                evidenceIds: [],
                assumptionIds: [],
                validationIssueIds: [],
                reviewItemIds: [],
              },
            ],
            parentWallId: "W-001",
            lengthFeet: 20,
            openingIds: [],
          },
        ],
      },
      openings: { openings: [openingA, openingB] },
      structuralMembers: null,
      floorFraming: null,
      roofFraming: null,
      sheathing: null,
      validation: null,
      calculations: null,
      takeoff: null,
      projectDictionary: null,
    };

    const coverage = collectOpeningCoverage(artifacts);
    assert.equal(coverage.regularStudQuantityDelta, 0);
    assert.equal(coverage.productionStudQuantityDelta, 0);
    assert.equal(coverage.segmentsBlockedByOpeningOverlap, 1);
    assert.equal(coverage.openingsAffectingStudCalculation, 0);
  });
});
