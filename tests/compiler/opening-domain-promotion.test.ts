import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { shouldPromoteOpeningToDomain } from "../../src/framing/geometry/buildOpeningEvidenceFromCompiledPages.js";
import type { GovernedOpeningCandidate } from "../../src/framing/geometry/openingGovernanceTypes.js";

function baseCandidate(
  overrides: Partial<GovernedOpeningCandidate> = {},
): GovernedOpeningCandidate {
  return {
    openingSubjectKey: "opening:p4:physical-run:p4:test:gap0",
    pageNumber: 4,
    physicalRunKey: "physical-run:p4:test",
    gapIndex: 0,
    gapAt: { x: 100, y: 200 },
    gapPt: 48,
    runOrientation: "H",
    runLengthPt: 700,
    wallAuthority: "high",
    category: "unknown",
    physicalRunOwnership: {
      status: "ESTABLISHED",
      parentPhysicalRunKey: "physical-run:p4:test",
      positionOffsetFeetFromSegmentStart: 4,
      notes: [],
    },
    dimensionOwnership: {
      status: "UNRESOLVED",
      roughWidthFeet: null,
      nominalWidthFeet: null,
      dimId: null,
      textPrimitiveId: null,
      originalText: null,
      matchScore: null,
      notes: [],
    },
    markOwnership: {
      status: "UNRESOLVED",
      markText: null,
      textPrimitiveId: null,
      literalCategory: null,
      matchScore: null,
      notes: [],
    },
    materialAuthoritative: false,
    ...overrides,
  };
}

describe("shouldPromoteOpeningToDomain", () => {
  it("promotes material-authoritative candidates", () => {
    assert.equal(
      shouldPromoteOpeningToDomain(
        baseCandidate({
          materialAuthoritative: true,
          dimensionOwnership: {
            status: "ESTABLISHED",
            roughWidthFeet: 3,
            nominalWidthFeet: 3,
            dimId: null,
            textPrimitiveId: "t-1",
            originalText: "3'-0\"",
            matchScore: 10,
            notes: [],
          },
        }),
      ),
      true,
    );
  });

  it("promotes AMBIGUOUS width with parent run as review tier", () => {
    assert.equal(
      shouldPromoteOpeningToDomain(
        baseCandidate({
          dimensionOwnership: {
            status: "AMBIGUOUS",
            roughWidthFeet: null,
            nominalWidthFeet: null,
            dimId: null,
            textPrimitiveId: null,
            originalText: null,
            matchScore: null,
            notes: ["two dims"],
          },
        }),
      ),
      true,
    );
  });

  it("does not promote unresolved gap inventory", () => {
    assert.equal(shouldPromoteOpeningToDomain(baseCandidate()), false);
  });
});
