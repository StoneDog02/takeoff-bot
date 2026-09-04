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
import type { ProductAccounting } from "../framing/schemas/productAccounting.schema.js";
import {
  buildDeveloperRunExport,
  type DeveloperRunExport,
} from "./buildDeveloperRunExport.js";

export type UiAccessMode = "customer" | "developer";

export type FramingTakeoffServiceOptions = {
  artifactRoot?: string;
  pdfPath?: string | null;
  accessMode?: UiAccessMode;
};

export type CustomerTakeoffViewState = {
  accessMode: "customer";
  sessionId: string;
  projectId: string;
  pdfPath: string;
  takeoff: FramingTakeoff;
  materialCount: number;
};

export type DeveloperTakeoffViewState = {
  accessMode: "developer";
  sessionId: string;
  projectId: string;
  pdfPath: string;
  takeoff: FramingTakeoff;
  takeoffPath: string | null;
  accountingPath: string | null;
  accounting: ProductAccounting;
  materialCount: number;
  limitations: string[];
};

export type TakeoffViewState =
  | CustomerTakeoffViewState
  | DeveloperTakeoffViewState;

type FramingTakeoffSession = {
  id: string;
  projectId: string;
  pdfPath: string;
  result: RunFramingTakeoffResult;
};

/**
 * Resolve UI access mode.
 * Unset / unknown → customer (fail closed for diagnostics).
 */
export function resolveUiAccessMode(
  raw: string | undefined = process.env.TAKEOFF_UI_ACCESS,
): UiAccessMode {
  if (raw?.trim().toLowerCase() === "developer") {
    return "developer";
  }
  return "customer";
}

function sanitizeCustomerTakeoff(takeoff: FramingTakeoff): FramingTakeoff {
  return {
    schemaVersion: takeoff.schemaVersion,
    projectId: takeoff.projectId,
    pdfPath: takeoff.pdfPath,
    createdAt: takeoff.createdAt,
    materials: takeoff.materials.map((line) => ({
      material: line.material,
      lengthOrType: line.lengthOrType,
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      ...(line.assumptionUsed ? { assumptionUsed: true } : {}),
      ...(line.assumptionNote ? { assumptionNote: line.assumptionNote } : {}),
    })),
    assumptions: takeoff.assumptions?.map((assumption) => ({
      summary: assumption.summary,
      ...(assumption.quantityKeys
        ? { quantityKeys: assumption.quantityKeys }
        : {}),
    })),
  };
}

/**
 * UI service for the framing takeoff production path.
 *
 * Review workspace / user-decision Run-2 / Stage-16 product state are retired.
 * Developer diagnostics are gated by TAKEOFF_UI_ACCESS (server-side).
 */
export class FramingTakeoffService {
  private readonly artifactRoot: string;
  private readonly defaultPdfPath: string | null;
  private readonly accessMode: UiAccessMode;
  private readonly sessions = new Map<string, FramingTakeoffSession>();

  constructor(options: FramingTakeoffServiceOptions = {}) {
    this.artifactRoot = options.artifactRoot ?? "artifacts";
    this.defaultPdfPath = options.pdfPath ?? null;
    this.accessMode = options.accessMode ?? resolveUiAccessMode();
  }

  getAccessMode(): UiAccessMode {
    return this.accessMode;
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

    if (!result.success || !result.takeoff || !result.accounting) {
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

  /**
   * Developer-only full diagnostic export.
   * Forbidden when access mode is customer.
   */
  getDeveloperRunExport(sessionId: string): DeveloperRunExport {
    if (this.accessMode !== "developer") {
      throw new DeveloperExportForbiddenError();
    }
    const state = this.toViewState(sessionId);
    if (state.accessMode !== "developer") {
      throw new DeveloperExportForbiddenError();
    }
    return buildDeveloperRunExport(state);
  }

  private toViewState(sessionId: string): TakeoffViewState {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Unknown UI session '${sessionId}'.`);
    }
    const takeoff = session.result.takeoff!;
    const accounting = session.result.accounting!;

    if (this.accessMode === "customer") {
      return {
        accessMode: "customer",
        sessionId,
        projectId: session.projectId,
        pdfPath: session.pdfPath,
        takeoff: sanitizeCustomerTakeoff(takeoff),
        materialCount: takeoff.materials.length,
      };
    }

    return {
      accessMode: "developer",
      sessionId,
      projectId: session.projectId,
      pdfPath: session.pdfPath,
      takeoff,
      takeoffPath: session.result.takeoffPath,
      accountingPath: session.result.accountingPath,
      accounting,
      materialCount: takeoff.materials.length,
      limitations: [
        "Developer mode: same contractor takeoff plus taxonomy accounting diagnostics.",
        "Customer mode omits diagnostics (TAKEOFF_UI_ACCESS=customer).",
      ],
    };
  }
}

export class DeveloperExportForbiddenError extends Error {
  readonly statusCode = 403;

  constructor() {
    super("Developer export is not available in customer mode.");
    this.name = "DeveloperExportForbiddenError";
  }
}
