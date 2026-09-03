import type { Evidence } from "../../core/schemas/evidence.schema.js";
import type { PropertyResolutionTrace } from "../../core/schemas/resolved-object.schema.js";
import { createRoofFramingSystemObjectId } from "./ids.js";
import {
  parentSystemLinkTrace as sharedParentSystemLinkTrace,
  resolveEvidenceBackedParentSystemLink,
  type EvidenceBackedParentSystemLink,
  type EvidenceBackedParentSystemLinkMethod,
} from "./resolveEvidenceBackedParentSystemLink.js";

export type RoofParentSystemLinkMethod = EvidenceBackedParentSystemLinkMethod;

export type RoofParentSystemLink = EvidenceBackedParentSystemLink;

/**
 * Recover roof plane → system ownership from explicit parentSystemTag Evidence only.
 * Returns null when authority is missing or ambiguous — fail closed.
 */
export function resolveRoofPlaneParentSystemLink(input: {
  planeSubjectKey: string;
  planeRecords: readonly Evidence[];
  explicitParentSystemTag: string | null;
  systemCandidates: ReadonlyArray<{
    subjectKey: string;
    records: readonly Evidence[];
  }>;
}): RoofParentSystemLink | null {
  return resolveEvidenceBackedParentSystemLink({
    areaSubjectKey: input.planeSubjectKey,
    areaRecords: input.planeRecords,
    explicitParentSystemTag: input.explicitParentSystemTag,
    systemCandidates: input.systemCandidates,
    createSystemObjectId: createRoofFramingSystemObjectId,
    domainLabel: "roof",
  });
}

export function parentSystemLinkTrace(
  link: RoofParentSystemLink,
): PropertyResolutionTrace {
  return sharedParentSystemLinkTrace(link);
}
