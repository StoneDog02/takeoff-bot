import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  floorFramingAreaSchema,
  floorFramingSystemSchema,
} from "../../src/scopes/framing/schemas/floor-framing.schema.js";
import { finalFramingTakeoffArtifactSchema } from "../../src/scopes/framing/schemas/framing-artifacts.schema.js";
import { buildingWallSchema } from "../../src/scopes/framing/schemas/wall.schema.js";

const complete = {
  status: "complete",
  percentage: 100,
  completedItems: 1,
  totalItems: 1,
} as const;

describe("framing domain contracts", () => {
  it("accepts a resolved wall without embedding related objects", () => {
    const wall = buildingWallSchema.parse({
      id: "W-001",
      objectType: "building-wall",
      completion: complete,
      reviewStatus: "no-review-required",
      blockingStatus: "not-blocked",
      name: "Demo exterior wall",
      level: "Level 1",
      wallType: "wood-stud-exterior",
      location: "exterior",
      bearingStatus: "non-bearing",
      isShearOrBraced: false,
      constructionPhase: "new",
      assembly: {
        material: "dimensional-lumber",
        studSize: "2x4",
        studSpacingInches: 16,
        heightFeet: 8,
        plateCount: 3,
      },
      segmentIds: ["WS-001"],
    });

    assert.deepEqual(wall.segmentIds, ["WS-001"]);
  });

  it("accepts a floor framing system that references areas by ID only", () => {
    const system = floorFramingSystemSchema.parse({
      id: "FFS-001",
      objectType: "floor-framing-system",
      completion: complete,
      reviewStatus: "no-review-required",
      blockingStatus: "not-blocked",
      name: "Level 2 floor framing",
      level: "Level 2",
      constructionPhase: "new",
      assembly: {
        joistType: "i-joist",
        joistSize: "11-7/8",
        joistSpacingInches: 16,
        rimBoard: "1-1/8 rim board",
      },
      areaIds: ["FFA-001"],
    });

    assert.deepEqual(system.areaIds, ["FFA-001"]);
    assert.equal("areas" in system, false);
  });

  it("accepts a floor framing area with unresolved layout and ID-only relationships", () => {
    const area = floorFramingAreaSchema.parse({
      id: "FFA-001",
      objectType: "floor-framing-area",
      completion: {
        status: "partial",
        percentage: 50,
        completedItems: 1,
        totalItems: 2,
      },
      reviewStatus: "review-required",
      blockingStatus: "not-blocked",
      parentSystemId: "FFS-001",
      boundingWallIds: ["W-001"],
      openingIds: ["O-014"],
      structuralMemberIds: ["SM-008"],
    });

    assert.equal(area.parentSystemId, "FFS-001");
    assert.equal(area.spanDirection, null);
    assert.equal(area.framingDirection, null);
    assert.equal(area.layout, null);
    assert.equal(area.areaSquareFeet, null);
    assert.deepEqual(area.structuralMemberIds, ["SM-008"]);
  });

  it("rejects a floor framing area without a parent system", () => {
    const result = floorFramingAreaSchema.safeParse({
      id: "FFA-002",
      objectType: "floor-framing-area",
      completion: complete,
      reviewStatus: "no-review-required",
      blockingStatus: "not-blocked",
    });

    assert.equal(result.success, false);
  });

  it("accepts a typed final framing artifact", () => {
    const timestamp = "2026-07-10T12:00:00.000Z";
    const artifact = finalFramingTakeoffArtifactSchema.parse({
      artifactId: "ART-010",
      artifactType: "final-framing-takeoff",
      schemaVersion: "1.0.0",
      artifactVersion: 1,
      engineVersion: "0.1.0",
      pipelineRunId: "RUN-001",
      projectId: "demo-project",
      createdAt: timestamp,
      lastModifiedAt: timestamp,
      producer: { type: "system", identifier: "framing-pipeline" },
      inputArtifactIds: ["ART-009"],
      parentArtifactIds: [],
      payload: {
        projectId: "demo-project",
        scopeName: "framing",
        executionMode: "mock",
        status: "completed",
        wallIds: ["W-001"],
        wallSegmentIds: ["WS-001"],
        openingIds: ["O-014"],
        structuralMemberIds: ["SM-008"],
        floorFramingSystemIds: ["FFS-001"],
        floorFramingAreaIds: ["FFA-001"],
        roofFramingSystemIds: ["RFS-001"],
        roofPlaneIds: ["RP-001"],
        sheathingSystemIds: ["SHS-001"],
        sheathingAreaIds: ["SHA-001"],
        blockingIds: ["BLK-001"],
        connectorIds: ["CN-001"],
        hardwareIds: ["HW-001"],
        fastenerIds: ["FS-001"],
        confidenceEvaluationId: "CE-001",
        summary: {
          wallCount: 1,
          wallSegmentCount: 1,
          openingCount: 1,
          structuralMemberCount: 1,
          floorFramingSystemCount: 1,
          floorFramingAreaCount: 1,
          roofFramingSystemCount: 1,
          roofPlaneCount: 1,
          sheathingSystemCount: 1,
          sheathingAreaCount: 1,
          blockingCount: 1,
          connectorCount: 1,
          hardwareCount: 1,
          fastenerCount: 1,
          materialLineItemCount: 1,
          reviewItemCount: 0,
          validationIssueCount: 0,
          completion: complete,
          confidenceLabel: "high",
          reviewStatus: "no-review-required",
          blockingStatus: "not-blocked",
        },
      },
    });

    assert.equal(artifact.artifactType, "final-framing-takeoff");
    assert.deepEqual(artifact.payload.floorFramingSystemIds, ["FFS-001"]);
    assert.deepEqual(artifact.payload.floorFramingAreaIds, ["FFA-001"]);
    assert.deepEqual(artifact.payload.roofFramingSystemIds, ["RFS-001"]);
    assert.deepEqual(artifact.payload.roofPlaneIds, ["RP-001"]);
    assert.deepEqual(artifact.payload.sheathingSystemIds, ["SHS-001"]);
    assert.deepEqual(artifact.payload.sheathingAreaIds, ["SHA-001"]);
    assert.deepEqual(artifact.payload.blockingIds, ["BLK-001"]);
    assert.deepEqual(artifact.payload.connectorIds, ["CN-001"]);
    assert.deepEqual(artifact.payload.hardwareIds, ["HW-001"]);
    assert.deepEqual(artifact.payload.fastenerIds, ["FS-001"]);
    assert.equal(artifact.payload.summary.floorFramingSystemCount, 1);
    assert.equal(artifact.payload.summary.roofPlaneCount, 1);
    assert.equal(artifact.payload.summary.sheathingAreaCount, 1);
    assert.equal(artifact.payload.summary.blockingCount, 1);
    assert.equal(artifact.payload.summary.connectorCount, 1);
    assert.equal(artifact.payload.summary.hardwareCount, 1);
    assert.equal(artifact.payload.summary.fastenerCount, 1);
    assert.equal("floorFramingSystems" in artifact.payload, false);
    assert.equal("connectors" in artifact.payload, false);
  });
});
