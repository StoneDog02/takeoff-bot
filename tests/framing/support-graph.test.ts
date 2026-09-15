import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { calculateFramingTakeoff } from "../../src/framing/calculate/calculateFramingTakeoff.js";
import {
  buildHeaderEvidenceForSubject,
  buildMultiObjectFramingEvidence,
  buildOpeningEvidenceForSubject,
  buildWallEvidenceForSubject,
} from "../../src/framing/demo/multiObjectFramingEvidence.js";
import { buildFloorFramingJoistCountEvidence } from "../../src/framing/demo/floorFramingJoistCountEvidence.js";
import { buildRoofFramingCommonRafterEvidence } from "../../src/framing/demo/roofFramingCommonRafterEvidence.js";
import { buildFramingConstructionFromEvidence } from "../../src/framing/read/readFramingPlans.js";
import {
  buildSupportGraph,
  supportGraphsEqual,
} from "../../src/framing/resolve/buildSupportGraph.js";
import {
  loadBecksteadW4cCharReplayDictionary,
  loadBecksteadW4cCharReplayEvidence,
} from "../fixtures/becksteadW4cCharReplay.js";
import {
  BECKSTEAD_M5_CRAWL_JOIST_COUNT,
  BECKSTEAD_M5_CRAWL_JOIST_LF,
} from "../fixtures/becksteadM5FloorLayoutEvidence.js";

