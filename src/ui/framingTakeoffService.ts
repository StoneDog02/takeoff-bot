import path from "node:path";

import { resolveUseMockAi } from "../config/aiMode.js";
import { isAnthropicConfigured } from "../config/env.js";
import { generateUiSessionId } from "../core/utils/ids.js";
import { indexPlan } from "../pdf/indexPlan.js";
import {
  runFramingTakeoff,
  type RunFramingTakeoffResult,
} from "../framing/output/runFramingTakeoff.js";
import type { FramingTakeoff } from "../framing/schemas/framingTakeoff.schema.js";

export type FramingTakeoffServiceOptions = {
  artifactRoot?: string;
  pdfPath?: string | null;
};

export type TakeoffViewState = {
  sessionId: string;
  projectId: string;
  pdfPath: string;
  takeoff: FramingTakeoff;
  takeoffPath: string | null;
  materialCount: number;
  limitations: string[];
};

type FramingTakeoffSession = {
  id: string;
  projectId: string;
  pdfPath: string;
  result: RunFramingTakeoffResult;
};

/**
 * UI service for the framing takeoff production path.
 *
 * Review workspace / user-decision Run-2 / Stage-16 product state are retired.
 */
export class FramingTakeoffService {
  private readonly artifactRoot: string;
  private readonly defaultPdfPath: string | null;
  private readonly sessions = new Map<string, FramingTakeoffSession>();

  constructor(options: FramingTakeoffServiceOptions = {}) {
    this.artifactRoot = options.artifactRoot ?? "artifacts";
    this.defaultPdfPath = options.pdfPath ?? null;
  }

  async startDemoSession(input?: {
    pdfPath?: string;
    projectId?: string;
  }): Promise<TakeoffViewState> {
    const pdfPath = path.resolve(
      input?.pdfPath ??
        this.defaultPdfPath ??
        "tests/fixtures/beckstead-residence-plans.pdf",
    );
    const projectId =
      input?.projectId ?? `ui-${generateUiSessionId().slice(0, 8)}`;

    const useMockAi = resolveUseMockAi({
      live: false,
      anthropicConfigured: isAnthropicConfigured(),
    });
    const planIndex = await indexPlan(pdfPath);
    const result = await runFramingTakeoff({
      projectId,
      pdfPath,
      planIndex,
      useMockAi,
      writeDebugArtifacts: true,
      artifactsRoot: this.artifactRoot,
    });

    if (!result.success || !result.takeoff) {
      throw new Error(
        `Framing takeoff failed: ${result.errors.join("; ") || "unknown error"}`,
      );
    }

    const sessionId = generateUiSessionId();
    this.sessions.set(sessionId, {
      id: sessionId,
      projectId,
      pdfPath,
      result,
    });

    return this.toViewState(sessionId);
  }

  getSession(sessionId: string): TakeoffViewState {
    return this.toViewState(sessionId);
  }

  private toViewState(sessionId: string): TakeoffViewState {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Unknown UI session '${sessionId}'.`);
    }
    const takeoff = session.result.takeoff!;
    return {
      sessionId,
      projectId: session.projectId,
      pdfPath: session.pdfPath,
      takeoff,
      takeoffPath: session.result.takeoffPath,
      materialCount: takeoff.materials.length,
      limitations: [
        "UI uses the framing takeoff production path only.",
        "Review workspace and user-decision recalculation are not available.",
      ],
    };
  }
}
