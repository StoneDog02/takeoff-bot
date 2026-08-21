import { readFile } from "node:fs/promises";

import type { PipelineRunResult } from "../core/pipeline/types.js";
import type { ReviewItem } from "../core/schemas/review-item.schema.js";
import type { ReviewItemId } from "../core/schemas/identity.schema.js";
import type { UserDecision } from "../core/schemas/user-decision.schema.js";
import type { ReviewWorkspacePayload } from "../core/schemas/review-workspace.schema.js";
import { projectFramingReviewWorkspace } from "../scopes/framing/review-workspace/projectFramingReviewWorkspace.js";
import {
  finalFramingTakeoffArtifactSchema,
  floorFramingArtifactSchema,
  framingCalculationsArtifactSchema,
  openingsArtifactSchema,
  roofFramingArtifactSchema,
  sheathingArtifactSchema,
  structuralMembersArtifactSchema,
  validationArtifactSchema,
  wallFramingArtifactSchema,
  type FramingCalculationsPayload,
} from "../scopes/framing/schemas/framing-artifacts.schema.js";
import type { FramingTakeoff } from "../scopes/framing/schemas/framing-takeoff.schema.js";
import type { FramingMaterialLineItem } from "../scopes/framing/schemas/material.schema.js";

export type FramingMaterialComparison = {
  materialLineId: string;
  description: string;
  unit: string | null;
  run1Quantity: number | null;
  run2Quantity: number | null;
};

export type LoadedFramingRunState = {
  pipelineRunId: string;
  takeoff: FramingTakeoff;
  reviewWorkspace: ReviewWorkspacePayload;
  calculations: FramingCalculationsPayload;
};

function stageByName(result: PipelineRunResult, name: string) {
  const stage = result.stageResults.find((entry) => entry.name === name);
  if (!stage) {
    throw new Error(`Expected pipeline stage '${name}'.`);
  }
  return stage;
}

export async function loadFramingRunState(
  result: PipelineRunResult,
  options: {
    userDecisions?: readonly UserDecision[];
    supplementalReviewItemsById?: ReadonlyMap<ReviewItemId, ReviewItem>;
  } = {},
): Promise<LoadedFramingRunState> {
  const reportArtifact = finalFramingTakeoffArtifactSchema.parse(
    JSON.parse(await readFile(result.reportPath!, "utf8")),
  );
  const validationArtifact = validationArtifactSchema.parse(
    JSON.parse(await readFile(stageByName(result, "validation").artifactPath, "utf8")),
  );
  const calculationsArtifact = framingCalculationsArtifactSchema.parse(
    JSON.parse(await readFile(stageByName(result, "calculations").artifactPath, "utf8")),
  );
  const openingsArtifact = openingsArtifactSchema.parse(
    JSON.parse(await readFile(stageByName(result, "openings").artifactPath, "utf8")),
  );
  const structuralMembersArtifact = structuralMembersArtifactSchema.parse(
    JSON.parse(
      await readFile(stageByName(result, "structuralMembers").artifactPath, "utf8"),
    ),
  );
  const wallFramingArtifact = wallFramingArtifactSchema.parse(
    JSON.parse(await readFile(stageByName(result, "wallFraming").artifactPath, "utf8")),
  );
  const floorFramingArtifact = floorFramingArtifactSchema.parse(
    JSON.parse(await readFile(stageByName(result, "floorFraming").artifactPath, "utf8")),
  );
  const roofFramingArtifact = roofFramingArtifactSchema.parse(
    JSON.parse(await readFile(stageByName(result, "roofFraming").artifactPath, "utf8")),
  );
  const sheathingArtifact = sheathingArtifactSchema.parse(
    JSON.parse(await readFile(stageByName(result, "sheathing").artifactPath, "utf8")),
  );

  const reviewWorkspace = projectFramingReviewWorkspace({
    validation: validationArtifact.payload,
    calculations: calculationsArtifact.payload,
    openings: openingsArtifact.payload,
    structuralMembers: structuralMembersArtifact.payload,
    wallFraming: wallFramingArtifact.payload,
    floorFraming: floorFramingArtifact.payload,
    roofFraming: roofFramingArtifact.payload,
    sheathing: sheathingArtifact.payload,
    userDecisions: options.userDecisions,
    supplementalReviewItemsById: options.supplementalReviewItemsById,
  });

  return {
    pipelineRunId: result.pipelineRunId,
    takeoff: reportArtifact.payload,
    reviewWorkspace,
    calculations: calculationsArtifact.payload,
  };
}

export function compareMaterialQuantities(
  run1: LoadedFramingRunState,
  run2: LoadedFramingRunState,
): FramingMaterialComparison[] {
  const run1ById = new Map<string, FramingMaterialLineItem>(
    run1.calculations.materials.map((material) => [material.id, material]),
  );
  const comparisons: FramingMaterialComparison[] = [];

  for (const run2Material of run2.calculations.materials) {
    const run1Material = run1ById.get(run2Material.id);
    if (run1Material?.quantity === run2Material.quantity) {
      continue;
    }

    comparisons.push({
      materialLineId: run2Material.id,
      description: run2Material.description,
      unit: run2Material.unit,
      run1Quantity: run1Material?.quantity ?? null,
      run2Quantity: run2Material.quantity,
    });
  }

  return comparisons.sort((left, right) =>
    left.materialLineId < right.materialLineId
      ? -1
      : left.materialLineId > right.materialLineId
        ? 1
        : 0,
  );
}
