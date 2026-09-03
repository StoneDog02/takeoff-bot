import { logger } from "../../../core/logging/logger.js";
import type { Evidence } from "../../../core/schemas/evidence.schema.js";
import type { PlanIndex } from "../../../plans/PlanIndex.js";
import { calculateFramingTakeoff } from "./calculateFramingTakeoff.js";
import type { FramingConstruction } from "./framingConstruction.schema.js";
import { readFramingPlans } from "./readFramingPlans.js";
import type { ResetTakeoff } from "./resetTakeoff.schema.js";
import {
  buildResetTakeoff,
  writeResetTakeoff,
} from "./writeResetTakeoff.js";

export type RunFramingResetTakeoffInput = {
  projectId: string;
  pdfPath: string;
  planIndex: PlanIndex;
  useMockAi: boolean;
  /** Inject construction directly (unit tests / fixtures). Skips reader. */
  constructionOverride?: FramingConstruction;
  /** Inject Evidence and skip live extraction (replay). */
  evidenceReplay?: readonly Evidence[];
  writeDebugArtifacts?: boolean;
  artifactsRoot?: string;
};

export type RunFramingResetTakeoffResult = {
  success: boolean;
  projectId: string;
  pdfPath: string;
  takeoffPath: string | null;
  takeoff: ResetTakeoff | null;
  construction: FramingConstruction | null;
  debugPaths: string[];
  errors: string[];
};

/**
 * Factory-reset production orchestrator:
 * UPLOAD (caller indexes PDF) → READ THE PLANS → CALCULATE / DERIVE / ASSUME
 * → temporary MATERIAL OUTPUT (reset-takeoff.json).
 */
export async function runFramingResetTakeoff(
  input: RunFramingResetTakeoffInput,
): Promise<RunFramingResetTakeoffResult> {
  const errors: string[] = [];
  let construction: FramingConstruction | null =
    input.constructionOverride ?? null;
  let debugPaths: string[] = [];

  try {
    if (!construction) {
      const readResult = await readFramingPlans({
        projectId: input.projectId,
        planIndex: input.planIndex,
        useMockAi: input.useMockAi,
        evidenceReplay: input.evidenceReplay,
        writeDebugArtifacts: input.writeDebugArtifacts ?? true,
        artifactsRoot: input.artifactsRoot,
      });
      construction = readResult.construction;
      debugPaths = readResult.debugPaths;
    }

    const calculated = calculateFramingTakeoff(construction);
    const takeoff = buildResetTakeoff({
      projectId: input.projectId,
      pdfPath: input.pdfPath,
      construction,
      materials: calculated.materials,
      assumptions: calculated.assumptions,
    });
    const takeoffPath = await writeResetTakeoff({
      projectId: input.projectId,
      artifactsRoot: input.artifactsRoot,
      takeoff,
    });

    logger.info("Framing reset takeoff complete", {
      projectId: input.projectId,
      takeoffPath,
      materialCount: takeoff.materials.length,
      assumptionCount: takeoff.assumptions?.length ?? 0,
    });

    return {
      success: true,
      projectId: input.projectId,
      pdfPath: input.pdfPath,
      takeoffPath,
      takeoff,
      construction,
      debugPaths,
      errors,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(message);
    logger.error("Framing reset takeoff failed", { error: message });
    return {
      success: false,
      projectId: input.projectId,
      pdfPath: input.pdfPath,
      takeoffPath: null,
      takeoff: null,
      construction,
      debugPaths,
      errors,
    };
  }
}
