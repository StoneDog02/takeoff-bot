import type { Evidence } from "../../../core/schemas/evidence.schema.js";
import type { ObjectId } from "../../../core/schemas/identity.schema.js";
import { sanitizeSubjectKey } from "./ids.js";

export type CanonicalEvidenceCluster = {
  objectId: ObjectId;
  /**
   * Deterministic display/binding key: prefer a raw key that already equals
   * its sanitized form; otherwise lexicographic min of raw keys.
   */
  canonicalSubjectKey: string;
  /** All raw Evidence subjectKeys that mint this ObjectId, sorted. */
  rawSubjectKeys: string[];
  /** Merged Evidence records, stable by subjectKey then Evidence id. */
  records: Evidence[];
};

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function pickCanonicalSubjectKey(rawSubjectKeys: readonly string[]): string {
  const sorted = [...rawSubjectKeys].sort(compareIds);
  const alreadySanitized = sorted.find(
    (key) => key === sanitizeSubjectKey(key),
  );
  return alreadySanitized ?? sorted[0]!;
}

function mergeRecords(
  groups: ReadonlyArray<{ subjectKey: string; records: Evidence[] }>,
): Evidence[] {
  const ordered = [...groups].sort((left, right) =>
    compareIds(left.subjectKey, right.subjectKey),
  );
  const merged: Evidence[] = [];
  for (const group of ordered) {
    const records = [...group.records].sort((left, right) =>
      compareIds(left.id, right.id),
    );
    merged.push(...records);
  }
  return merged;
}

/**
 * Converges Evidence groups that mint the same deterministic ObjectId.
 *
 * Multiple raw subjectKeys may legitimately describe one canonical domain
 * object (e.g. "FLOOR SHEATHING" and "FLOOR-SHEATHING"). Compatible kinds are
 * the caller's responsibility — pass only one subjectKind's groups at a time.
 */
export function convergeEvidenceByCanonicalObjectId(input: {
  groups: ReadonlyMap<string, readonly Evidence[]>;
  createObjectId: (subjectKey: string) => ObjectId;
}): CanonicalEvidenceCluster[] {
  const buckets = new Map<
    ObjectId,
    Array<{ subjectKey: string; records: Evidence[] }>
  >();

  const subjectKeys = [...input.groups.keys()].sort(compareIds);
  for (const subjectKey of subjectKeys) {
    const records = input.groups.get(subjectKey) ?? [];
    const objectId = input.createObjectId(subjectKey);
    const existing = buckets.get(objectId);
    const entry = { subjectKey, records: [...records] };
    if (existing) {
      existing.push(entry);
    } else {
      buckets.set(objectId, [entry]);
    }
  }

  const clusters: CanonicalEvidenceCluster[] = [];
  for (const [objectId, bucketGroups] of [...buckets.entries()].sort(
    ([left], [right]) => compareIds(left, right),
  )) {
    const rawSubjectKeys = bucketGroups
      .map((group) => group.subjectKey)
      .sort(compareIds);
    clusters.push({
      objectId,
      canonicalSubjectKey: pickCanonicalSubjectKey(rawSubjectKeys),
      rawSubjectKeys,
      records: mergeRecords(bucketGroups),
    });
  }

  return clusters;
}

export function formatSubjectKeyConvergenceNote(
  rawSubjectKeys: readonly string[],
  objectId: ObjectId,
): string | null {
  if (rawSubjectKeys.length <= 1) {
    return null;
  }
  const listed = [...rawSubjectKeys]
    .sort(compareIds)
    .map((key) => `"${key}"`)
    .join(", ");
  return `Converged subjectKeys ${listed} → ${objectId}.`;
}
