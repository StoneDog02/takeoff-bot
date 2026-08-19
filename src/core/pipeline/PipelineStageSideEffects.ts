import type { ArtifactEnvelope } from "../schemas/artifact-envelope.schema.js";

export type PipelineStageCompanionArtifact = {
  fileSuffix: string;
  artifact: ArtifactEnvelope<unknown>;
};

/**
 * Collects optional stage outputs that extend the primary stage artifact without
 * mutating previously persisted artifacts.
 */
export class PipelineStageSideEffects {
  private readonly artifactOverrides = new Map<
    string,
    ArtifactEnvelope<unknown>
  >();
  private readonly companionArtifacts: PipelineStageCompanionArtifact[] = [];

  publishArtifactOverride(
    stageKey: string,
    artifact: ArtifactEnvelope<unknown>,
  ): void {
    this.artifactOverrides.set(stageKey, artifact);
  }

  publishCompanionArtifact(
    fileSuffix: string,
    artifact: ArtifactEnvelope<unknown>,
  ): void {
    this.companionArtifacts.push({ fileSuffix, artifact });
  }

  consume(): {
    artifactOverrides: ReadonlyMap<string, ArtifactEnvelope<unknown>>;
    companionArtifacts: readonly PipelineStageCompanionArtifact[];
  } {
    return {
      artifactOverrides: this.artifactOverrides,
      companionArtifacts: this.companionArtifacts,
    };
  }
}
