import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ObjectId } from "../../../src/core/schemas/identity.schema.js";
import {
  admitMaterialClaimCandidate,
  quantityKeyAffectsAdmittedEmitClaim,
} from "../../../src/scopes/framing/claims/admitMaterialClaimCandidate.js";
import { buildClaimCandidacyContext } from "../../../src/scopes/framing/claims/buildClaimCandidacyContext.js";
import {
  getClaimCriticalInputContract,
  getMaterialClaimRole,
  isEmitCapableQuantityKey,
  isReviewOnlyPropertyForQuantity,
} from "../../../src/scopes/framing/claims/claimContracts.js";
import {
  collectPendingClaims,
  type PendingClaimSuppression,
} from "../../../src/scopes/framing/claims/collectPendingClaims.js";
import { isOpeningCategoryEligibleForQuantityKey } from "../../../src/scopes/framing/claims/openingClaimApplicability.js";
import type { FramingMaterialLineItem } from "../../../src/scopes/framing/schemas/material.schema.js";
import type { ValidationPayload } from "../../../src/scopes/framing/schemas/framing-artifacts.schema.js";
import {
  FLOOR_QUANTITY_KEYS,
  OPENING_QUANTITY_KEYS,
  ROOF_QUANTITY_KEYS,
  SHEATHING_QUANTITY_KEYS,
  STRUCTURAL_MEMBER_QUANTITY_KEYS,
  WALL_QUANTITY_KEYS,
} from "../../../src/scopes/framing/validators/rule-ids.js";

function issue(input: {
  id: string;
  objectId: string;
  objectType: string;
  impacts: Array<{ quantityKey: string; canCalculate: boolean; description?: string }>;
}): ValidationPayload["validationIssues"][number] {
  return {
    id: input.id as ValidationPayload["validationIssues"][number]["id"],
    severity: "critical",
    level: "object",
    ruleId: "test.rule",
    ruleViolated: "test",
    explanation: "test",
    recommendedUserAction: null,
    target: {
      kind: "object",
      objectId: input.objectId as ObjectId,
      objectType: input.objectType,
    },
    sourceLocations: [],
    evidenceIds: [],
    quantityImpacts: input.impacts.map((impact) => ({
      quantityKey: impact.quantityKey,
      description: impact.description ?? `${impact.quantityKey} impact`,
      canCalculate: impact.canCalculate,
    })),
    reviewItemIds: [],
  };
}

