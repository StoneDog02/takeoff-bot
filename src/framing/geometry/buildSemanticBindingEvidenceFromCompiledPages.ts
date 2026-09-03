import type { CompiledDrawingPage } from "../../compiler/schemas/compiledDrawingPage.schema.js";
import type { PhysicalRunSemanticBinding } from "../../compiler/schemas/semanticBinding.schema.js";
import type { Evidence } from "../../core/schemas/evidence.schema.js";
import { evidenceSchema } from "../../core/schemas/evidence.schema.js";
import {
  BINDING_AUTHORITY_GRADE_PROPERTY_PATH,
  SEMANTIC_BINDING_BUNDLE_ID,
  SEMANTIC_BINDING_PASS_ID,
  SEMANTIC_TYPE_KEY_PROPERTY_PATH,
} from "./semanticBindingConstants.js";

function bindingEvidenceId(binding: PhysicalRunSemanticBinding): string {
  return `E-${binding.bindingId}`.replace(/[^A-Za-z0-9._:-]/g, "-").slice(0, 128);
}

export function assignSemanticBindingEvidence(
  binding: PhysicalRunSemanticBinding,
): Evidence | null {
  if (!binding.emit || binding.status !== "assigned") {
    return null;
  }

  return evidenceSchema.parse({
    id: bindingEvidenceId(binding),
    type: "tag",
    relationship: "supports",
    description: `Semantic type binding ${binding.semanticSubjectKey} → ${binding.physicalRunKey}`,
    source: {
      page: {
        documentId: null,
        pageNumber: binding.sourcePageNumber,
        sheetId: null,
        sheetTitle: null,
        pageLabel: null,
        revision: null,
      },
      region: null,
      tileId: null,
      elementLabel: binding.semanticSubjectKey,
      detailNumber: null,
      sectionNumber: null,
      scheduleName: null,
      noteReference: null,
    },
    originalText: binding.semanticSubjectKey,
    references: [],
    subjectKind: "wall",
    subjectKey: binding.physicalRunKey,
    propertyPath: SEMANTIC_TYPE_KEY_PROPERTY_PATH,
    candidateValue: binding.semanticSubjectKey,
    extractionPassId: SEMANTIC_BINDING_PASS_ID,
    bundleId: SEMANTIC_BINDING_BUNDLE_ID,
  });
}

export function buildSemanticBindingEvidenceFromCompiledPages(
  pages: readonly CompiledDrawingPage[],
): Evidence[] {
  const evidence: Evidence[] = [];
  for (const page of pages) {
    for (const binding of page.semanticBinding.bindings) {
      const typeRecord = assignSemanticBindingEvidence(binding);
      if (typeRecord) {
        evidence.push(typeRecord);
        evidence.push(
          evidenceSchema.parse({
            ...typeRecord,
            id: `${typeRecord.id}-grade`,
            propertyPath: BINDING_AUTHORITY_GRADE_PROPERTY_PATH,
            candidateValue: binding.authorityGrade,
            description: `Binding authority grade for ${binding.semanticSubjectKey}`,
          }),
        );
      }
    }
  }
  return evidence;
}
