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
        confidenceEvaluationId: "CE-001",
        summary: {
          wallCount: 1,
          wallSegmentCount: 1,
          openingCount: 0,
          structuralMemberCount: 0,
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
  });
});
