import { logger } from "../../core/logging/logger.js";
import type { Evidence } from "../../core/schemas/evidence.schema.js";
import type { PlanIndex } from "../../pdf/PlanIndex.js";
import { calculateFramingTakeoff } from "../calculate/calculateFramingTakeoff.js";
import type { FramingConstruction } from "../schemas/framingConstruction.schema.js";
import { readFramingPlans } from "../read/readFramingPlans.js";
import type { FramingTakeoff } from "../schemas/framingTakeoff.schema.js";
import {
  buildFramingTakeoff,
  writeFramingTakeoff,
} from "./writeFramingTakeoff.js";

export type RunFramingTakeoffInput = {
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

export type RunFramingTakeoffResult = {
  success: boolean;
  projectId: string;
  pdfPath: string;
  takeoffPath: string | null;
  takeoff: FramingTakeoff | null;
  construction: FramingConstruction | null;
  debugPaths: string[];
  errors: string[];
};

/**
 * Factory-reset production orchestrator:
 * UPLOAD (caller indexes PDF) → READ THE PLANS → CALCULATE / DERIVE / ASSUME
 * → temporary MATERIAL OUTPUT (framing-takeoff.json).
 */
export async function runFramingTakeoff(
  input: RunFramingTakeoffInput,
): Promise<RunFramingTakeoffResult> {
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
    const takeoff = buildFramingTakeoff({
      projectId: input.projectId,
      pdfPath: input.pdfPath,
      construction,
      materials: calculated.materials,
      assumptions: calculated.assumptions,
    });
    const takeoffPath = await writeFramingTakeoff({
      projectId: input.projectId,
      artifactsRoot: input.artifactsRoot,
      takeoff,
    });

    logger.info("Framing takeoff complete", {
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
    logger.error("Framing takeoff failed", { error: message });
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
