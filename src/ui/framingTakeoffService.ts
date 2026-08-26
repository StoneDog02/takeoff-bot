import { mkdir, readFile } from "node:fs/promises";
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
import type { FramingPackageProductState } from "../scopes/framing/observability/framingPackageProductState.schema.js";
import {
  generateUiSessionId,
  generateUserDecisionId,
} from "../core/utils/ids.js";
import { indexPlan } from "../plans/indexPlan.js";
import type { FramingTakeoff } from "../scopes/framing/schemas/framing-takeoff.schema.js";
import {
  extractedFramingEvidenceArtifactSchema,
  validationArtifactSchema,
} from "../scopes/framing/schemas/framing-artifacts.schema.js";
import { buildEvidenceReplayInput } from "../scopes/framing/stages/buildEvidenceReplayInput.js";
import { createFramingStages } from "../scopes/framing/stages/createFramingStages.js";
import { copyArtifactDirectory } from "./copyArtifactDirectory.js";
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
import { loadPipelineRunResultFromArtifactDir } from "./loadPipelineRunResultFromArtifactDir.js";
import {
  deriveProductPackageViewRows,
  type ProductPackageViewRow,
} from "./projectProductState.js";

export type FramingTakeoffServiceOptions = {
  artifactRoot?: string;
  artifactDir?: string | null;
  pdfPath?: string | null;
};

export type SessionSource = "artifact-load" | "demo-run";

export type RunSnapshot = {
  runNumber: 1 | 2;
  pipelineRunId: string;
  label: "automatic" | "recalculated";
  artifactRoot: string;
};

export type RunLineageView = {
  runs: RunSnapshot[];
  activeRun: 1 | 2;
  userDecisionIds: UserDecisionId[];
};

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
  sessionSource: SessionSource;
  replayCapable: boolean;
  packageProductState: FramingPackageProductState | null;
  packages: ProductPackageViewRow[];
  runLineage: RunLineageView;
  limitations: string[];
  sourceArtifactDir: string | null;
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
  sessionSource: SessionSource;
  replayCapable: boolean;
  sourceArtifactDir: string | null;
};

function stageByName(result: PipelineRunResult, name: string) {
  const stage = result.stageResults.find((entry) => entry.name === name);
  if (!stage) {
    throw new Error(`Expected pipeline stage '${name}'.`);
  }
  return stage;
}

function buildPackages(
  packageProductState: FramingPackageProductState | null,
): ProductPackageViewRow[] {
  if (!packageProductState) {
    return [];
  }
  return deriveProductPackageViewRows(packageProductState);
}

function buildRunLineage(session: FramingTakeoffSession): RunLineageView {
  const runs: RunSnapshot[] = [
    {
      runNumber: 1,
      pipelineRunId: session.run1.result.pipelineRunId,
      label: "automatic",
      artifactRoot: session.run1.artifactRoot,
    },
  ];

  if (session.run2) {
    runs.push({
      runNumber: 2,
      pipelineRunId: session.run2.result.pipelineRunId,
      label: "recalculated",
      artifactRoot: session.run2.artifactRoot,
    });
  }

  return {
    runs,
    activeRun: session.run2 ? 2 : 1,
    userDecisionIds: session.userDecisions.map((decision) => decision.id),
  };
}

function buildLimitations(session: FramingTakeoffSession): string[] {
  const limitations = ["In-memory session only — lost on server restart."];
  limitations.push("Single Run 2 per session (MVP limitation).");

  if (!session.replayCapable) {
    limitations.push(
      "Run 2 replay unavailable — extractedEvidence or other replay-required artifacts are missing.",
    );
  }

  const activeRun = session.run2 ?? session.run1;
  if (!activeRun.loaded.packageProductState) {
    limitations.push(
      "Package product-state companion artifact not found — package dashboard unavailable for this run.",
    );
  }

  return limitations;
}

function toViewState(session: FramingTakeoffSession): TakeoffViewState {
  const activeRun = session.run2 ?? session.run1;
  const materialComparison =
    session.run2 != null
      ? compareMaterialQuantities(session.run1.loaded, session.run2.loaded)
      : null;

  const packageProductState = activeRun.loaded.packageProductState;

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
    sessionSource: session.sessionSource,
    replayCapable: session.replayCapable,
    packageProductState,
    packages: buildPackages(packageProductState),
    runLineage: buildRunLineage(session),
    limitations: buildLimitations(session),
    sourceArtifactDir: session.sourceArtifactDir,
  };
}

export class FramingTakeoffService {
  private readonly sessions = new Map<string, FramingTakeoffSession>();
  private readonly artifactRoot: string;
  private readonly artifactDir: string | null;
  private readonly pdfPathOverride: string | null;

