import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { calculateFramingTakeoff } from "../../src/framing/calculate/calculateFramingTakeoff.js";
import {
  buildFloorFramingJoistCountEvidence,
} from "../../src/framing/demo/floorFramingJoistCountEvidence.js";
import {
  buildHeaderEvidenceForSubject,
  buildMultiObjectFramingEvidence,
  buildOpeningEvidenceForSubject,
  buildWallEvidenceForSubject,
} from "../../src/framing/demo/multiObjectFramingEvidence.js";
import {
  buildRoofFramingCommonRafterEvidence,
} from "../../src/framing/demo/roofFramingCommonRafterEvidence.js";
import { buildFramingConstructionFromEvidence } from "../../src/framing/read/readFramingPlans.js";
import {
  assignCanonicalPhysicalIds,
  collectConstructionBagObjects,
} from "../../src/framing/resolve/assignCanonicalPhysicalIds.js";
import {
  loadBecksteadW4cCharReplayDictionary,
  loadBecksteadW4cCharReplayEvidence,
} from "../fixtures/becksteadW4cCharReplay.js";
import {
  BECKSTEAD_M5_CRAWL_JOIST_COUNT,
  BECKSTEAD_M5_CRAWL_JOIST_LF,
} from "../fixtures/becksteadM5FloorLayoutEvidence.js";

function physicalIdPopulation(
  construction: ReturnType<typeof buildFramingConstructionFromEvidence>,
) {
  return collectConstructionBagObjects(construction)
    .map((object) => ({
      id: object.id,
      objectType: object.objectType,
      physicalId: object.physicalId,
    }))
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}

describe("S3-ID-1 canonical physicalId on existing bags", () => {
  it("stamps physicalId on every resolved bag object", () => {
    const construction = buildFramingConstructionFromEvidence([
      ...buildMultiObjectFramingEvidence(),
      ...buildFloorFramingJoistCountEvidence(),
      ...buildRoofFramingCommonRafterEvidence(),
    ]);

    const objects = collectConstructionBagObjects(construction);
    assert.ok(objects.length > 0);
    assert.equal(
      objects.every((object) => object.physicalId != null && object.physicalId.length > 0),
      true,
    );

    const types = new Set(objects.map((object) => object.objectType));
    for (const objectType of [
      "building-wall",
      "wall-segment",
      "opening",
      "structural-member",
      "floor-framing-system",
      "floor-framing-area",
      "roof-framing-system",
      "roof-plane",
      "sheathing-system",
      "sheathing-area",
    ]) {
      assert.equal(types.has(objectType), true, `missing ${objectType}`);
    }
  });

  it("shares one physicalId for a linked opening header without merging rows", () => {
    const records = [
      ...buildOpeningEvidenceForSubject("O-001", "E-O001", {
        category: "window",
        nominalWidthFeet: 3,
        nominalHeightFeet: 4,
        headerMemberTag: "HDR-001",
      }),
      ...buildHeaderEvidenceForSubject("HDR-001", "E-HDR-001", {
        lengthFeet: 6,
      }),
    ];

    const construction = buildFramingConstructionFromEvidence(records);
    const opening = construction.openings.openings.find(
      (candidate) => candidate.id === "O-001",
    );
    const member = construction.structuralMembers.structuralMembers.find(
      (candidate) => candidate.id === "SM-HDR-001",
    );

    assert.ok(opening);
    assert.ok(member);
    assert.equal(opening.headerMemberId, "SM-HDR-001");
    assert.equal(opening.id, "O-001");
    assert.equal(member.id, "SM-HDR-001");
    assert.notEqual(opening.id, member.id);
    assert.equal(opening.physicalId, member.physicalId);
    assert.equal(member.physicalId, "SM-HDR-001");
    assert.equal(construction.openings.openings.length, 1);
    assert.equal(construction.structuralMembers.structuralMembers.length, 1);
  });

  it("keeps two distinct wall/plate objects as two physicalIds", () => {
    const construction = buildFramingConstructionFromEvidence([
      ...buildWallEvidenceForSubject("W-001", "E-W001"),
      ...buildWallEvidenceForSubject("W-002", "E-W002"),
    ]);

    assert.equal(construction.walls.walls.length, 2);
    const [first, second] = construction.walls.walls;
    assert.ok(first);
    assert.ok(second);
    assert.notEqual(first.id, second.id);
    assert.notEqual(first.physicalId, second.physicalId);
    assert.equal(first.physicalId, first.id);
    assert.equal(second.physicalId, second.id);
  });

  it("is idempotent for the same Evidence", () => {
    const records = [
      ...buildMultiObjectFramingEvidence(),
      ...buildFloorFramingJoistCountEvidence(),
      ...buildRoofFramingCommonRafterEvidence(),
    ];

    const first = buildFramingConstructionFromEvidence(records);
    const second = buildFramingConstructionFromEvidence(records);
    const restamped = assignCanonicalPhysicalIds(first);

    assert.deepEqual(physicalIdPopulation(first), physicalIdPopulation(second));
    assert.deepEqual(physicalIdPopulation(first), physicalIdPopulation(restamped));
    assert.equal(
      collectConstructionBagObjects(first).length,
      collectConstructionBagObjects(second).length,
    );
  });

  it("does not change W4-C 31/527 or takeoff line counts", () => {
    const evidence = loadBecksteadW4cCharReplayEvidence();
    const dictionary = loadBecksteadW4cCharReplayDictionary();
    const construction = buildFramingConstructionFromEvidence(evidence, {
      projectDictionary: dictionary,
    });
    const calculated = calculateFramingTakeoff(construction);

    const joists = calculated.materials.find(
      (line) => line.quantityKey === "floor.joists",
    );
    const lf = calculated.materials.find(
      (line) => line.quantityKey === "floor.joist-linear-feet",
    );
    assert.equal(joists?.quantity, BECKSTEAD_M5_CRAWL_JOIST_COUNT);
    assert.equal(lf?.quantity, BECKSTEAD_M5_CRAWL_JOIST_LF);
    assert.equal(calculated.materials.length, 55);

    const objects = collectConstructionBagObjects(construction);
    assert.equal(
      objects.every((object) => object.physicalId != null),
      true,
    );
  });
});
