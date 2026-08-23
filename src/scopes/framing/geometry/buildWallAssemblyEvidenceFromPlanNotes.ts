import type { Evidence } from "../../../core/schemas/evidence.schema.js";
import { evidenceSchema } from "../../../core/schemas/evidence.schema.js";
import type { CompiledDrawingPage } from "../../../drawing-compiler/schemas/compiledDrawingPage.schema.js";
import type { PhysicalWallRunRecord } from "../../../drawing-compiler/schemas/physicalWallRun.schema.js";
import type { GovernedProjectDictionary } from "../../../project-interpreter/schemas/projectDictionary.schema.js";
import {
  classifyStudSizeFromThicknessInches,
  extractWallAssemblyPlanNoteFacts,
  type WallAssemblyNoteFacts,
} from "./extractWallAssemblyPlanNoteFacts.js";

export const WALL_ASSEMBLY_NOTE_PASS_ID = "wall-assembly-plan-note";
export const WALL_ASSEMBLY_THICKNESS_PASS_ID = "wall-assembly-thickness-legend";
export const WALL_ASSEMBLY_GEOMETRY_LENGTH_PASS_ID =
  "wall-assembly-geometry-length";

/** Nominal 1/4"=1'-0" residential plan scale in PDF points per foot. */
const QUARTER_INCH_SCALE_PT_PER_FT = 18;

export type BuildWallAssemblyEvidenceInput = {
  pages: readonly CompiledDrawingPage[];
  /** Concatenated OCR / native note text from orientation scan or live OCR. */
  noteTexts: readonly string[];
  dictionary?: GovernedProjectDictionary | null;
};

function evidenceId(runKey: string, propertyPath: string, pass: string): string {
  return `E-${pass}-${runKey}-${propertyPath}`
    .replace(/[^A-Za-z0-9._:-]/g, "-")
    .slice(0, 128);
}

function sourceForPage(pageNumber: number, elementLabel: string) {
  return {
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
    elementLabel,
    detailNumber: null,
    sectionNumber: null,
    scheduleName: null,
    noteReference: "NOTES TO PLAN / General Structural Notes",
  };
}

function shearBoundRunKeys(
  dictionary: GovernedProjectDictionary | null | undefined,
): Set<string> {
  const keys = new Set<string>();
  if (!dictionary) return keys;
  for (const b of dictionary.bindings) {
    if (b.status !== "established_binding") continue;
    if (!b.physicalRunKey || !b.referenceKey) continue;
    if (/shear/i.test(b.referenceKey) || /^SW\d/i.test(b.referenceKey)) {
      keys.add(b.physicalRunKey);
    }
  }
  return keys;
}

function scaleCandidates(page: CompiledDrawingPage): number[] {
  const out: number[] = [];
  if (page.ptPerFt != null && page.ptPerFt > 0) out.push(page.ptPerFt);
  if (!out.includes(QUARTER_INCH_SCALE_PT_PER_FT)) {
    out.push(QUARTER_INCH_SCALE_PT_PER_FT);
  }
  return out;
}

function classifyRunStudSize(
  run: PhysicalWallRunRecord,
  page: CompiledDrawingPage,
  legend: NonNullable<WallAssemblyNoteFacts["thicknessLegend"]>,
): { size: "2x4" | "2x6"; inches: number; pointsPerFoot: number } | null {
  if (run.thicknessPt == null || run.thicknessPt <= 0) return null;
  for (const ppf of scaleCandidates(page)) {
    const inches = (run.thicknessPt / ppf) * 12;
    const size = classifyStudSizeFromThicknessInches(inches, legend);
    if (size) return { size, inches, pointsPerFoot: ppf };
  }
  return null;
}

function hasDimLengthEvidence(
  page: CompiledDrawingPage,
  physicalRunKey: string,
): boolean {
  const emitSet = new Set(page.governance.emitDimIds);
  return page.ownership.associations.some(
    (a) =>
      a.physicalRunKey === physicalRunKey &&
      emitSet.has(a.dimId) &&
      a.parse?.status === "ok" &&
      a.parse.feet != null,
  );
}

function makeEvidence(input: {
  id: string;
  passId: string;
  pageNumber: number;
  subjectKey: string;
  propertyPath: string;
  candidateValue: string | number | boolean | null;
  description: string;
  originalText: string;
  type: "note" | "geometry";
}): Evidence {
  return evidenceSchema.parse({
    id: input.id,
    type: input.type,
    relationship: "supports",
    description: input.description,
    source: sourceForPage(input.pageNumber, input.subjectKey),
    originalText: input.originalText,
    references: [],
    subjectKind: "wall",
    subjectKey: input.subjectKey,
    propertyPath: input.propertyPath,
    candidateValue: input.candidateValue,
    extractionPassId: input.passId,
    bundleId: "wall-assembly",
  });
}

function isPlanLayoutPage(page: CompiledDrawingPage): boolean {
  if (page.pageRole.role === "plan") return true;
  // Empty-text Beckstead pages classify as unknown; require dim-owned length
  // emissions so schedule/elevation sheets without plan dims are excluded.
  return page.governance.emitDimIds.length > 0;
}

