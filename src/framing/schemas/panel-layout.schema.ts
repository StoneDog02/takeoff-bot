import { z } from "zod";

import { objectIdSchema } from "../../core/schemas/identity.schema.js";

/**
 * Edge classification for a physical panel piece (spec §18–19 Surface-to-Panel).
 *
 * - `supported`: edge rests on a support member (stud/joist from S4-LY-1 positions)
 * - `perimeter`: edge at the boundary of the sheathed surface
 * - `opening`: edge along an opening cutout
 * - `unsupported`: interior seam not over a support member
 *
 * Per ticket S4-PN-1:
 * - Classify using S4-LY-1 support positions when present
 * - Unsupported edges emit requirement/Unresolved — do NOT mint blocking or H-clips
 * - Do NOT add panel edges to SupportGraph
 */
export const panelEdgeClassificationSchema = z.enum([
  "supported",
  "perimeter",
  "opening",
  "unsupported",
]);

/**
 * A single edge of a physical panel piece with classification and position.
 */
export const panelEdgeSchema = z.object({
  side: z.enum(["top", "bottom", "left", "right"]),
  classification: panelEdgeClassificationSchema,
  startInches: z.number().finite().nonnegative(),
  endInches: z.number().finite().nonnegative(),
  supportMemberIds: z.array(objectIdSchema).default([]),
});

/**
 * Physical panel piece materialized by the Panel Layout Engine (spec §18–19).
 *
 * A piece represents a single cut or full panel placed on a sheathed surface.
 * Remnants from cuts are tracked separately for potential reuse (Wave 15 purchasing).
 *
 * Per ticket S4-PN-1:
 * - Materialize physical panel pieces (cuts/remnants)
 * - Clip to known opening geometry
 * - Do NOT invent panel 4×8 when dimensions are missing
 */
export const physicalPanelPieceSchema = z.object({
  id: objectIdSchema,
  parentAreaId: objectIdSchema,

  originXInches: z.number().finite().nonnegative(),
  originYInches: z.number().finite().nonnegative(),
  widthInches: z.number().finite().positive(),
  heightInches: z.number().finite().positive(),

  isRemnant: z.boolean().default(false),
  isCut: z.boolean().default(false),

  edges: z.array(panelEdgeSchema).default([]),

  openingCutIds: z.array(objectIdSchema).default([]),
});

/**
 * Unsupported edge requirement emitted when panel layout finds an interior
 * seam not over a support member.
 *
 * Per spec §16.4 Requirement convergence:
 * - Panel layout discovers an unsupported edge
 * - A requirement is emitted (blocking/H-clip/other support method)
 * - S4-PN-1 does NOT mint blocking or H-clips — only emits the requirement
 */
export const unsupportedEdgeRequirementSchema = z.object({
  panelPieceId: objectIdSchema,
  edge: panelEdgeSchema,
  requirementKind: z.literal("panel-edge-support"),
  status: z.enum(["unresolved", "resolved"]),
  resolutionMethod: z.string().nullable().default(null),
});

/**
 * Result of laying out physical panel pieces for a sheathing area.
 *
 * Per ticket S4-PN-1:
 * - Keep calculateSheathing SF lines as coverage/sanity only
 * - Do NOT emit sheet counts or wastePercent
 * - Materialize physical panel pieces
 */
export const panelLayoutResultSchema = z.object({
  areaId: objectIdSchema,

  pieces: z.array(physicalPanelPieceSchema).default([]),

  remnants: z.array(physicalPanelPieceSchema).default([]),

  unsupportedEdgeRequirements: z
    .array(unsupportedEdgeRequirementSchema)
    .default([]),

  diagnostics: z
    .array(
      z.object({
        code: z.string().min(1),
        message: z.string().min(1),
        severity: z.enum(["error", "warning", "info"]),
      }),
    )
    .default([]),

  status: z.enum([
    "complete",
    "partial_missing_panel_dimensions",
    "partial_missing_surface_geometry",
    "partial_unsupported_edges",
  ]),
});

export type PanelEdgeClassification = z.infer<
  typeof panelEdgeClassificationSchema
>;
export type PanelEdge = z.infer<typeof panelEdgeSchema>;
export type PhysicalPanelPiece = z.infer<typeof physicalPanelPieceSchema>;
export type UnsupportedEdgeRequirement = z.infer<
  typeof unsupportedEdgeRequirementSchema
>;
export type PanelLayoutResult = z.infer<typeof panelLayoutResultSchema>;
