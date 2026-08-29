import type { Evidence } from "../../../core/schemas/evidence.schema.js";
import { evidenceSchema } from "../../../core/schemas/evidence.schema.js";
import { OPENING_GEOMETRY_PASS_ID } from "./buildOpeningEvidenceFromCompiledPages.js";
import type { OwnedOpeningMarkBinding } from "./openingGovernanceTypes.js";
import {
  hasExplicitPrintedOpeningDimensions,
  isMarkDecodedOpeningDimensionEvidence,
  isOpeningDimensionPropertyPath,
  openingMarkKeysCompatible,
} from "./openingMarkText.js";

export const OPENING_MARK_ADOPT_PASS_ID = "opening-mark-adopt";

const ADOPTABLE_PROPERTY_PATHS = new Set([
  "category",
  "scheduleReference",
  "detailReference",
  "fireRating",
  "headerMemberTag",
  "dimensions.nominalWidthFeet",
  "dimensions.nominalHeightFeet",
  "dimensions.roughWidthFeet",
  "dimensions.roughHeightFeet",
]);

function isGeometryOpeningSubject(subjectKey: string): boolean {
  return subjectKey.startsWith("opening:p");
}

function isCompilerOpeningEvidence(record: Evidence): boolean {
  return (
    record.extractionPassId === OPENING_GEOMETRY_PASS_ID ||
    record.extractionPassId === OPENING_MARK_ADOPT_PASS_ID ||
    record.bundleId === "opening-geometry" ||
    (typeof record.id === "string" &&
      record.id.includes("opening-geometry-pbg"))
  );
}

function evidenceMatchesOwnedMark(
  record: Evidence,
  markText: string,
): boolean {
  const fields = [
    record.originalText ?? "",
    record.subjectKey,
    record.source.elementLabel ?? "",
  ];
  return fields.some((field) => openingMarkKeysCompatible(markText, field));
}

function isAdoptableRecord(record: Evidence): boolean {
  if (record.subjectKind !== "opening") return false;
  if (isGeometryOpeningSubject(record.subjectKey)) return false;
  if (isCompilerOpeningEvidence(record)) return false;
  if (!ADOPTABLE_PROPERTY_PATHS.has(record.propertyPath)) return false;
  if (record.propertyPath === "category") {
    const value = record.candidateValue;
    if (typeof value !== "string" || value === "unknown" || value === "other/unknown") {
      return false;
    }
  }
  if (isOpeningDimensionPropertyPath(record.propertyPath)) {
    if (isMarkDecodedOpeningDimensionEvidence(record)) return false;
    if (!hasExplicitPrintedOpeningDimensions(record.originalText ?? "")) {
      return false;
    }
  }
  return true;
}

function remintOntoGeometry(
  record: Evidence,
  binding: OwnedOpeningMarkBinding,
): Evidence {
  const safeId = `E-${OPENING_MARK_ADOPT_PASS_ID}-${binding.geometrySubjectKey}-${record.propertyPath}-${record.id}`
    .replace(/[^A-Za-z0-9._:-]/g, "-")
    .slice(0, 128);

  return evidenceSchema.parse({
    ...record,
    id: safeId,
    description: `${record.description} (adopted onto geometry subject via ESTABLISHED mark ownership of ${binding.markText})`,
    subjectKey: binding.geometrySubjectKey,
    source: {
      ...record.source,
      page: {
        ...record.source.page,
        pageNumber: binding.pageNumber,
      },
      elementLabel: binding.geometrySubjectKey,
      noteReference: record.id,
    },
    extractionPassId: OPENING_MARK_ADOPT_PASS_ID,
    bundleId: record.bundleId ?? "opening-mark-adopt",
  });
}

export type AdoptOpeningSemanticEvidenceResult = {
  evidence: Evidence[];
  adoptedSemanticSubjectKeys: string[];
  remintedCount: number;
};

/**
 * Same-subject contribution: when compiler ESTABLISHED mark→gap ownership,
 * remint matching Claude opening Evidence onto the geometry subjectKey and
 * drop the duplicate semantic occurrence cluster for those marks.
 *
 * Matching is by mark token equality (not tile proximity / room names).
 */
export function adoptOpeningSemanticEvidenceOntoGeometry(input: {
  evidence: readonly Evidence[];
  ownedMarks: readonly OwnedOpeningMarkBinding[];
}): AdoptOpeningSemanticEvidenceResult {
  if (input.ownedMarks.length === 0) {
    return {
      evidence: [...input.evidence],
      adoptedSemanticSubjectKeys: [],
      remintedCount: 0,
    };
  }

  const reminted: Evidence[] = [];
  const adoptedSemanticSubjectKeys = new Set<string>();

  for (const binding of input.ownedMarks) {
    // Literal category already emitted by geometry pass — still adopt dims/etc.
    for (const record of input.evidence) {
      if (!isAdoptableRecord(record)) continue;
      if (!evidenceMatchesOwnedMark(record, binding.markText)) continue;

      // Prefer not to overwrite an already-emitted literal category with a conflicting Claude value
      // when the geometry pass already has a non-unknown category from the same mark label.
      if (
        record.propertyPath === "category" &&
        binding.literalCategory != null &&
        record.candidateValue !== binding.literalCategory
      ) {
        adoptedSemanticSubjectKeys.add(record.subjectKey);
        continue;
      }

      reminted.push(remintOntoGeometry(record, binding));
      adoptedSemanticSubjectKeys.add(record.subjectKey);
    }
  }

  const filtered = input.evidence.filter((record) => {
    if (record.subjectKind !== "opening") return true;
    if (!adoptedSemanticSubjectKeys.has(record.subjectKey)) return true;
    // Drop the whole semantic occurrence cluster once any property was adopted.
    return false;
  });

  return {
    evidence: [...filtered, ...reminted],
    adoptedSemanticSubjectKeys: [...adoptedSemanticSubjectKeys].sort(),
    remintedCount: reminted.length,
  };
}