/**
 * Build wall assembly Evidence from plan-note facts + PBG thickness legend mapping.
 *
 * Only emits wood-assembly properties for plan-layout pages, and only for:
 * - shear-bound physical runs (explicit note includes shear), or
 * - runs whose drawn thickness classifies as 2x4/2x6 per the plan legend
 *   (avoids applying stud spacing/plates to concrete foundation walls).
 *
 * When a wood thickness classification succeeds and no dim length is owned,
 * also emits lengthFeet from calibrated PBG lengthPt (document scale), which is
 * measurement — not an industry default.
 */
export function buildWallAssemblyEvidenceFromPlanNotes(
  input: BuildWallAssemblyEvidenceInput,
): Evidence[] {
  const facts = extractWallAssemblyPlanNoteFacts(input.noteTexts);
  if (
    facts.studSpacingInches == null &&
    facts.doubleTopPlatesFor.length === 0 &&
    facts.thicknessLegend == null
  ) {
    return [];
  }

  const shearKeys = shearBoundRunKeys(input.dictionary);
  const out: Evidence[] = [];
  const excerpt = facts.sourceExcerpts[0] ?? "wall assembly plan note";

  for (const page of input.pages) {
    if (!isPlanLayoutPage(page)) continue;
    for (const run of page.geometry.pbgRuns) {
      if (run.wallAuthority === "reject") continue;
      const key = run.physicalRunKey;
      const isShear = shearKeys.has(key);
      const woodClass =
        facts.thicknessLegend != null
          ? classifyRunStudSize(run, page, facts.thicknessLegend)
          : null;
      const isWoodAssemblySubject = isShear || woodClass != null;
      if (!isWoodAssemblySubject) continue;

      if (woodClass) {
        out.push(
          makeEvidence({
            id: evidenceId(key, "assembly.studSize", "thickness"),
            passId: WALL_ASSEMBLY_THICKNESS_PASS_ID,
            pageNumber: page.pageNumber,
            subjectKey: key,
            propertyPath: "assembly.studSize",
            candidateValue: woodClass.size,
            description: `Stud size ${woodClass.size} from drawn thickness ${woodClass.inches.toFixed(2)}" via plan thickness legend (scale ${woodClass.pointsPerFoot.toFixed(2)} pt/ft)`,
            originalText: excerpt,
            type: "geometry",
          }),
        );
        out.push(
          makeEvidence({
            id: evidenceId(key, "wallType", "thickness"),
            passId: WALL_ASSEMBLY_THICKNESS_PASS_ID,
            pageNumber: page.pageNumber,
            subjectKey: key,
            propertyPath: "wallType",
            candidateValue: "wood-stud-wall",
            description:
              "Wall type wood-stud-wall from plan thickness legend (2x4/2x6 drawn thickness)",
            originalText: excerpt,
            type: "geometry",
          }),
        );

        if (
          !hasDimLengthEvidence(page, key) &&
          run.lengthPt > 0 &&
          woodClass.pointsPerFoot > 0
        ) {
          const lengthFeet = run.lengthPt / woodClass.pointsPerFoot;
          if (lengthFeet >= 2 && lengthFeet <= 120) {
            out.push(
              makeEvidence({
                id: evidenceId(key, "lengthFeet", "geom-length"),
                passId: WALL_ASSEMBLY_GEOMETRY_LENGTH_PASS_ID,
                pageNumber: page.pageNumber,
                subjectKey: key,
                propertyPath: "lengthFeet",
                candidateValue: Number(lengthFeet.toFixed(4)),
                description: `Segment length from PBG lengthPt at plan scale ${woodClass.pointsPerFoot.toFixed(2)} pt/ft (wood wall via thickness legend)`,
                originalText: excerpt,
                type: "geometry",
              }),
            );
          }
        }
      }

      if (
        facts.studSpacingInches != null &&
        facts.studSpacingAppliesTo.includes("shear")
      ) {
        out.push(
          makeEvidence({
            id: evidenceId(key, "assembly.studSpacingInches", "note"),
            passId: WALL_ASSEMBLY_NOTE_PASS_ID,
            pageNumber: page.pageNumber,
            subjectKey: key,
            propertyPath: "assembly.studSpacingInches",
            candidateValue: facts.studSpacingInches,
            description: `Plan note stud spacing ${facts.studSpacingInches}" O.C. for bearing/shear/braced`,
            originalText: excerpt,
            type: "note",
          }),
        );
      }

      if (facts.doubleTopPlatesFor.length > 0) {
        out.push(
          makeEvidence({
            id: evidenceId(key, "assembly.plateCount", "note"),
            passId: WALL_ASSEMBLY_NOTE_PASS_ID,
            pageNumber: page.pageNumber,
            subjectKey: key,
            propertyPath: "assembly.plateCount",
            candidateValue: 3,
            description:
              "Double top plates (plan note) + single bottom plate (Construction Brain conventional default)",
            originalText: excerpt,
            type: "note",
          }),
        );
      }
    }
  }

  return out;
}

export function summarizeNoteFactsForAudit(
  facts: WallAssemblyNoteFacts,
): Record<string, unknown> {
  return {
    studSpacingInches: facts.studSpacingInches,
    studSpacingAppliesTo: facts.studSpacingAppliesTo,
    doubleTopPlatesFor: facts.doubleTopPlatesFor,
    thicknessLegend: facts.thicknessLegend,
    sourceExcerptCount: facts.sourceExcerpts.length,
  };
}
