import type { ConfidenceTarget } from "../../../core/schemas/confidence.schema.js";
import type {
  ConfidenceEvaluationId,
  ObjectId,
  PipelineRunId,
} from "../../../core/schemas/identity.schema.js";

function normalizeSegment(value: string): string {
  return value.replaceAll(".", "-");
}

function targetSlug(target: ConfidenceTarget): string {
  switch (target.kind) {
    case "object":
      return `${normalizeSegment(target.objectType)}-${target.objectId}`;
    case "artifact":
      return `${normalizeSegment(target.artifactType)}-${target.artifactId}`;
    case "takeoff":
      return `${normalizeSegment(target.scopeName)}-${normalizeSegment(target.pipelineRunId)}`;
  }
}

export function createConfidenceEvaluationId(
  target: ConfidenceTarget,
): ConfidenceEvaluationId {
  return `CE-${targetSlug(target)}` as ConfidenceEvaluationId;
}

export function createObjectConfidenceTarget(
  objectId: ObjectId,
  objectType: string,
): ConfidenceTarget {
  return {
    kind: "object",
    objectId,
    objectType,
  };
}

export function createTakeoffConfidenceTarget(
  pipelineRunId: PipelineRunId,
  scopeName: string,
): ConfidenceTarget {
  return {
    kind: "takeoff",
    pipelineRunId,
    scopeName,
  };
}
