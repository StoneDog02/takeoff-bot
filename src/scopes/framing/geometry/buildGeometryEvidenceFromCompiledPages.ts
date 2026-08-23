import type { CompiledDrawingPage } from "../../../drawing-compiler/schemas/compiledDrawingPage.schema.js";
import { assignLengthEvidenceFromGeometryObservations } from "./assignLengthEvidenceFromGeometryObservation.js";
import { buildWallPlanLengthObservationsFromCompileResult } from "./buildWallPlanLengthObservationsFromCompile.js";
import type { Evidence } from "../../../core/schemas/evidence.schema.js";

export function buildGeometryEvidenceFromCompiledPages(
  pages: readonly CompiledDrawingPage[],
  opts?: { maxObservationsPerPage?: number },
): Evidence[] {
  const observations = pages.flatMap((page) =>
    buildWallPlanLengthObservationsFromCompileResult(page, {
      maxObservations: opts?.maxObservationsPerPage,
    }),
  );
  const { evidence } = assignLengthEvidenceFromGeometryObservations(observations);
  return evidence;
}
