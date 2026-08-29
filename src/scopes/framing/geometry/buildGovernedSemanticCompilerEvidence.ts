import type { CompiledDrawingPage } from "../../../drawing-compiler/schemas/compiledDrawingPage.schema.js";
import type { Evidence } from "../../../core/schemas/evidence.schema.js";
import type { GovernedProjectDictionary } from "../../../project-interpreter/schemas/projectDictionary.schema.js";
import { isOpeningGeometryEnabled } from "../compiler/isOpeningGeometryEnabled.js";
import { buildOpeningEvidenceWithMarkOwnership } from "./buildOpeningEvidenceFromCompiledPages.js";
import { buildProjectDictionaryBindingEvidence } from "./buildProjectDictionaryBindingEvidence.js";
import { buildSemanticDefinitionEvidenceFromCompiledPages } from "./buildSemanticDefinitionEvidenceFromCompiledPages.js";
import { buildWallAssemblyEvidenceFromPlanNotes } from "./buildWallAssemblyEvidenceFromPlanNotes.js";
import type { OwnedOpeningMarkBinding } from "./openingGovernanceTypes.js";

export type BuildGovernedSemanticCompilerEvidenceOptions = {
  noteTexts?: readonly string[];
};

export type GovernedSemanticCompilerEvidenceBuild = {
  evidence: Evidence[];
  ownedOpeningMarks: OwnedOpeningMarkBinding[];
};

/**
 * Production Stage 6 semantic compiler Evidence:
 * schedule definitions + governed dictionary bindings + wall-assembly plan notes
 * + opening geometry (when gated).
 */
export function buildGovernedSemanticCompilerEvidence(
  pages: readonly CompiledDrawingPage[],
  dictionary: GovernedProjectDictionary | null,
  options?: BuildGovernedSemanticCompilerEvidenceOptions,
): Evidence[] {
  return buildGovernedSemanticCompilerEvidenceWithOwnership(
    pages,
    dictionary,
    options,
  ).evidence;
}

export function buildGovernedSemanticCompilerEvidenceWithOwnership(
  pages: readonly CompiledDrawingPage[],
  dictionary: GovernedProjectDictionary | null,
  options?: BuildGovernedSemanticCompilerEvidenceOptions,
): GovernedSemanticCompilerEvidenceBuild {
  const definitionEvidence = buildSemanticDefinitionEvidenceFromCompiledPages(pages);
  const dictionaryEvidence = dictionary
    ? buildProjectDictionaryBindingEvidence(dictionary)
    : [];
  const wallAssemblyEvidence =
    options?.noteTexts && options.noteTexts.length > 0
      ? buildWallAssemblyEvidenceFromPlanNotes({
          pages,
          noteTexts: options.noteTexts,
          dictionary,
        })
      : [];
  const openingBuild = isOpeningGeometryEnabled()
    ? buildOpeningEvidenceWithMarkOwnership(pages)
    : { evidence: [], ownedMarks: [] };
  return {
    evidence: [
      ...definitionEvidence,
      ...dictionaryEvidence,
      ...wallAssemblyEvidence,
      ...openingBuild.evidence,
    ],
    ownedOpeningMarks: openingBuild.ownedMarks,
  };
}
