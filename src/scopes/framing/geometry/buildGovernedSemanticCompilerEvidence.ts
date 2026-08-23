import type { CompiledDrawingPage } from "../../../drawing-compiler/schemas/compiledDrawingPage.schema.js";
import type { Evidence } from "../../../core/schemas/evidence.schema.js";
import type { GovernedProjectDictionary } from "../../../project-interpreter/schemas/projectDictionary.schema.js";
import { buildProjectDictionaryBindingEvidence } from "./buildProjectDictionaryBindingEvidence.js";
import { buildSemanticDefinitionEvidenceFromCompiledPages } from "./buildSemanticDefinitionEvidenceFromCompiledPages.js";
import { buildWallAssemblyEvidenceFromPlanNotes } from "./buildWallAssemblyEvidenceFromPlanNotes.js";

export type BuildGovernedSemanticCompilerEvidenceOptions = {
  noteTexts?: readonly string[];
};

/**
 * Production Stage 6 semantic compiler Evidence:
 * schedule definitions + governed dictionary bindings + wall-assembly plan notes.
 */
export function buildGovernedSemanticCompilerEvidence(
  pages: readonly CompiledDrawingPage[],
  dictionary: GovernedProjectDictionary | null,
  options?: BuildGovernedSemanticCompilerEvidenceOptions,
): Evidence[] {
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
  return [...definitionEvidence, ...dictionaryEvidence, ...wallAssemblyEvidence];
}
