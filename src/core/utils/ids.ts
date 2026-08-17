import { randomUUID } from "node:crypto";

function compactUuid(): string {
  return randomUUID().replaceAll("-", "").slice(0, 12);
}

export function generateProjectId(): string {
  return `project-${compactUuid()}`;
}

export function generatePipelineRunId(): string {
  return `run-${compactUuid()}`;
}

export function generateArtifactId(order: number): string {
  return `artifact-${String(order).padStart(2, "0")}-${compactUuid()}`;
}

export function formatStageArtifactName(order: number, name: string): string {
  return `${String(order).padStart(2, "0")}-${name}.json`;
}
