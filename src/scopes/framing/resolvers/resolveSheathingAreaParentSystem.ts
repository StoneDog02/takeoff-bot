import type { Evidence } from "../../../core/schemas/evidence.schema.js";
import type { PropertyResolutionTrace } from "../../../core/schemas/resolved-object.schema.js";
import { createSheathingSystemObjectId } from "./ids.js";
import {
  parentSystemLinkTrace as sharedParentSystemLinkTrace,
  resolveEvidenceBackedParentSystemLink,
  type EvidenceBackedParentSystemLink,
  type EvidenceBackedParentSystemLinkMethod,
} from "./resolveEvidenceBackedParentSystemLink.js";

export type SheathingParentSystemLinkMethod = EvidenceBackedParentSystemLinkMethod;

export type SheathingParentSystemLink = EvidenceBackedParentSystemLink;

/**
 * Recover sheathing area → system ownership with evidence-backed corroboration tiers.
 * Returns null when authority is ambiguous — fail closed.
 */
export function resolveSheathingAreaParentSystemLink(input: {
  areaSubjectKey: string;
  areaRecords: readonly Evidence[];
  explicitParentSystemTag: string | null;
  systemCandidates: ReadonlyArray<{
    subjectKey: string;
    records: readonly Evidence[];
  }>;
}): SheathingParentSystemLink | null {
  return resolveEvidenceBackedParentSystemLink({
    ...input,
    createSystemObjectId: createSheathingSystemObjectId,
    domainLabel: "sheathing",
  });
}

export function parentSystemLinkTrace(
  link: SheathingParentSystemLink,
): PropertyResolutionTrace {
  return sharedParentSystemLinkTrace(link);
}
