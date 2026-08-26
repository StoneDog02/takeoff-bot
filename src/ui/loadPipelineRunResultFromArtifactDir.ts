import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";

import type {
  PipelineRunResult,
  PipelineStageResult,
} from "../core/pipeline/types.js";
import {
  finalFramingTakeoffArtifactSchema,
  verifiedPlanSetArtifactSchema,
} from "../scopes/framing/schemas/framing-artifacts.schema.js";

const STAGE_FILE_PATTERN = /^(\d{2})-([a-zA-Z]+)\.json$/;

const REQUIRED_STAGES_FOR_UI = [
  "validation",
  "calculations",
  "openings",
  "structuralMembers",
  "wallFraming",
  "floorFraming",
  "roofFraming",
  "sheathing",
  "report",
] as const;

/** Stages required for deterministic User Decision Run 2 with evidence replay. */
const REQUIRED_STAGES_FOR_REPLAY = [
  ...REQUIRED_STAGES_FOR_UI,
  "extractedEvidence",
] as const;

type ArtifactEnvelopeMeta = {
  artifactId: string;
  artifactType: string;
};

export type LoadedArtifactDirectoryRun = {
  result: PipelineRunResult;
  projectId: string;
  pdfPath: string | null;
  replayCapable: boolean;
  missingReplayStages: string[];
};

/**
 * Reconstruct a minimal PipelineRunResult from a completed framing artifact
 * directory (NN-stageName.json files). Used by the thin UI inspection bridge
 * only — does not mutate or copy artifacts.
 */
export async function loadPipelineRunResultFromArtifactDir(
  artifactDir: string,
): Promise<LoadedArtifactDirectoryRun> {
  const resolvedDir = path.resolve(artifactDir);

  try {
    await access(resolvedDir);
  } catch {
    throw new Error(
      `TAKEOFF_UI_ARTIFACT_DIR does not exist or is not readable: ${resolvedDir}`,
    );
  }

  const entries = await readdir(resolvedDir);
  const stageResults: PipelineStageResult[] = [];

  for (const fileName of entries) {
    const match = fileName.match(STAGE_FILE_PATTERN);
    if (!match) {
      continue;
    }

    const order = Number(match[1]);
    const name = match[2]!;
    const artifactPath = path.join(resolvedDir, fileName);
    const raw = JSON.parse(await readFile(artifactPath, "utf8")) as ArtifactEnvelopeMeta;
    stageResults.push({
      order,
      name,
      artifactId: raw.artifactId,
      artifactType: raw.artifactType,
      artifactPath,
    });
  }

  if (stageResults.length === 0) {
    throw new Error(
      `TAKEOFF_UI_ARTIFACT_DIR contains no NN-stageName.json framing artifacts: ${resolvedDir}`,
    );
  }

  stageResults.sort((left, right) => left.order - right.order);

  const byName = new Map(stageResults.map((stage) => [stage.name, stage]));
  const missingUi = REQUIRED_STAGES_FOR_UI.filter((name) => !byName.has(name));
  if (missingUi.length > 0) {
    throw new Error(
      `Artifact directory is missing required framing stage artifacts: ${missingUi.join(", ")} (${resolvedDir})`,
    );
  }

  const missingReplayStages = REQUIRED_STAGES_FOR_REPLAY.filter(
    (name) => !byName.has(name),
  );
  const replayCapable = missingReplayStages.length === 0;

  const reportStage = byName.get("report")!;
  const reportEnvelope = finalFramingTakeoffArtifactSchema.parse(
    JSON.parse(await readFile(reportStage.artifactPath, "utf8")),
  );

  const projectId = reportEnvelope.projectId;
  const pipelineRunId = reportEnvelope.pipelineRunId;
  if (!projectId || !pipelineRunId) {
    throw new Error(
      `TAKEOFF_UI_ARTIFACT_DIR report artifact is missing projectId or pipelineRunId (${resolvedDir})`,
    );
  }

  let pdfPath: string | null = null;
  const verifiedStage = byName.get("verifiedPlanSet");
  if (verifiedStage) {
    const verifiedEnvelope = verifiedPlanSetArtifactSchema.parse(
      JSON.parse(await readFile(verifiedStage.artifactPath, "utf8")),
    );
    pdfPath = verifiedEnvelope.payload.pdfPath;
  }

  const result: PipelineRunResult = {
    success: true,
    projectId,
    scopeName: "framing",
    pipelineRunId,
    reportPath: reportStage.artifactPath,
    stageResults,
    errors: [],
  };

  return {
    result,
    projectId,
    pdfPath,
    replayCapable,
    missingReplayStages: [...missingReplayStages],
  };
}