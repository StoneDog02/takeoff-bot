import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getClaimCriticalInputContract,
  isReviewOnlyPropertyForQuantity,
  listClaimCriticalInputContracts,
} from "../../../src/scopes/framing/claims/claimContracts.js";
import {
  consultAssumptionRegistry,
  listAssumptionRegistryEntries,
  lookupAssumptionRegistryEntry,
} from "../../../src/scopes/framing/claims/assumptionRegistry.js";
import { deriveMaterialClaimStatus } from "../../../src/scopes/framing/claims/deriveClaimStatus.js";
import { createBlockedMissingInputPendingClaim } from "../../../src/scopes/framing/claims/collectPendingClaims.js";
import { applyAssumptionUserDecisionLifecycle } from "../../../src/scopes/framing/claims/applyAssumptionLifecycle.js";
import { createOpeningKingStudCountAssumption } from "../../../src/scopes/framing/calculators/createOpeningKingStudCountAssumption.js";
import { calculateOpeningFraming } from "../../../src/scopes/framing/calculators/calculateOpeningFraming.js";
import { coordinateFramingCalculations } from "../../../src/scopes/framing/calculators/calculation-coordinator.js";
import type {
  OpeningsPayload,
  WallFramingPayload,
} from "../../../src/scopes/framing/schemas/framing-artifacts.schema.js";
import {
  openingSchema,
  type Opening,
} from "../../../src/scopes/framing/schemas/opening.schema.js";
import {
  buildingWallSchema,
  wallSegmentSchema,
} from "../../../src/scopes/framing/schemas/wall.schema.js";
import {
  FLOOR_QUANTITY_KEYS,
  OPENING_QUANTITY_KEYS,
} from "../../../src/scopes/framing/validators/rule-ids.js";
import type {
  ObjectId,
  ReviewItemId,
  UserDecisionId,
} from "../../../src/core/schemas/identity.schema.js";

const complete = {
  status: "complete",
  percentage: 100,
  completedItems: 1,
  totalItems: 1,
} as const;

function resolvedTrace(
  propertyPath: string,
  method:
    | "explicit-project-value"
    | "approved-default"
    | "unresolved" = "explicit-project-value",
) {
  return {
    propertyPath,
    method,
    explanation: `${propertyPath} is resolved.`,
    evidenceIds: ["E-001"],
    assumptionIds: [],
    validationIssueIds: [],
    reviewItemIds: [],
    userDecisionIds: [],
  };
}

function buildWallFraming(options: {
  heightFeet?: number | null;
} = {}): WallFramingPayload {
  const heightFeet = options.heightFeet === undefined ? 8 : options.heightFeet;
  const heightTrace =
    heightFeet === null
      ? resolvedTrace("assembly.heightFeet", "unresolved")
      : resolvedTrace("assembly.heightFeet");

  return {
    walls: [
      buildingWallSchema.parse({
        id: "W-001",
        objectType: "building-wall",
        completion: complete,
        reviewStatus: "no-review-required",
        blockingStatus: "not-blocked",
        evidenceIds: ["E-WALL"],
        resolutionTraces: [
          resolvedTrace("assembly.studSize"),
          heightTrace,
          resolvedTrace("assembly.studSpacingInches"),
          resolvedTrace("assembly.plateCount"),
        ],
        name: "Exterior wall W-001",
        level: "Level 1",
        wallType: "exterior-wood-stud-wall",
        location: "exterior",
        bearingStatus: "non-bearing",
        isShearOrBraced: false,
        constructionPhase: "new",
        assembly: {
          material: "dimensional-lumber",
          studSize: "2x4",
          studSpacingInches: 16,
          heightFeet,
          plateCount: 3,
        },
        segmentIds: ["WS-001"],
      }),
    ],
    segments: [
      wallSegmentSchema.parse({
        id: "WS-001",
        objectType: "wall-segment",
        completion: complete,
        reviewStatus: "no-review-required",
        blockingStatus: "not-blocked",
        evidenceIds: ["E-SEG"],
        resolutionTraces: [resolvedTrace("lengthFeet")],
        parentWallId: "W-001",
        lengthFeet: 20,
        openingIds: ["O-001"],
      }),
    ],
  };
}

function buildOpening(overrides: Partial<Opening> = {}): Opening {
  return openingSchema.parse({
    id: "O-001",
    objectType: "opening",
    completion: complete,
    reviewStatus: "no-review-required",
    blockingStatus: "not-blocked",
    evidenceIds: ["E-O001"],
    resolutionTraces: [
      resolvedTrace("quantity"),
      resolvedTrace("dimensions.roughWidthFeet"),
      resolvedTrace("dimensions.roughHeightFeet"),
      resolvedTrace("kingStudCount", "unresolved"),
      resolvedTrace("jackStudCount", "unresolved"),
    ],
    category: "window",
    parentObjectId: "WS-001",
    parentWallId: "W-001",
    quantity: 1,
    dimensions: {
      nominalWidthFeet: 3,
      nominalHeightFeet: 4,
      roughWidthFeet: 3.0833,
      roughHeightFeet: 4.0833,
    },
    ...overrides,
  });
}

function buildOpenings(openings: Opening[] = [buildOpening()]): OpeningsPayload {
  return { openings };
}

