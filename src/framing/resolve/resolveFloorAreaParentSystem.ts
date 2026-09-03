import type { Evidence } from "../../core/schemas/evidence.schema.js";
import type { PropertyResolutionTrace } from "../../core/schemas/resolved-object.schema.js";
import { createFloorFramingSystemObjectId } from "./ids.js";
import {
  parentSystemLinkTrace as sharedParentSystemLinkTrace,
  resolveEvidenceBackedParentSystemLink,
  type EvidenceBackedParentSystemLink,
  type EvidenceBackedParentSystemLinkMethod,
} from "./resolveEvidenceBackedParentSystemLink.js";

export type FloorParentSystemLinkMethod = EvidenceBackedParentSystemLinkMethod;

export type FloorParentSystemLink = EvidenceBackedParentSystemLink;

/**
 * Recover floor area → system ownership with evidence-backed corroboration tiers.
 * Returns null when authority is ambiguous — fail closed.
 */
export function resolveFloorAreaParentSystemLink(input: {
  areaSubjectKey: string;
  areaRecords: readonly Evidence[];
  explicitParentSystemTag: string | null;
  systemCandidates: ReadonlyArray<{
    subjectKey: string;
    records: readonly Evidence[];
  }>;
}): FloorParentSystemLink | null {
  return resolveEvidenceBackedParentSystemLink({
    ...input,
    createSystemObjectId: createFloorFramingSystemObjectId,
    domainLabel: "floor",
  });
}

export function parentSystemLinkTrace(
  link: FloorParentSystemLink,
): PropertyResolutionTrace {
  return sharedParentSystemLinkTrace(link);
}