describe("M2 Material Claim Candidacy Admission", () => {
  it("contracts mark emit owners and non-emit roles", () => {
    const studs = getClaimCriticalInputContract(WALL_QUANTITY_KEYS.studs)!;
    assert.equal(studs.claimRole, "emit");
    assert.deepEqual(studs.quantityOwnerObjectTypes, ["wall-segment"]);
    assert.ok(studs.assemblyContributorObjectTypes.includes("building-wall"));

    assert.equal(getMaterialClaimRole(OPENING_QUANTITY_KEYS.framing), "aggregate_gate");
    assert.equal(getMaterialClaimRole(OPENING_QUANTITY_KEYS.header), "unsupported_capability");
    assert.equal(getMaterialClaimRole(WALL_QUANTITY_KEYS.sheathing), "unsupported_capability");
    assert.equal(getMaterialClaimRole(STRUCTURAL_MEMBER_QUANTITY_KEYS.length), "companion_input");
    assert.equal(getMaterialClaimRole(SHEATHING_QUANTITY_KEYS.material), "companion_input");
    assert.equal(isEmitCapableQuantityKey(OPENING_QUANTITY_KEYS.kingStuds), true);
    assert.equal(isEmitCapableQuantityKey(OPENING_QUANTITY_KEYS.framing), false);
    assert.equal(
      isReviewOnlyPropertyForQuantity(WALL_QUANTITY_KEYS.studs, "assembly.heightFeet"),
      true,
    );
  });

  it("suppresses non-emit keys with deterministic reasons", () => {
    for (const key of [
      OPENING_QUANTITY_KEYS.framing,
      OPENING_QUANTITY_KEYS.header,
      WALL_QUANTITY_KEYS.sheathing,
      STRUCTURAL_MEMBER_QUANTITY_KEYS.length,
      SHEATHING_QUANTITY_KEYS.material,
    ]) {
      const decision = admitMaterialClaimCandidate({
        quantityKey: key,
        objectId: "O-1" as ObjectId,
        objectType: "opening",
      });
      assert.equal(decision.admitted, false);
      if (!decision.admitted) {
        assert.equal(decision.reason, "non_emit_key");
      }
    }
  });

  it("suppresses wrong owner types and fans assembly contributors to children", () => {
    const wrong = admitMaterialClaimCandidate({
      quantityKey: FLOOR_QUANTITY_KEYS.joists,
      objectId: "FFS-1" as ObjectId,
      objectType: "floor-framing-system",
      context: { areaIdsByFloorSystemId: new Map() },
    });
    assert.equal(wrong.admitted, false);
    if (!wrong.admitted) {
      assert.equal(wrong.reason, "no_canonical_owners");
    }

    const fanout = admitMaterialClaimCandidate({
      quantityKey: FLOOR_QUANTITY_KEYS.joists,
      objectId: "FFS-1" as ObjectId,
      objectType: "floor-framing-system",
      context: {
        areaIdsByFloorSystemId: new Map([
          ["FFS-1", ["FFA-1" as ObjectId, "FFA-2" as ObjectId]],
        ]),
      },
    });
    assert.equal(fanout.admitted, true);
    if (fanout.admitted) {
      assert.deepEqual(fanout.ownerObjectIds, ["FFA-1", "FFA-2"]);
      assert.equal(fanout.ownerObjectType, "floor-framing-area");
    }

    const roofWrong = admitMaterialClaimCandidate({
      quantityKey: ROOF_QUANTITY_KEYS.commonRafters,
      objectId: "RFS-1" as ObjectId,
      objectType: "roof-framing-system",
      context: { planeIdsByRoofSystemId: new Map([["RFS-1", []]]) },
    });
    assert.equal(roofWrong.admitted, false);
  });

  it("suppresses inapplicable opening categories", () => {
    assert.equal(
      isOpeningCategoryEligibleForQuantityKey(OPENING_QUANTITY_KEYS.roughSill, "door"),
      false,
    );
    assert.equal(
      isOpeningCategoryEligibleForQuantityKey(OPENING_QUANTITY_KEYS.roughSill, "window"),
      true,
    );
    assert.equal(
      isOpeningCategoryEligibleForQuantityKey(OPENING_QUANTITY_KEYS.kingStuds, "garage-door"),
      false,
    );

    const doorSill = admitMaterialClaimCandidate({
      quantityKey: OPENING_QUANTITY_KEYS.roughSill,
      objectId: "O-DOOR" as ObjectId,
      objectType: "opening",
      context: {
        openingCategoryById: new Map([["O-DOOR", "door"]]),
      },
    });
    assert.equal(doorSill.admitted, false);
    if (!doorSill.admitted) {
      assert.equal(doorSill.reason, "inapplicable_category");
    }

    const windowSill = admitMaterialClaimCandidate({
      quantityKey: OPENING_QUANTITY_KEYS.roughSill,
      objectId: "O-WIN" as ObjectId,
      objectType: "opening",
      context: {
        openingCategoryById: new Map([["O-WIN", "window"]]),
      },
    });
    assert.equal(windowSill.admitted, true);
  });

  it("collectPendingClaims admits eligible blocked emit claims and suppresses noise", () => {
    const suppressions: PendingClaimSuppression[] = [];
    const validation: ValidationPayload = {
      validationResults: [],
      validationIssues: [
        issue({
          id: "VI-1",
          objectId: "O-DOOR",
          objectType: "opening",
          impacts: [
            { quantityKey: OPENING_QUANTITY_KEYS.framing, canCalculate: false },
            { quantityKey: OPENING_QUANTITY_KEYS.header, canCalculate: false },
            { quantityKey: OPENING_QUANTITY_KEYS.roughSill, canCalculate: false },
            { quantityKey: OPENING_QUANTITY_KEYS.kingStuds, canCalculate: false },
          ],
        }),
        issue({
          id: "VI-2",
          objectId: "O-WIN",
          objectType: "opening",
          impacts: [
            { quantityKey: OPENING_QUANTITY_KEYS.roughSill, canCalculate: false },
            { quantityKey: OPENING_QUANTITY_KEYS.kingStuds, canCalculate: false },
          ],
        }),
        issue({
          id: "VI-3",
          objectId: "W-1",
          objectType: "building-wall",
          impacts: [
            { quantityKey: WALL_QUANTITY_KEYS.studs, canCalculate: false },
            { quantityKey: WALL_QUANTITY_KEYS.sheathing, canCalculate: false },
          ],
        }),
        issue({
          id: "VI-4",
          objectId: "WS-1",
          objectType: "wall-segment",
          impacts: [{ quantityKey: WALL_QUANTITY_KEYS.plates, canCalculate: false }],
        }),
        issue({
          id: "VI-5",
          objectId: "FFS-1",
          objectType: "floor-framing-system",
          impacts: [{ quantityKey: FLOOR_QUANTITY_KEYS.joists, canCalculate: false }],
        }),
        issue({
          id: "VI-6",
          objectId: "SM-1",
          objectType: "structural-member",
          impacts: [
            { quantityKey: STRUCTURAL_MEMBER_QUANTITY_KEYS.material, canCalculate: false },
            { quantityKey: STRUCTURAL_MEMBER_QUANTITY_KEYS.length, canCalculate: false },
          ],
        }),
      ],
      reviewItems: [],
    };

    const pending = collectPendingClaims({
      validation,
      materials: [],
      candidacyContext: {
        openingCategoryById: new Map([
          ["O-DOOR", "door"],
          ["O-WIN", "window"],
        ]),
        segmentIdsByWallId: new Map([["W-1", ["WS-CHILD" as ObjectId]]]),
        areaIdsByFloorSystemId: new Map([["FFS-1", ["FFA-1" as ObjectId]]]),
      },
      suppressionsOut: suppressions,
    });

    const keysByOwner = pending
      .filter((p) => p.claimStatus !== "UNSUPPORTED_CAPABILITY")
      .map((p) => `${p.quantityKey}@${p.sourceObjectIds[0]}`)
      .sort();

    assert.deepEqual(keysByOwner, [
      `${FLOOR_QUANTITY_KEYS.joists}@FFA-1`,
      `${STRUCTURAL_MEMBER_QUANTITY_KEYS.material}@SM-1`,
      `${OPENING_QUANTITY_KEYS.kingStuds}@O-DOOR`,
      `${OPENING_QUANTITY_KEYS.kingStuds}@O-WIN`,
      `${OPENING_QUANTITY_KEYS.roughSill}@O-WIN`,
      `${WALL_QUANTITY_KEYS.plates}@WS-1`,
      `${WALL_QUANTITY_KEYS.studs}@WS-CHILD`,
    ]);

    assert.ok(
      suppressions.some(
        (s) =>
          s.quantityKey === OPENING_QUANTITY_KEYS.framing &&
          s.reason === "non_emit_key",
      ),
    );
    assert.ok(
      suppressions.some(
        (s) =>
          s.quantityKey === OPENING_QUANTITY_KEYS.roughSill &&
          s.objectId === "O-DOOR" &&
          s.reason === "inapplicable_category",
      ),
    );
    assert.ok(
      suppressions.some(
        (s) =>
          s.quantityKey === WALL_QUANTITY_KEYS.sheathing &&
          s.reason === "non_emit_key",
      ),
    );
    assert.ok(
      suppressions.some(
        (s) =>
          s.quantityKey === STRUCTURAL_MEMBER_QUANTITY_KEYS.length &&
          s.reason === "non_emit_key",
      ),
    );

    // Package-level unsupported markers preserved.
    assert.equal(
      pending.filter((p) => p.claimStatus === "UNSUPPORTED_CAPABILITY").length,
      4,
    );
  });

  it("does not mint pending when material already covers the claim", () => {
    const materials: FramingMaterialLineItem[] = [
      {
        id: "MAT-wall-studs-object-WS-1",
        quantityKey: WALL_QUANTITY_KEYS.studs,
        claimStatus: "CONFIRMED",
        category: "lumber",
        description: "studs",
        canonicalClassification: "stud",
        quantity: 10,
        unit: "each",
        sourceObjectIds: ["WS-1" as ObjectId],
        assumptionIds: [],
        reviewItemIds: [],
      },
    ];
    const pending = collectPendingClaims({
      validation: {
        validationResults: [],
        validationIssues: [
          issue({
            id: "VI-ws",
            objectId: "WS-1",
            objectType: "wall-segment",
            impacts: [{ quantityKey: WALL_QUANTITY_KEYS.studs, canCalculate: false }],
          }),
        ],
        reviewItems: [],
      },
      materials,
      candidacyContext: buildClaimCandidacyContext({}),
    });
    assert.equal(
      pending.some((p) => p.quantityKey === WALL_QUANTITY_KEYS.studs),
      false,
    );
  });

  it("quantityKeyAffectsAdmittedEmitClaim is true only for emit keys", () => {
    assert.equal(quantityKeyAffectsAdmittedEmitClaim(WALL_QUANTITY_KEYS.studs), true);
    assert.equal(quantityKeyAffectsAdmittedEmitClaim(OPENING_QUANTITY_KEYS.framing), false);
    assert.equal(quantityKeyAffectsAdmittedEmitClaim(null), false);
  });
});