describe("S3-SG-1 SupportGraph on FramingConstruction", () => {
  it("AC1: linked-header edge fixture — established opening↔header link projects into SupportGraph", () => {
    const records = [
      ...buildOpeningEvidenceForSubject("O-001", "E-O001", {
        category: "window",
        nominalWidthFeet: 3,
        nominalHeightFeet: 4,
        headerMemberTag: "HDR-001",
      }),
      ...buildHeaderEvidenceForSubject("HDR-001", "E-HDR-001", {
        lengthFeet: 6,
        supportedOpeningTag: "O-001",
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
    assert.ok(
      member.supportedObjectIds.includes("O-001"),
      "member.supportedObjectIds must include the opening",
    );

    assert.ok(construction.supportGraph);
    assert.equal(construction.supportGraph.edges.length, 1);

    const edge = construction.supportGraph.edges[0];
    assert.ok(edge);
    assert.equal(
      edge.supportedPhysicalId,
      opening.id,
      "supportedPhysicalId = opening.id (occurrence ObjectId, not shared physicalId)",
    );
    assert.equal(edge.conditionKind, "opening-header");
    assert.equal(
      edge.supportingPhysicalId,
      member.physicalId,
      "supportingPhysicalId = header member physicalId",
    );
    assert.notEqual(
      edge.supportedPhysicalId,
      edge.supportingPhysicalId,
      "No self-loop: supported !== supporting",
    );
  });

  it("AC2: no-invented-edge fixture — no joist/beam/post/hanger/panel/connection edges invented", () => {
    const records = [
      ...buildMultiObjectFramingEvidence(),
      ...buildFloorFramingJoistCountEvidence(),
      ...buildRoofFramingCommonRafterEvidence(),
    ];

    const construction = buildFramingConstructionFromEvidence(records);

    assert.ok(construction.supportGraph);

    for (const edge of construction.supportGraph.edges) {
      assert.equal(
        edge.conditionKind,
        "opening-header",
        `Unexpected edge condition kind: ${edge.conditionKind}`,
      );
    }

    assert.ok(construction.floorFraming.systems.length > 0);
    assert.ok(construction.roofFraming.planes.length > 0);

    const joistEdges = construction.supportGraph.edges.filter(
      (edge) =>
        edge.supportedPhysicalId.includes("joist") ||
        edge.supportingPhysicalId.includes("joist") ||
        edge.supportedPhysicalId.includes("FFS") ||
        edge.supportingPhysicalId.includes("FFS"),
    );
    assert.equal(joistEdges.length, 0, "No joist edges should be invented");

    const beamEdges = construction.supportGraph.edges.filter(
      (edge) =>
        (edge.supportedPhysicalId.includes("beam") ||
          edge.supportingPhysicalId.includes("beam")) &&
        edge.conditionKind !== "opening-header",
    );
    assert.equal(beamEdges.length, 0, "No beam edges should be invented");

    const postEdges = construction.supportGraph.edges.filter(
      (edge) =>
        (edge.supportedPhysicalId.includes("post") ||
          edge.supportingPhysicalId.includes("post")) &&
        edge.conditionKind !== "opening-header",
    );
    assert.equal(postEdges.length, 0, "No post edges should be invented");

    const hangerEdges = construction.supportGraph.edges.filter(
      (edge) =>
        edge.supportedPhysicalId.includes("hanger") ||
        edge.supportingPhysicalId.includes("hanger"),
    );
    assert.equal(hangerEdges.length, 0, "No hanger edges should be invented");

    const panelEdges = construction.supportGraph.edges.filter(
      (edge) =>
        edge.supportedPhysicalId.includes("panel") ||
        edge.supportingPhysicalId.includes("panel") ||
        edge.supportedPhysicalId.includes("sheath") ||
        edge.supportingPhysicalId.includes("sheath"),
    );
    assert.equal(panelEdges.length, 0, "No panel edges should be invented");

    const connectionEdges = construction.supportGraph.edges.filter(
      (edge) =>
        edge.supportedPhysicalId.includes("connection") ||
        edge.supportingPhysicalId.includes("connection"),
    );
    assert.equal(connectionEdges.length, 0, "No connection edges should be invented");
  });

  it("AC3: two-plates-stay-two fixture — distinct wall segments (plate carriers) remain distinct (no universal merge)", () => {
    const construction = buildFramingConstructionFromEvidence([
      ...buildWallEvidenceForSubject("W-001", "E-W001"),
      ...buildWallEvidenceForSubject("W-002", "E-W002"),
    ]);

    assert.equal(construction.walls.segments.length, 2, "Two wall segments (plate carriers)");
    const [firstSegment, secondSegment] = construction.walls.segments;
    assert.ok(firstSegment);
    assert.ok(secondSegment);
    assert.notEqual(firstSegment.id, secondSegment.id);
    assert.notEqual(firstSegment.physicalId, secondSegment.physicalId);
    assert.equal(firstSegment.physicalId, firstSegment.id);
    assert.equal(secondSegment.physicalId, secondSegment.id);

    const segmentPhysicalIds = new Set([firstSegment.physicalId, secondSegment.physicalId]);
    assert.equal(
      segmentPhysicalIds.size,
      2,
      "Two wall segments (plate carriers) should have two distinct physicalIds",
    );

    assert.equal(construction.walls.walls.length, 2, "Two walls");
    const [firstWall, secondWall] = construction.walls.walls;
    assert.ok(firstWall);
    assert.ok(secondWall);
    assert.notEqual(firstWall.physicalId, secondWall.physicalId);
    assert.ok(
      firstWall.assembly.plateCount != null || secondWall.assembly.plateCount != null,
      "At least one wall has plate count (plate data)",
    );
  });

  it("AC4: idempotent projection — running buildSupportGraph twice yields the same edges", () => {
    const records = [
      ...buildOpeningEvidenceForSubject("O-001", "E-O001", {
        category: "window",
        nominalWidthFeet: 3,
        nominalHeightFeet: 4,
        headerMemberTag: "HDR-001",
      }),
      ...buildHeaderEvidenceForSubject("HDR-001", "E-HDR-001", {
        lengthFeet: 6,
        supportedOpeningTag: "O-001",
      }),
      ...buildOpeningEvidenceForSubject("O-002", "E-O002", {
        category: "door",
        nominalWidthFeet: 3,
        nominalHeightFeet: 7,
        headerMemberTag: "HDR-002",
      }),
      ...buildHeaderEvidenceForSubject("HDR-002", "E-HDR-002", {
        lengthFeet: 4,
        supportedOpeningTag: "O-002",
      }),
    ];

    const construction = buildFramingConstructionFromEvidence(records);
    const graphFirst = construction.supportGraph;

    const graphSecond = buildSupportGraph(
      construction.openings.openings,
      construction.structuralMembers.structuralMembers,
    );

    assert.ok(supportGraphsEqual(graphFirst, graphSecond));

    const constructionAgain = buildFramingConstructionFromEvidence(records);
    assert.ok(supportGraphsEqual(graphFirst, constructionAgain.supportGraph));
  });

  it("AC7: W4-C frozen replay still 31 joists / 527 LF; no new edges invented", () => {
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
    assert.equal(joists?.quantity, BECKSTEAD_M5_CRAWL_JOIST_COUNT, "Joist count should be 31");
    assert.equal(lf?.quantity, BECKSTEAD_M5_CRAWL_JOIST_LF, "Joist LF should be 527");

    assert.ok(construction.supportGraph);
    for (const edge of construction.supportGraph.edges) {
      assert.equal(
        edge.conditionKind,
        "opening-header",
        `Only opening-header edges should exist, found: ${edge.conditionKind}`,
      );
    }

    const joistEdges = construction.supportGraph.edges.filter(
      (edge) =>
        edge.supportedPhysicalId.includes("joist") ||
        edge.supportingPhysicalId.includes("joist"),
    );
    assert.equal(joistEdges.length, 0, "W4-C should have no invented joist edges");

    const beamEdges = construction.supportGraph.edges.filter(
      (edge) =>
        (edge.supportedPhysicalId.includes("beam") ||
          edge.supportedPhysicalId.includes("WB")) &&
        edge.conditionKind !== "opening-header",
    );
    assert.equal(beamEdges.length, 0, "W4-C should have no invented beam edges");

    const postEdges = construction.supportGraph.edges.filter(
      (edge) =>
        edge.supportedPhysicalId.includes("POST") ||
        edge.supportingPhysicalId.includes("POST"),
    );
    assert.equal(postEdges.length, 0, "W4-C should have no invented post edges");
  });

  it("missing header design stays null headerMemberId, no invented edge", () => {
    const records = [
      ...buildOpeningEvidenceForSubject("O-UNLINKED", "E-UNLINKED", {
        category: "window",
        nominalWidthFeet: 3,
        nominalHeightFeet: 4,
      }),
    ];

    const construction = buildFramingConstructionFromEvidence(records);

    const opening = construction.openings.openings.find(
      (candidate) => candidate.id === "O-UNLINKED",
    );
    assert.ok(opening);
    assert.equal(opening.headerMemberId, null);

    assert.equal(construction.supportGraph.edges.length, 0);
  });

  it("empty construction has empty supportGraph", () => {
    const construction = buildFramingConstructionFromEvidence([]);

    assert.ok(construction.supportGraph);
    assert.deepEqual(construction.supportGraph.edges, []);
  });

  it("edge requires BOTH headerMemberId AND supportedObjectIds established by linker", () => {
    const records = [
      ...buildOpeningEvidenceForSubject("O-LINKED", "E-LINKED", {
        category: "window",
        nominalWidthFeet: 3,
        nominalHeightFeet: 4,
        headerMemberTag: "HDR-LINKED",
      }),
      ...buildHeaderEvidenceForSubject("HDR-LINKED", "E-HDR-LINKED", {
        lengthFeet: 6,
      }),
    ];

    const construction = buildFramingConstructionFromEvidence(records);
    const opening = construction.openings.openings.find(
      (o) => o.id === "O-LINKED",
    );
    const member = construction.structuralMembers.structuralMembers.find(
      (m) => m.id === "SM-HDR-LINKED",
    );
    assert.ok(opening);
    assert.ok(member);

    assert.equal(
      opening.headerMemberId,
      "SM-HDR-LINKED",
      "Linker sets opening.headerMemberId",
    );
    assert.ok(
      member.supportedObjectIds.includes("O-LINKED"),
      "Linker backlinks: member.supportedObjectIds includes the opening",
    );

    assert.equal(
      construction.supportGraph.edges.length,
      1,
      "Edge emitted when both sides are linked by the linker",
    );

    const edge = construction.supportGraph.edges[0];
    assert.ok(edge);
    assert.equal(edge.supportedPhysicalId, opening.id);
    assert.equal(edge.supportingPhysicalId, member.physicalId);
    assert.notEqual(edge.supportedPhysicalId, edge.supportingPhysicalId);
  });

  it("self-loop prevented: supportedPhysicalId !== supportingPhysicalId", () => {
    const records = [
      ...buildOpeningEvidenceForSubject("O-SL", "E-OSL", {
        category: "window",
        nominalWidthFeet: 3,
        nominalHeightFeet: 4,
        headerMemberTag: "HDR-SL",
      }),
      ...buildHeaderEvidenceForSubject("HDR-SL", "E-HDR-SL", {
        lengthFeet: 6,
        supportedOpeningTag: "O-SL",
      }),
    ];

    const construction = buildFramingConstructionFromEvidence(records);

    const opening = construction.openings.openings.find((o) => o.id === "O-SL");
    const member = construction.structuralMembers.structuralMembers.find(
      (m) => m.id === "SM-HDR-SL",
    );
    assert.ok(opening);
    assert.ok(member);

    assert.equal(
      opening.physicalId,
      member.physicalId,
      "S3-ID-1: linked opening shares physicalId with header for purchase-once",
    );

    for (const edge of construction.supportGraph.edges) {
      assert.notEqual(
        edge.supportedPhysicalId,
        edge.supportingPhysicalId,
        "Self-loop prevented: supported !== supporting",
      );
    }

    if (construction.supportGraph.edges.length > 0) {
      const edge = construction.supportGraph.edges[0];
      assert.ok(edge);
      assert.equal(
        edge.supportedPhysicalId,
        opening.id,
        "supportedPhysicalId = opening.id (ObjectId), not physicalId",
      );
      assert.equal(
        edge.supportingPhysicalId,
        member.physicalId,
        "supportingPhysicalId = member.physicalId",
      );
    }
  });
});
