import { z } from "zod";

import { objectIdSchema } from "../../core/schemas/identity.schema.js";

/**
 * Bearing/support condition kind for an edge in the SupportGraph.
 *
 * This enum captures the structural relationship between supported and
 * supporting objects. V1 scope is limited to opening↔header relationships.
 */
export const supportConditionKindSchema = z.enum([
  "opening-header",
]);

/**
 * Single edge in the SupportGraph (spec §16.1).
 *
 * Shape: supported → bearing/support condition → supporting
 *
 * Both supportedPhysicalId and supportingPhysicalId reference the canonical
 * physicalId from the resolved construction bag (spec §32.2).
 */
export const supportEdgeSchema = z.object({
  supportedPhysicalId: objectIdSchema,
  conditionKind: supportConditionKindSchema,
  supportingPhysicalId: objectIdSchema,
});

/**
 * SupportGraph is shared infrastructure for bearing/support relationships
 * (spec §16.1). It is reused by floors, beams/posts, roofs, panels, stairs,
 * decks, and connections.
 *
 * V1 S3-SG-1 scope: only project already-established opening↔header links
 * from linkOpeningHeaderRelationships. No joist/beam/post/hanger/panel/
 * connection edges are invented.
 *
 * The graph is keyed by physicalId and is idempotent: running the projection
 * repeatedly on unchanged construction yields the same edge population.
 */
export const supportGraphSchema = z.object({
  edges: z.array(supportEdgeSchema).default([]),
});

export type SupportConditionKind = z.infer<typeof supportConditionKindSchema>;
export type SupportEdge = z.infer<typeof supportEdgeSchema>;
export type SupportGraph = z.infer<typeof supportGraphSchema>;
