import type { Evidence } from "../../../core/schemas/evidence.schema.js";
import { evidenceSchema } from "../../../core/schemas/evidence.schema.js";
import type {
  GovernedProjectDictionary,
  ProjectReferenceBinding,
} from "../../../project-interpreter/schemas/projectDictionary.schema.js";
import {
  BINDING_AUTHORITY_GRADE_PROPERTY_PATH,
  SEMANTIC_TYPE_KEY_PROPERTY_PATH,
} from "./semanticBindingConstants.js";

export const PROJECT_DICTIONARY_BINDING_PASS_ID = "project-orientation-binding";
export const PROJECT_DICTIONARY_BINDING_BUNDLE_ID = "project-dictionary";

const SUBTYPE_REFERENCE_KEY_PATTERN = /^SW\d/i;

function bindingEvidenceId(physicalRunKey: string, propertyPath: string): string {
  return `E-dict-${physicalRunKey}-${propertyPath}`
    .replace(/[^A-Za-z0-9._:-]/g, "-")
    .slice(0, 128);
}

function sourcePageFromBinding(binding: ProjectReferenceBinding): number {
  const withPage = binding.provenance.find((ref) => ref.pageNumber != null);
  return withPage?.pageNumber ?? 1;
}

function authorityGradeForMechanism(mechanism: string): "A" | "B" {
  return mechanism === "graphic-convention" ? "B" : "A";
}

function baseSource(binding: ProjectReferenceBinding, pageNumber: number) {
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
    elementLabel: binding.referenceKey ?? binding.physicalRunKey,
    detailNumber: null,
    sectionNumber: null,
    scheduleName: null,
    noteReference: null,
  };
}

/**
 * Emit governed dictionary established_binding facts as Evidence.
 * Class bindings use wallType / isShearOrBraced — never semanticTypeKey (no SW4 inheritance).
 * Subtype bindings (SW*) use semanticTypeKey + bindingAuthorityGrade.
 */
export function assignProjectDictionaryBindingEvidence(
  binding: ProjectReferenceBinding,
): Evidence[] {
  if (binding.status !== "established_binding") {
    return [];
  }
  if (!binding.physicalRunKey || !binding.referenceKey) {
    return [];
  }

  const pageNumber = sourcePageFromBinding(binding);
  const referenceKey = binding.referenceKey;
  const physicalRunKey = binding.physicalRunKey;
  const source = baseSource(binding, pageNumber);

  if (SUBTYPE_REFERENCE_KEY_PATTERN.test(referenceKey)) {
    const grade = authorityGradeForMechanism(binding.mechanism);
    return [
      evidenceSchema.parse({
        id: bindingEvidenceId(physicalRunKey, SEMANTIC_TYPE_KEY_PROPERTY_PATH),
        type: "tag",
        relationship: "supports",
        description: `Dictionary subtype binding ${referenceKey} → ${physicalRunKey}`,
        source,
        originalText: referenceKey,
        references: [],
        subjectKind: "wall",
        subjectKey: physicalRunKey,
        propertyPath: SEMANTIC_TYPE_KEY_PROPERTY_PATH,
        candidateValue: referenceKey,
        extractionPassId: PROJECT_DICTIONARY_BINDING_PASS_ID,
        bundleId: PROJECT_DICTIONARY_BINDING_BUNDLE_ID,
      }),
      evidenceSchema.parse({
        id: bindingEvidenceId(physicalRunKey, BINDING_AUTHORITY_GRADE_PROPERTY_PATH),
        type: "tag",
        relationship: "supports",
        description: `Dictionary binding authority for ${referenceKey}`,
        source,
        originalText: grade,
        references: [],
        subjectKind: "wall",
        subjectKey: physicalRunKey,
        propertyPath: BINDING_AUTHORITY_GRADE_PROPERTY_PATH,
        candidateValue: grade,
        extractionPassId: PROJECT_DICTIONARY_BINDING_PASS_ID,
        bundleId: PROJECT_DICTIONARY_BINDING_BUNDLE_ID,
      }),
    ];
  }

  const records: Evidence[] = [
    evidenceSchema.parse({
      id: bindingEvidenceId(physicalRunKey, "wallType"),
      type: "tag",
      relationship: "supports",
      description: `Dictionary class binding ${referenceKey} → ${physicalRunKey}`,
      source,
      originalText: referenceKey,
      references: [],
      subjectKind: "wall",
      subjectKey: physicalRunKey,
      propertyPath: "wallType",
      candidateValue: referenceKey,
      extractionPassId: PROJECT_DICTIONARY_BINDING_PASS_ID,
      bundleId: PROJECT_DICTIONARY_BINDING_BUNDLE_ID,
    }),
  ];

  if (referenceKey.toLowerCase().includes("shear")) {
    records.push(
      evidenceSchema.parse({
        id: bindingEvidenceId(physicalRunKey, "isShearOrBraced"),
        type: "tag",
        relationship: "supports",
        description: `Dictionary shear class on ${physicalRunKey}`,
        source,
        originalText: "true",
        references: [],
        subjectKind: "wall",
        subjectKey: physicalRunKey,
        propertyPath: "isShearOrBraced",
        candidateValue: true,
        extractionPassId: PROJECT_DICTIONARY_BINDING_PASS_ID,
        bundleId: PROJECT_DICTIONARY_BINDING_BUNDLE_ID,
      }),
    );
  }

  return records;
}

export function buildProjectDictionaryBindingEvidence(
  dictionary: GovernedProjectDictionary,
): Evidence[] {
  const evidence: Evidence[] = [];
  for (const binding of dictionary.bindings) {
    evidence.push(...assignProjectDictionaryBindingEvidence(binding));
  }
  return evidence;
}
