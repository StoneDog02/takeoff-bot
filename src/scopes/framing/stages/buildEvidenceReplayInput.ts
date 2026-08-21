import type { EvidenceReplayInput } from "../../../core/pipeline/types.js";
import type { ArtifactEnvelope } from "../../../core/schemas/artifact-envelope.schema.js";
import type { PlanIndex } from "../../../plans/PlanIndex.js";
import { computePlanSourceFingerprint } from "../../../plans/computePlanSourceFingerprint.js";
import type { ExtractedFramingEvidencePayload } from "../schemas/framing-artifacts.schema.js";

/**
 * Builds the User Decision Run-2 Evidence replay contract from an immutable
 * Run-1 extracted-framing-evidence artifact and the current plan index.
 */
export function buildEvidenceReplayInput(input: {
  extractedEvidenceArtifact: ArtifactEnvelope<ExtractedFramingEvidencePayload>;
  planIndex: PlanIndex;
}): EvidenceReplayInput {
  if (input.extractedEvidenceArtifact.artifactType !== "extracted-framing-evidence") {
    throw new Error(
      `buildEvidenceReplayInput: expected extracted-framing-evidence, got ${input.extractedEvidenceArtifact.artifactType}.`,
    );
  }

  return {
    artifact: input.extractedEvidenceArtifact,
    sourcePlanFingerprint: computePlanSourceFingerprint(input.planIndex),
  };
}
