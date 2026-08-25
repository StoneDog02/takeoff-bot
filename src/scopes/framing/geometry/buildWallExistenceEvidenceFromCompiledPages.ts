import type { Evidence } from "../../../core/schemas/evidence.schema.js";
import { evidenceSchema } from "../../../core/schemas/evidence.schema.js";
import type { CompiledDrawingPage } from "../../../drawing-compiler/schemas/compiledDrawingPage.schema.js";
import type { PhysicalWallRunRecord } from "../../../drawing-compiler/schemas/physicalWallRun.schema.js";

/**
 * Existence-only Evidence pass: mint a wall subject from corroborated PBG
 * geometry without inventing length, height, bearing, assembly, or level.
 */
export const WALL_EXISTENCE_PASS_ID = "wall-existence-pbg";
export const WALL_EXISTENCE_BUNDLE_ID = "wall-existence";

/** Authority reasons that corroborate geometric wall identity. */
export const WALL_EXISTENCE_CORROBORATING_REASONS = [
  "opening-suspect",
  "multi-junction",
  "thickness-mode",
  "long",
] as const;

export type BuildWallExistenceEvidenceOptions = {
  /**
   * Subject keys that already have `subjectKind:"wall"` Evidence.
   * Existence mint is skipped for these (idempotent; no duplicate subjects).
   */
  existingWallSubjectKeys?: ReadonlySet<string>;
  /**
   * Physical-run keys already referenced by opening `parentPhysicalRunKey`
   * Evidence. Production mint requires this demand signal in addition to
   * geometric corroboration — opening count alone is never sufficient, and
   * geometry alone must not inflate Decision Burden with unused walls.
   */
  openingParentDemandedRunKeys?: ReadonlySet<string>;
};

function evidenceId(physicalRunKey: string): string {
  return `E-${WALL_EXISTENCE_PASS_ID}-${physicalRunKey}`
    .replace(/[^A-Za-z0-9._:-]/g, "-")
    .slice(0, 128);
}

function corroboratingReasonCount(run: PhysicalWallRunRecord): number {
  const reasons = new Set(run.authorityReasons);
  let count = 0;
  for (const reason of WALL_EXISTENCE_CORROBORATING_REASONS) {
    if (reasons.has(reason)) count += 1;
  }
  return count;
}

/**
 * Fail-closed eligibility for wall existence Evidence.
 *
 * - high/medium authority only (reject/low never mint)
 * - multi-signal: high with ≥1 corroborating reason, or medium with ≥2
 * - geometric opening-gap corroboration (PBG gaps), not opening-object count
 * - when demand set provided: run must already be an opening parent referent
 * - caller supplies existing wall subjects to avoid duplicate mint
 */
export function isEligibleWallExistenceRun(
  run: PhysicalWallRunRecord,
  options?: BuildWallExistenceEvidenceOptions,
): boolean {
  if (run.wallAuthority !== "high" && run.wallAuthority !== "medium") {
    return false;
  }
  if (options?.existingWallSubjectKeys?.has(run.physicalRunKey)) {
    return false;
  }
  if (
    options?.openingParentDemandedRunKeys &&
    !options.openingParentDemandedRunKeys.has(run.physicalRunKey)
  ) {
    return false;
  }
  if (run.openingGapSuspects.length === 0) {
    return false;
  }

  const corroborating = corroboratingReasonCount(run);
  if (run.wallAuthority === "high") {
    return corroborating >= 1;
  }
  return corroborating >= 2;
}

function makeExistenceEvidence(
  run: PhysicalWallRunRecord,
  pageNumber: number,
): Evidence {
  const corroborating = corroboratingReasonCount(run);
  return evidenceSchema.parse({
    id: evidenceId(run.physicalRunKey),
    type: "geometry",
    relationship: "supports",
    description:
      `Wall existence from PBG physical run ${run.physicalRunKey} ` +
      `(authority=${run.wallAuthority}, corroboratingReasons=${corroborating}, ` +
      `openingGaps=${run.openingGapSuspects.length})`,
    source: {
      page: {
        documentId: null,
        pageNumber,
        sheetId: null,
        sheetTitle: null,
        pageLabel: null,
        revision: null,
      },
      region: null,
      tileId: null,
      elementLabel: run.physicalRunKey,
      detailNumber: null,
      sectionNumber: null,
      scheduleName: null,
      noteReference: null,
    },
    originalText: run.physicalRunKey,
    references: [],
    subjectKind: "wall",
    subjectKey: run.physicalRunKey,
    propertyPath: "wallType",
    // Knowledge allows "unknown wall" when the object appears to be a wall
    // but type is unresolved. Does not imply wood-stud calculation eligibility.
    candidateValue: "unknown",
    extractionPassId: WALL_EXISTENCE_PASS_ID,
    bundleId: WALL_EXISTENCE_BUNDLE_ID,
  });
}

/**
 * Emit existence-only wall Evidence for corroborated physical runs that have
 * not yet received any wall Evidence subject.
 *
 * Does not invent lengthFeet, height, bearing, assembly, or level/location.
 */
export function buildWallExistenceEvidenceFromCompiledPages(
  pages: readonly CompiledDrawingPage[],
  options?: BuildWallExistenceEvidenceOptions,
): Evidence[] {
  const out: Evidence[] = [];
  const emitted = new Set<string>();

  for (const page of pages) {
    for (const run of page.geometry.pbgRuns) {
      if (!isEligibleWallExistenceRun(run, options)) continue;
      if (emitted.has(run.physicalRunKey)) continue;
      emitted.add(run.physicalRunKey);
      out.push(makeExistenceEvidence(run, page.pageNumber));
    }
  }

  return out;
}

export function wallSubjectKeysFromEvidence(
  evidence: readonly Evidence[],
): Set<string> {
  const keys = new Set<string>();
  for (const record of evidence) {
    if (record.subjectKind === "wall") {
      keys.add(record.subjectKey);
    }
  }
  return keys;
}

/** Run keys demanded by opening parentPhysicalRunKey Evidence. */
export function openingParentDemandedRunKeysFromEvidence(
  evidence: readonly Evidence[],
): Set<string> {
  const keys = new Set<string>();
  for (const record of evidence) {
    if (
      record.subjectKind === "opening" &&
      record.propertyPath === "parentPhysicalRunKey" &&
      typeof record.candidateValue === "string" &&
      record.candidateValue.length > 0
    ) {
      keys.add(record.candidateValue);
    }
  }
  return keys;
}
