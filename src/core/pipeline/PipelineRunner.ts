import { ArtifactStore } from "../artifacts/ArtifactStore.js";
import { logger } from "../logging/logger.js";
import type { ArtifactEnvelope } from "../schemas/artifact-envelope.schema.js";
import { generatePipelineRunId } from "../utils/ids.js";
import type { PlanIndex } from "../../plans/PlanIndex.js";
import { PipelineStageSideEffects } from "./PipelineStageSideEffects.js";
import type {
  PipelineRunResult,
  PipelineStage,
  PipelineStageCompanionResult,
  PipelineStageResult,
  UserDecisionRunInput,
} from "./types.js";

export interface PipelineRunnerInput {
  projectId: string;
  pdfPath: string;
  scopeName: string;
  planIndex: PlanIndex;
  useMockAi: boolean;
  stages: PipelineStage[];
  userDecisionRunInput?: UserDecisionRunInput;
}

export class PipelineRunner {
  constructor(private readonly artifactStore = new ArtifactStore()) {}

  async run(input: PipelineRunnerInput): Promise<PipelineRunResult> {
    const pipelineRunId = generatePipelineRunId();
    const completedArtifacts = new Map<
      string,
      ArtifactEnvelope<unknown>
    >();
    const stageResults: PipelineStageResult[] = [];
    const errors: string[] = [];
    let reportPath: string | null = null;

    const stages = [...input.stages].sort((a, b) => a.order - b.order);
    this.validateStageOrder(stages);

    for (const stage of stages) {
      try {
        logger.info("Running pipeline stage", {
          order: stage.order,
          stage: stage.name,
        });

        const stageSideEffects = new PipelineStageSideEffects();
        const artifact = await stage.run({
          projectId: input.projectId,
          pdfPath: input.pdfPath,
          scopeName: input.scopeName,
          pipelineRunId,
          planIndex: input.planIndex,
          useMockAi: input.useMockAi,
          completedArtifacts,
          stageSideEffects,
          userDecisionRunInput: input.userDecisionRunInput,
        });

        const { artifactOverrides, companionArtifacts } =
          stageSideEffects.consume();

        const artifactPath = await this.artifactStore.write(
          input.projectId,
          input.scopeName,
          stage.order,
          stage.name,
          artifact,
        );

        const companionResults: PipelineStageCompanionResult[] = [];
        for (const companion of companionArtifacts) {
          const companionPath = await this.artifactStore.writeCompanion(
            input.projectId,
            input.scopeName,
            stage.order,
            stage.name,
            companion.fileSuffix,
            companion.artifact,
          );
          companionResults.push({
            fileSuffix: companion.fileSuffix,
            artifactId: companion.artifact.artifactId,
            artifactType: companion.artifact.artifactType,
            artifactPath: companionPath,
          });
        }

        completedArtifacts.set(stage.name, artifact);
        for (const [stageKey, overrideArtifact] of artifactOverrides) {
          completedArtifacts.set(stageKey, overrideArtifact);
        }

        stageResults.push({
          order: stage.order,
          name: stage.name,
          artifactId: artifact.artifactId,
          artifactType: artifact.artifactType,
          artifactPath,
          companionArtifacts:
            companionResults.length > 0 ? companionResults : undefined,
        });
        reportPath = artifactPath;
      } catch (error) {
        const message = `${stage.name}: ${
          error instanceof Error ? error.message : String(error)
        }`;
        errors.push(message);
        logger.error("Pipeline stage failed", {
          order: stage.order,
          stage: stage.name,
          error: message,
        });
        break;
      }
    }

    return {
      success: errors.length === 0 && stageResults.length === stages.length,
      projectId: input.projectId,
      scopeName: input.scopeName,
      pipelineRunId,
      reportPath,
      stageResults,
      errors,
    };
  }

  private validateStageOrder(stages: PipelineStage[]): void {
    const orders = stages.map((stage) => stage.order);
    if (new Set(orders).size !== orders.length) {
      throw new Error("Pipeline stage order values must be unique.");
    }

    for (let index = 0; index < stages.length; index += 1) {
      if (stages[index]?.order !== index + 1) {
        throw new Error("Pipeline stage order must be contiguous and start at 1.");
      }
    }
  }
}
