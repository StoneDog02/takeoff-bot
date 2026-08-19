import { mkdir } from "node:fs/promises";
import path from "node:path";

import { ArtifactStore } from "../core/artifacts/ArtifactStore.js";
import { PipelineRunner } from "../core/pipeline/PipelineRunner.js";
import type { PipelineRunResult } from "../core/pipeline/types.js";
import type { ReviewItemId } from "../core/schemas/identity.schema.js";
import type { UserDecisionId } from "../core/schemas/identity.schema.js";
import type { ArtifactId } from "../core/schemas/identity.schema.js";
import type { PipelineRunId } from "../core/schemas/identity.schema.js";
import type { ReviewItem } from "../core/schemas/review-item.schema.js";
import type { UserDecision } from "../core/schemas/user-decision.schema.js";
import type { ReviewWorkspacePayload } from "../core/schemas/review-workspace.schema.js";
import {
  generateUiSessionId,
  generateUserDecisionId,
} from "../core/utils/ids.js";
import { indexPlan } from "../plans/indexPlan.js";
import type { FramingTakeoff } from "../scopes/framing/schemas/framing-takeoff.schema.js";
import { validationArtifactSchema } from "../scopes/framing/schemas/framing-artifacts.schema.js";
import {
  createUserDecisionArtifact,
} from "./createUserDecisionArtifact.js";
import {
  createUiDemoFramingStages,
  UI_DEMO_PDF_PATH,
  UI_DEMO_PROJECT_ID,
} from "./createUiDemoFramingStages.js";
import {
  compareMaterialQuantities,
  loadFramingRunState,
  type FramingMaterialComparison,
  type LoadedFramingRunState,
} from "./loadFramingRunState.js";

export type TakeoffViewState = {
  sessionId: string;
  activeRun: 1 | 2;
  projectId: string;
  pdfPath: string;
  pipelineRunId: string;
  takeoff: FramingTakeoff;
  reviewWorkspace: ReviewWorkspacePayload;
  userDecisions: UserDecision[];
  materialComparison: FramingMaterialComparison[] | null;
  run1PipelineRunId: string;
  run2PipelineRunId: string | null;
};

type StoredRun = {
  artifactRoot: string;
  result: PipelineRunResult;
  loaded: LoadedFramingRunState;
};

type FramingTakeoffSession = {
  id: string;
  projectId: string;
  pdfPath: string;
  run1: StoredRun;
  run2?: StoredRun;
  userDecisions: UserDecision[];
  userDecisionArtifacts: string[];
  run1ReviewItemsById: Map<ReviewItemId, ReviewItem>;
};

function stageByName(result: PipelineRunResult, name: string) {
  const stage = result.stageResults.find((entry) => entry.name === name);
  if (!stage) {
    throw new Error(`Expected pipeline stage '${name}'.`);
  }
  return stage;
}

function toViewState(session: FramingTakeoffSession): TakeoffViewState {
  const activeRun = session.run2 ?? session.run1;
  const materialComparison =
    session.run2 != null
      ? compareMaterialQuantities(session.run1.loaded, session.run2.loaded)
      : null;

  return {
    sessionId: session.id,
    activeRun: session.run2 ? 2 : 1,
    projectId: session.projectId,
    pdfPath: session.pdfPath,
    pipelineRunId: activeRun.result.pipelineRunId,
    takeoff: activeRun.loaded.takeoff,
    reviewWorkspace: activeRun.loaded.reviewWorkspace,
    userDecisions: [...session.userDecisions],
    materialComparison,
    run1PipelineRunId: session.run1.result.pipelineRunId,
    run2PipelineRunId: session.run2?.result.pipelineRunId ?? null,
  };
}

export class FramingTakeoffService {
  private readonly sessions = new Map<string, FramingTakeoffSession>();

  constructor(
    private readonly artifactRoot = path.resolve("artifacts", "ui-sessions"),
  ) {}

