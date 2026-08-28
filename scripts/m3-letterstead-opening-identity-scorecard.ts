/**
 * M3 Beckstead Subset I scorecard (read-only safety invariants).
 *
 * Asserts frozen M2 artifact stays at:
 * - 73 geometry + 58 semantic openings (131 total)
 * - 0 cross-track merges (no absorbedSubjectKeys spanning opening:p + semantic)
 * - 0 opening material lines
 *
 * Also re-resolves Stage 06 Evidence with current M3 resolveOpenings to prove
 * the live code invents no cross-track merges on this Evidence set.
 *
 * Usage:
 *   npx tsx scripts/m3-letterstead-opening-identity-scorecard.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { Evidence } from "../src/core/schemas/evidence.schema.js";
import { resolveOpenings } from "../src/scopes/framing/resolvers/resolveOpenings.js";

const ARTIFACT_DIR =
  process.env.M3_BECKSTEAD_ARTIFACT_DIR ??
  "artifacts/beckstead-fresh-20260827-144141-m2/framing";

function loadJson(name: string): unknown {
  return JSON.parse(readFileSync(join(ARTIFACT_DIR, name), "utf8"));
}

function isGeometryOpeningId(id: string): boolean {
  return id.includes("opening:p") || id.startsWith("O-opening:p");
}

function isGeometrySubjectKey(key: string): boolean {
  return key.startsWith("opening:p");
}

function countCrossTrackMerges(
  openings: Array<{ id: string; absorbedSubjectKeys?: string[] }>,
): number {
  return openings.filter((opening) => {
    const absorbed = opening.absorbedSubjectKeys ?? [];
    if (absorbed.length === 0) {
      return false;
    }
    const hasGeo =
      isGeometryOpeningId(opening.id) ||
      absorbed.some((key) => isGeometrySubjectKey(key));
    const hasSemantic =
      !isGeometryOpeningId(opening.id) ||
      absorbed.some((key) => !isGeometrySubjectKey(key));
    return hasGeo && hasSemantic;
  }).length;
}

function main(): void {
  const openingsArtifact = loadJson("08-openings.json") as {
    payload: { openings: Array<{ id: string; absorbedSubjectKeys?: string[] }> };
  };
  const calculations = loadJson("14-calculations.json") as {
    payload: {
      materials: Array<{ quantityKey?: string }>;
      pendingClaims: unknown[];
    };
  };
  const evidenceArtifact = loadJson("06-extractedEvidence.json") as {
    payload: { evidence: Evidence[] };
  };

  const openings = openingsArtifact.payload.openings;
  const geometry = openings.filter((opening) => isGeometryOpeningId(opening.id));
  const semantic = openings.filter((opening) => !isGeometryOpeningId(opening.id));
  const crossTrackMerges = countCrossTrackMerges(openings);

  const openingMaterials = calculations.payload.materials.filter((material) =>
    String(material.quantityKey ?? "").startsWith("opening."),
  );

  const liveResolved = resolveOpenings(evidenceArtifact.payload.evidence);
  const liveGeometry = liveResolved.openings.filter((opening) =>
    isGeometryOpeningId(opening.id),
  );
  const liveSemantic = liveResolved.openings.filter(
    (opening) => !isGeometryOpeningId(opening.id),
  );
  const liveCrossTrackMerges = countCrossTrackMerges(liveResolved.openings);
  const liveBindingMerges = liveResolved.openings.filter((opening) =>
    opening.resolutionTraces.some(
      (trace) =>
        trace.propertyPath === "physicalIdentity" &&
        trace.method === "identity-binding-merge",
    ),
  ).length;

  const report = {
    artifactDir: ARTIFACT_DIR,
    frozen: {
      openingCount: openings.length,
      geometryCount: geometry.length,
      semanticCount: semantic.length,
      crossTrackMerges,
      openingMaterialLines: openingMaterials.length,
      pendingClaims: calculations.payload.pendingClaims.length,
    },
    liveResolveFromStage06: {
      openingCount: liveResolved.openings.length,
      geometryCount: liveGeometry.length,
      semanticCount: liveSemantic.length,
      crossTrackMerges: liveCrossTrackMerges,
      identityBindingMerges: liveBindingMerges,
    },
    ok:
      openings.length === 131 &&
      geometry.length === 73 &&
      semantic.length === 58 &&
      crossTrackMerges === 0 &&
      openingMaterials.length === 0 &&
      liveCrossTrackMerges === 0 &&
      liveBindingMerges === 0,
  };

  console.log(JSON.stringify(report, null, 2));

  if (!report.ok) {
    process.exitCode = 1;
  }
}

main();
