import type { ArtifactEnvelope } from "../schemas/artifact-envelope.schema.js";
import type { ArtifactId, ReviewItemId } from "../schemas/identity.schema.js";
import type { ReviewItem } from "../schemas/review-item.schema.js";
import type { UserDecision } from "../schemas/user-decision.schema.js";
import type { PlanIndex } from "../../plans/PlanIndex.js";
import type { PipelineStageSideEffects } from "./PipelineStageSideEffects.js";

export type UserDecisionRunInput = {
  userDecisions: readonly UserDecision[];
  reviewItemsById: ReadonlyMap<ReviewItemId, ReviewItem>;
  inputArtifactIds?: readonly ArtifactId[];
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
