import type { ObjectId } from "../../core/schemas/identity.schema.js";
import type { Opening } from "../schemas/opening.schema.js";
import type { StructuralMember } from "../schemas/structural-member.schema.js";
import {
  supportGraphSchema,
  type SupportEdge,
  type SupportGraph,
} from "../schemas/support-graph.schema.js";

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareEdges(left: SupportEdge, right: SupportEdge): number {
  const supportedCmp = compareIds(
    left.supportedPhysicalId,
    right.supportedPhysicalId,
  );
  if (supportedCmp !== 0) {
    return supportedCmp;
  }
  const conditionCmp = compareIds(left.conditionKind, right.conditionKind);
  if (conditionCmp !== 0) {
    return conditionCmp;
  }
  return compareIds(left.supportingPhysicalId, right.supportingPhysicalId);
}

/**
 * Project opening↔header links into SupportGraph edges (spec §16.1).
 *
 * S3-SG-1 scope: only project already-established opening↔header links from
 * linkOpeningHeaderRelationships (headerMemberId + supportedObjectIds).
 *
 * An edge is emitted ONLY when BOTH sides are established:
 * - opening.headerMemberId points at the member
 * - member.supportedObjectIds includes that opening
 *
 * Edge endpoints:
 * - supportedPhysicalId = opening.id (the occurrence ObjectId, NOT the shared
 *   physicalId which may equal the header for purchase-once)
 * - supportingPhysicalId = member.physicalId (header member's canonical id)
 *
 * Does NOT invent joist, beam, post, hanger, panel, or connection edges.
 * Missing header design stays Unresolved, not an invented edge.
 *
 * Idempotent: running this on unchanged construction yields the same edges.
 */
export function buildSupportGraph(
  openings: readonly Opening[],
  structuralMembers: readonly StructuralMember[],
): SupportGraph {
  const membersById = new Map<ObjectId, StructuralMember>(
    structuralMembers.map((member) => [member.id, member]),
  );

  const edgeSet = new Map<string, SupportEdge>();

  for (const opening of openings) {
    if (opening.headerMemberId === null) {
      continue;
    }

    const member = membersById.get(opening.headerMemberId);
    if (!member) {
      continue;
    }

    if (!member.supportedObjectIds.includes(opening.id)) {
      continue;
    }

    const supportedPhysicalId = opening.id;
    const supportingPhysicalId = member.physicalId ?? member.id;

    if (supportedPhysicalId === supportingPhysicalId) {
      continue;
    }

    const edgeKey = `${supportedPhysicalId}|opening-header|${supportingPhysicalId}`;

    if (!edgeSet.has(edgeKey)) {
      edgeSet.set(edgeKey, {
        supportedPhysicalId,
        conditionKind: "opening-header",
        supportingPhysicalId,
      });
    }
  }

  const edges = [...edgeSet.values()].sort(compareEdges);

  return supportGraphSchema.parse({ edges });
}

/**
 * Check whether the SupportGraph has any edges.
 */
export function supportGraphHasEdges(graph: SupportGraph): boolean {
  return graph.edges.length > 0;
}

/**
 * Check whether two SupportGraphs are equivalent.
 */
export function supportGraphsEqual(
  left: SupportGraph,
  right: SupportGraph,
): boolean {
  if (left.edges.length !== right.edges.length) {
    return false;
  }

  return left.edges.every((edge, index) => {
    const other = right.edges[index];
    if (!other) {
      return false;
    }
    return (
      edge.supportedPhysicalId === other.supportedPhysicalId &&
      edge.conditionKind === other.conditionKind &&
      edge.supportingPhysicalId === other.supportingPhysicalId
    );
  });
}