describe("Material Claim Authority Ladder — contracts + registry", () => {
  it("exposes claim-critical contracts for emit-capable quantityKeys", () => {
    const contracts = listClaimCriticalInputContracts();
    assert.ok(contracts.length >= 13);
    assert.ok(getClaimCriticalInputContract(OPENING_QUANTITY_KEYS.kingStuds));
    assert.equal(
      isReviewOnlyPropertyForQuantity(
        OPENING_QUANTITY_KEYS.kingStuds,
        "assembly.heightFeet",
      ),
      true,
    );
    assert.equal(
      isReviewOnlyPropertyForQuantity(
        FLOOR_QUANTITY_KEYS.joists,
        "joistMemberLengthFeet",
      ),
      true,
    );
  });

  it("uses an explicit closed assumption registry (no inference)", () => {
    assert.ok(
      lookupAssumptionRegistryEntry(
        OPENING_QUANTITY_KEYS.kingStuds,
        "kingStudCount",
      )?.brainCitation.includes("13-opening"),
    );
    assert.equal(
      lookupAssumptionRegistryEntry(
        FLOOR_QUANTITY_KEYS.joists,
        "joistLayoutLengthFeet",
      ),
      undefined,
    );
    assert.equal(
      lookupAssumptionRegistryEntry(
        FLOOR_QUANTITY_KEYS.joists,
        "assembly.joistSpacingInches",
      ),
      undefined,
    );
    assert.equal(
      lookupAssumptionRegistryEntry(
        OPENING_QUANTITY_KEYS.jackStuds,
        "jackStudCount",
      ),
      undefined,
    );
    assert.equal(
      lookupAssumptionRegistryEntry("member.material", "size"),
      undefined,
    );
    for (const entry of listAssumptionRegistryEntries()) {
      assert.match(entry.brainCitation, /^knowledge\/framing\//);
    }
  });

  it("consultAssumptionRegistry never invents unlisted defaults", () => {
    const missed = consultAssumptionRegistry({
      quantityKey: OPENING_QUANTITY_KEYS.jackStuds,
      propertyPath: "jackStudCount",
      context: { objectId: "O-001" as ObjectId },
      reviewItemId: "RI-test" as ReviewItemId,
    });
    assert.equal(missed.outcome, "not-registered");
  });
});

describe("Material Claim Authority Ladder — assumed quantity + pending", () => {
  it("emits king studs with CALCULATED_WITH_ASSUMPTION without wall height", () => {
    const result = calculateOpeningFraming(
      buildOpenings(),
      buildWallFraming({ heightFeet: null }),
    );
    const kings = result.materials.filter((m) =>
      /king studs/i.test(m.description),
    );
    assert.equal(kings.length, 1);
    assert.equal(kings[0]!.quantity, 2);
    assert.equal(kings[0]!.claimStatus, "CALCULATED_WITH_ASSUMPTION");
    assert.ok(kings[0]!.assumptionIds.length > 0);
    assert.ok(result.assumptions.some((a) => a.status === "active"));
  });

  it("emits pending claim when jackStudCount is missing (no registry entry)", () => {
    const result = calculateOpeningFraming(buildOpenings(), buildWallFraming());
    assert.equal(
      result.materials.some((m) => /jack studs/i.test(m.description)),
      false,
    );
    assert.ok(
      result.pendingClaims.some(
        (claim) =>
          claim.quantityKey === OPENING_QUANTITY_KEYS.jackStuds &&
          claim.claimStatus === "BLOCKED_MISSING_REQUIRED_INPUT",
      ),
    );
  });

  it("coordinator attaches claim statuses and aggregates pending claims", () => {
    const payload = coordinateFramingCalculations({
      wallFraming: buildWallFraming({ heightFeet: null }),
      openings: buildOpenings(),
    });
    assert.ok(
      payload.materials.some(
        (m) => m.claimStatus === "CALCULATED_WITH_ASSUMPTION",
      ),
    );
    assert.ok(payload.pendingClaims.length >= 1);
  });
});

describe("Material Claim Authority Ladder — status + lifecycle", () => {
  it("derives CONFIRMED vs CALCULATED_WITH_ASSUMPTION", () => {
    assert.equal(deriveMaterialClaimStatus({}), "CONFIRMED");
    assert.equal(
      deriveMaterialClaimStatus({ assumptionIds: ["A-1"] }),
      "CALCULATED_WITH_ASSUMPTION",
    );
  });

  it("marks assumption replaced / confirmed via lifecycle helper", () => {
    const active = createOpeningKingStudCountAssumption(
      "O-001" as ObjectId,
      "RI-1" as ReviewItemId,
    );
    const replaced = applyAssumptionUserDecisionLifecycle(active, {
      status: "replaced",
      userDecisionId: "UD-1" as UserDecisionId,
    });
    assert.equal(replaced.status, "replaced");
    assert.equal(replaced.userDecisionId, "UD-1");

    const confirmed = applyAssumptionUserDecisionLifecycle(active, {
      status: "confirmed",
      userDecisionId: "UD-2" as UserDecisionId,
    });
    assert.equal(confirmed.status, "confirmed");
  });

  it("createBlockedMissingInputPendingClaim refuses registered properties", () => {
    const blocked = createBlockedMissingInputPendingClaim({
      quantityKey: OPENING_QUANTITY_KEYS.kingStuds,
      objectId: "O-001" as ObjectId,
      missingPropertyPath: "kingStudCount",
      description: "should not pending",
      basis: "registry owns this",
    });
    assert.equal(blocked, null);
  });
});
