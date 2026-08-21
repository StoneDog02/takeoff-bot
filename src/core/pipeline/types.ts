import type { ArtifactEnvelope } from "../schemas/artifact-envelope.schema.js";
import type { Evidence } from "../schemas/evidence.schema.js";
import type { ArtifactId, ReviewItemId } from "../schemas/identity.schema.js";
import type { ReviewItem } from "../schemas/review-item.schema.js";
import type { UserDecision } from "../schemas/user-decision.schema.js";
import type { PlanIndex } from "../../plans/PlanIndex.js";
import type { PipelineStageSideEffects } from "./PipelineStageSideEffects.js";

/**
 * Authoritative Run-1 extracted Evidence for ordinary User Decision Run-2
 * replay against an unchanged plan set.
 *
 * Stage extractedEvidence copies this payload into a new Run-2 artifact and
 * must not invoke Claude / mock extractors. `sourcePlanFingerprint` must match
 * `computePlanSourceFingerprint(planIndex)` for the current run.
 */
export type EvidenceReplayInput = {
  artifact: ArtifactEnvelope<{ evidence: readonly Evidence[] }>;
  sourcePlanFingerprint: string;
};

export type UserDecisionRunInput = {
  userDecisions: readonly UserDecision[];
  reviewItemsById: ReadonlyMap<ReviewItemId, ReviewItem>;
  inputArtifactIds?: readonly ArtifactId[];
  /**
   * When set, extractedEvidence replays this immutable Run-1 payload without
   * re-extraction. Omit only for explicit re-extraction workflows.
   */
  evidenceReplay?: EvidenceReplayInput;
};

export interface PipelineStageContext {
  projectId: string;
  pdfPath: string;
  scopeName: string;
  pipelineRunId: string;
  planIndex: PlanIndex;
  useMockAi: boolean;
  completedArtifacts: ReadonlyMap<string, ArtifactEnvelope<unknown>>;
  stageSideEffects: PipelineStageSideEffects;
  userDecisionRunInput?: UserDecisionRunInput;
}

export interface PipelineStage {
  order: number;
  name: string;
  run(
    context: PipelineStageContext,
  ): Promise<ArtifactEnvelope<unknown>>;
}

export interface PipelineStageCompanionResult {
  fileSuffix: string;
  artifactId: string;
  artifactType: string;
  artifactPath: string;
}

export interface PipelineStageResult {
  order: number;
  name: string;
  artifactId: string;
  artifactType: string;
  artifactPath: string;
  companionArtifacts?: PipelineStageCompanionResult[];
}

export interface PipelineRunResult {
  success: boolean;
  projectId: string;
  scopeName: string;
  pipelineRunId: string;
  reportPath: string | null;
  stageResults: PipelineStageResult[];
  errors: string[];
}