  constructor(options: string | FramingTakeoffServiceOptions = {}) {
    if (typeof options === "string") {
      this.artifactRoot = path.resolve(options);
      this.artifactDir = process.env.TAKEOFF_UI_ARTIFACT_DIR?.trim() || null;
      this.pdfPathOverride = process.env.TAKEOFF_UI_PDF_PATH?.trim() || null;
      return;
    }

    this.artifactRoot =
      options.artifactRoot ?? path.resolve("artifacts", "ui-sessions");
    this.artifactDir =
      options.artifactDir ?? process.env.TAKEOFF_UI_ARTIFACT_DIR?.trim() ?? null;
    this.pdfPathOverride =
      options.pdfPath ?? process.env.TAKEOFF_UI_PDF_PATH?.trim() ?? null;
  }

  async startSession(input: { artifactDir?: string } = {}): Promise<TakeoffViewState> {
    const artifactDir = input.artifactDir?.trim() || this.artifactDir;
    if (artifactDir) {
      return this.startFromArtifactDir(artifactDir);
    }
    return this.startDemoRun();
  }

  async startFromArtifactDir(sourceArtifactDir: string): Promise<TakeoffViewState> {
    const sessionId = generateUiSessionId();
    const run1ArtifactRoot = path.join(this.artifactRoot, sessionId, "run1");
    await copyArtifactDirectory(sourceArtifactDir, run1ArtifactRoot);

    const { result, projectId, pdfPath, replayCapable } =
      await loadPipelineRunResultFromArtifactDir(run1ArtifactRoot);
    const loaded = await loadFramingRunState(result);
    const run1ValidationStage = stageByName(result, "validation");
    const run1ValidationArtifact = validationArtifactSchema.parse(
      JSON.parse(await readFile(run1ValidationStage.artifactPath, "utf8")),
    );

    const session: FramingTakeoffSession = {
      id: sessionId,
      projectId,
      pdfPath: this.pdfPathOverride ?? pdfPath ?? "",
      run1: {
        artifactRoot: run1ArtifactRoot,
        result,
        loaded,
      },
      userDecisions: [],
      userDecisionArtifacts: [],
      run1ReviewItemsById: new Map<ReviewItemId, ReviewItem>(
        run1ValidationArtifact.payload.reviewItems.map((item) => [item.id, item]),
      ),
      sessionSource: "artifact-load",
      replayCapable,
      sourceArtifactDir: path.resolve(sourceArtifactDir),
    };

    this.sessions.set(sessionId, session);
    return toViewState(session);
  }

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
      sessionSource: "demo-run",
      replayCapable: true,
      sourceArtifactDir: null,
    };

    this.sessions.set(sessionId, session);
    return toViewState(session);
  }

  getSession(sessionId: string): TakeoffViewState | null {
    const session = this.sessions.get(sessionId);
    return session ? toViewState(session) : null;
  }

  async submitReviewDecision(input: {
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

    if (!session.replayCapable) {
      throw new Error(
        "This session is missing replay-required artifacts and does not support Run 2.",
      );
    }

    const reviewItem = session.run1.loaded.reviewWorkspace.items.find(
      (item) => item.reviewItemId === input.reviewItemId,
    );
    if (!reviewItem) {
      throw new Error(`Review Item '${input.reviewItemId}' is not active.`);
    }

    if (reviewItem.action.type !== "provide-value") {
      throw new Error(
        `Review Item '${input.reviewItemId}' does not accept value-provided decisions.`,
      );
    }

    if (!reviewItem.action.targetProperty) {
      throw new Error(
        `Review Item '${input.reviewItemId}' has no target property for value-provided decisions.`,
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
    const run1EvidenceArtifact = extractedFramingEvidenceArtifactSchema.parse(
      await run1Store.read(
        stageByName(session.run1.result, "extractedEvidence").artifactPath,
      ),
    );

    const stages =
      session.sessionSource === "artifact-load"
        ? createFramingStages()
        : createUiDemoFramingStages();

    const runner = new PipelineRunner(new ArtifactStore(run2ArtifactRoot));
    const run2Result = await runner.run({
      projectId: session.projectId,
      pdfPath: session.pdfPath,
      scopeName: "framing",
      planIndex,
      useMockAi: true,
      stages,
      userDecisionRunInput: {
        userDecisions: [loadedDecisionArtifact.payload as UserDecision],
        reviewItemsById,
        inputArtifactIds: [loadedDecisionArtifact.artifactId],
        evidenceReplay: buildEvidenceReplayInput({
          extractedEvidenceArtifact: run1EvidenceArtifact,
          planIndex,
        }),
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

  /** @deprecated Use submitReviewDecision — kept for existing callers/tests. */
  async submitValueProvidedDecision(input: {
    sessionId: string;
    reviewItemId: ReviewItemId;
    value: string | number | boolean;
    rationale: string;
  }): Promise<TakeoffViewState> {
    return this.submitReviewDecision(input);
  }
}