  async startDemoRun(): Promise<TakeoffViewState> {
    const sessionId = generateUiSessionId();
    const run1ArtifactRoot = path.join(this.artifactRoot, sessionId, "run1");
    await mkdir(run1ArtifactRoot, { recursive: true });

    const planIndex = await indexPlan(UI_DEMO_PDF_PATH);
    const runner = new PipelineRunner(new ArtifactStore(run1ArtifactRoot));
    const result = await runner.run({
      projectId: UI_DEMO_PROJECT_ID,
      pdfPath: UI_DEMO_PDF_PATH,
      scopeName: "framing",
      planIndex,
      useMockAi: true,
      stages: createUiDemoFramingStages(),
    });

    if (!result.success) {
      throw new Error(result.errors.join("\n"));
    }

    const loaded = await loadFramingRunState(result);
    const run1ValidationStage = stageByName(result, "validation");
    const run1ValidationArtifact = validationArtifactSchema.parse(
      await new ArtifactStore(run1ArtifactRoot).read(run1ValidationStage.artifactPath),
    );
    const run1ReviewItemsById = new Map<ReviewItemId, ReviewItem>(
      run1ValidationArtifact.payload.reviewItems.map((item) => [item.id, item]),
    );

    const session: FramingTakeoffSession = {
      id: sessionId,
      projectId: UI_DEMO_PROJECT_ID,
      pdfPath: UI_DEMO_PDF_PATH,
      run1: {
        artifactRoot: run1ArtifactRoot,
        result,
        loaded,
      },
      userDecisions: [],
      userDecisionArtifacts: [],
      run1ReviewItemsById,
    };

    this.sessions.set(sessionId, session);
    return toViewState(session);
  }

  getSession(sessionId: string): TakeoffViewState | null {
    const session = this.sessions.get(sessionId);
    return session ? toViewState(session) : null;
  }

  async submitValueProvidedDecision(input: {
    sessionId: string;
    reviewItemId: ReviewItemId;
    value: string | number | boolean;
    rationale: string;
  }): Promise<TakeoffViewState> {
    const session = this.sessions.get(input.sessionId);
    if (!session) {
      throw new Error(`Unknown session '${input.sessionId}'.`);
    }

    if (session.run2) {
      throw new Error("This session already completed Run 2.");
    }

    const reviewItem = session.run1.loaded.reviewWorkspace.items.find(
      (item: { reviewItemId: ReviewItemId }) =>
        item.reviewItemId === input.reviewItemId,
    );
    if (!reviewItem) {
      throw new Error(`Review Item '${input.reviewItemId}' is not active.`);
    }

    if (reviewItem.action.type !== "provide-value") {
      throw new Error(
        `Review Item '${input.reviewItemId}' does not accept value-provided decisions.`,
      );
    }

    const run1ValidationStage = stageByName(session.run1.result, "validation");
    const run1ValidationArtifact = validationArtifactSchema.parse(
      await new ArtifactStore(session.run1.artifactRoot).read(
        run1ValidationStage.artifactPath,
      ),
    );

    const decision: UserDecision = {
      id: generateUserDecisionId() as UserDecisionId,
      reviewItemId: input.reviewItemId,
      result: {
        type: "value-provided",
        value: input.value,
        rationale: input.rationale,
      },
      supersedesUserDecisionId: null,
    };

    const decisionArtifact = createUserDecisionArtifact({
      projectId: session.projectId,
      pipelineRunId: session.run1.result.pipelineRunId as PipelineRunId,
      validationArtifactId: run1ValidationStage.artifactId as ArtifactId,
      decision,
    });

    const run1Store = new ArtifactStore(session.run1.artifactRoot);
    const decisionPath = await run1Store.writeExternal(
      session.projectId,
      "framing",
      `${decision.id}.json`,
      decisionArtifact,
    );
    const loadedDecisionArtifact = await run1Store.read(decisionPath);

    const reviewItemsById = new Map<ReviewItemId, ReviewItem>(
      run1ValidationArtifact.payload.reviewItems.map((item) => [item.id, item]),
    );

    const run2ArtifactRoot = path.join(this.artifactRoot, session.id, "run2");
    await mkdir(run2ArtifactRoot, { recursive: true });

    const planIndex = await indexPlan(session.pdfPath);
    const runner = new PipelineRunner(new ArtifactStore(run2ArtifactRoot));
    const run2Result = await runner.run({
      projectId: session.projectId,
      pdfPath: session.pdfPath,
      scopeName: "framing",
      planIndex,
      useMockAi: true,
      stages: createUiDemoFramingStages(),
      userDecisionRunInput: {
        userDecisions: [loadedDecisionArtifact.payload as UserDecision],
        reviewItemsById,
        inputArtifactIds: [loadedDecisionArtifact.artifactId],
      },
    });

    if (!run2Result.success) {
      throw new Error(run2Result.errors.join("\n"));
    }

    session.userDecisions.push(decision);
    session.userDecisionArtifacts.push(decisionPath);
    session.run2 = {
      artifactRoot: run2ArtifactRoot,
      result: run2Result,
      loaded: await loadFramingRunState(run2Result, {
        userDecisions: session.userDecisions,
        supplementalReviewItemsById: session.run1ReviewItemsById,
      }),
    };

    return toViewState(session);
  }
}
