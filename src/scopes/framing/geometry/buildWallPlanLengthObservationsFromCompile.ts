import type { CompiledDrawingPage } from "../../../drawing-compiler/schemas/compiledDrawingPage.schema.js";
import type { WallGeometryObservation } from "./wallGeometryObservation.js";

const DIAGNOSTIC_MAX_OBSERVATIONS = 8;

/**
 * Maps compiler governance emit decisions to B2.1 WallGeometryObservation inputs.
 * Does not assign Evidence — caller runs assignLengthEvidenceFromGeometryObservations.
 */
export function buildWallPlanLengthObservationsFromCompileResult(
  compiled: CompiledDrawingPage,
  opts?: { idPrefix?: string; maxObservations?: number },
): WallGeometryObservation[] {
  const prefix = opts?.idPrefix ?? "compiler";
  const maxObservations = opts?.maxObservations ?? Number.POSITIVE_INFINITY;
  const emitSet = new Set(compiled.governance.emitDimIds);
  const observations: WallGeometryObservation[] = [];

  for (const a of compiled.ownership.associations) {
    if (!emitSet.has(a.dimId)) continue;
    if (observations.length >= maxObservations) break;
    if (a.parse?.status !== "ok" || a.parse.feet == null) continue;
    if (!a.physicalRunKey) continue;

    const tx = compiled.transcriptions.find((t) => t.dimId === a.dimId);

    observations.push({
      id: `${prefix}-p${compiled.pageNumber}-${a.dimId}`.replace(
        /[^A-Za-z0-9._:-]/g,
        "-",
      ),
      rawDimensionText: a.parse.originalText ?? a.ocrText ?? "",
      lengthFeet: a.parse.feet,
      authorityMethod: "explicit-dimension",
      targetKind: "physical-run",
      targetPhysicalRunKey: a.physicalRunKey,
      observedWallTypeMark: null,
      sourcePageNumber: compiled.pageNumber,
      sourceTileId: null,
      startAnchorDescription: null,
      endAnchorDescription: null,
      orientation:
        a.orientation === "H"
          ? "horizontal"
          : a.orientation === "V"
            ? "vertical"
            : "unknown",
      isChainSegment: false,
      chainSiblingTexts: [],
      confidenceLabel: "high",
      notes: [
        "drawing-compiler governed wall-plan length",
        `authority=${tx?.authority ?? a.transcriptionAuthority ?? "unknown"}`,
        `source=${a.candidateSource ?? "detected"}`,
        `dim=${a.dimId}`,
        `run=${a.runId ?? "unknown"}`,
        `margin=${a.uniquenessMargin}`,
        `scale=${compiled.governance.scaleByDim[a.dimId]?.status ?? "unknown"}`,
        `pageRole=${compiled.pageRole.role}`,
      ],
    });
  }

  return observations;
}

/** Diagnostic-only cap retained from B2.2J probe runs. */
export const DIAGNOSTIC_OBSERVATION_CAP = DIAGNOSTIC_MAX_OBSERVATIONS;
