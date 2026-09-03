import type { Evidence } from "../core/schemas/evidence.schema.js";
import { evidenceIdSchema } from "../core/schemas/identity.schema.js";
import type { ExtractionPassEvidenceStamp } from "./ExtractionPageBundle.js";

/**
 * Aggregates Evidence from multiple scoped extraction passes into one
 * project-level Evidence list. Does not resolve objects — Resolution remains
 * responsible for corroboration/conflict across the combined graph.
 *
 * Duplicate Evidence IDs *within* a single pass fail loudly.
 * Duplicate IDs *across* passes are remapped by appending
 * `:${extractionPassId}` so repeated observations (e.g. shared global
 * schedule facts seen in sequential primary bundles) are preserved with
 * distinct provenance. Downstream Resolution still groups by subjectKey —
 * repeated observations corroborate; they do not mint separate objects or
 * double quantities.
 */
export function aggregateExtractionEvidencePasses(input: {
  passes: Array<{
    stamp: ExtractionPassEvidenceStamp;
    evidence: readonly Evidence[];
  }>;
}): Evidence[] {
  const aggregated: Evidence[] = [];
  const seenIds = new Set<string>();

  for (const pass of input.passes) {
    const idsInPass = new Set<string>();

    for (const record of pass.evidence) {
      if (idsInPass.has(record.id)) {
        throw new Error(
          `aggregateExtractionEvidencePasses: duplicate evidence id '${record.id}' within extraction pass '${pass.stamp.extractionPassId}'.`,
        );
      }
      idsInPass.add(record.id);

      let id = record.id;
      if (seenIds.has(id)) {
        const remapped = `${id}:${pass.stamp.extractionPassId}`;
        const parsed = evidenceIdSchema.safeParse(remapped);
        if (!parsed.success) {
          throw new Error(
            `aggregateExtractionEvidencePasses: cannot remap duplicate evidence id '${id}' with pass '${pass.stamp.extractionPassId}' (${parsed.error.message}).`,
          );
        }
        if (seenIds.has(remapped)) {
          throw new Error(
            `aggregateExtractionEvidencePasses: remapped evidence id '${remapped}' still collides.`,
          );
        }
        id = parsed.data;
      }
      seenIds.add(id);

      aggregated.push({
        ...record,
        id,
        extractionPassId: pass.stamp.extractionPassId,
        bundleId: pass.stamp.bundleId,
      });
    }
  }

  return aggregated;
}

/**
 * Groups aggregated Evidence that share the same semantic candidate identity
 * (subjectKind + subjectKey + propertyPath + candidateValue + source page).
 * Multiple records in one group are repeated/corroborating observations
 * (often shared-global pages across sequential passes), not separate objects.
 */
export function groupRepeatedEvidenceObservations(
  evidence: readonly Evidence[],
): Array<{
  key: string;
  records: Evidence[];
}> {
  const groups = new Map<string, Evidence[]>();

  for (const record of evidence) {
    const key = [
      record.subjectKind,
      record.subjectKey,
      record.propertyPath,
      JSON.stringify(record.candidateValue),
      `p${record.source.page.pageNumber}`,
    ].join("|");
    const existing = groups.get(key);
    if (existing) {
      existing.push(record);
    } else {
      groups.set(key, [record]);
    }
  }

  return [...groups.entries()]
    .map(([key, records]) => ({ key, records }))
    .filter((group) => group.records.length > 1)
    .sort((left, right) => (left.key < right.key ? -1 : 1));
}
