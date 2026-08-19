import type { ArtifactId } from "../core/schemas/identity.schema.js";
import type { PipelineRunId } from "../core/schemas/identity.schema.js";
import type { UserDecision } from "../core/schemas/user-decision.schema.js";
import { generateArtifactId } from "../core/utils/ids.js";
import { userDecisionArtifactSchema } from "../scopes/framing/schemas/framing-artifacts.schema.js";

const ENGINE_VERSION = "0.1.0";
const SCHEMA_VERSION = "1.0.0";

export function createUserDecisionArtifact(input: {
  projectId: string;
  pipelineRunId: PipelineRunId;
  validationArtifactId: ArtifactId;
  decision: UserDecision;
  producerIdentifier?: string;
}) {
  const now = new Date().toISOString();
  return userDecisionArtifactSchema.parse({
    artifactId: generateArtifactId(91),
    artifactType: "user-decision",
    schemaVersion: SCHEMA_VERSION,
    artifactVersion: 1,
    engineVersion: ENGINE_VERSION,
    pipelineRunId: input.pipelineRunId,
    projectId: input.projectId,
    createdAt: now,
    lastModifiedAt: now,
    producer: {
      type: "user",
      identifier: input.producerIdentifier ?? "ui-reviewer",
    },
    inputArtifactIds: [input.validationArtifactId],
    parentArtifactIds: [input.validationArtifactId],
    payload: input.decision,
  });
}
