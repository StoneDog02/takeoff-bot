import { z } from "zod";

/**
 * Source-grounded wall geometry observation (navigation of dimensions).
 * Distinct from construction quantity calculation.
 *
 * Target identity rules:
 * - Prefer physical-run subjects (one straight wall run on a sheet).
 * - Wall-type marks (SW2, SW5, …) must not receive a single lengthFeet
 *   when they represent a shared assembly type across multiple runs.
 */
export const wallGeometryAuthorityMethodSchema = z.enum([
  "explicit-dimension",
  "dimension-chain-segment",
  "geometry-derived",
  "user-override",
]);

export const wallGeometryTargetKindSchema = z.enum([
  /** One physical straight wall run / instance. */
  "physical-run",
  /** Shared wall-type / schedule mark — length attachment fails closed. */
  "wall-type-mark",
  "unknown",
]);

export const wallGeometryObservationSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
  /** Exact dimension text as read from the drawing. */
  rawDimensionText: z.string().trim().min(1),
  /** Deterministic decimal feet when parse succeeds; else null. */
  lengthFeet: z.number().finite().positive().nullable().default(null),
  authorityMethod: wallGeometryAuthorityMethodSchema,
  targetKind: wallGeometryTargetKindSchema,
  /**
   * Physical-run subject key when targetKind=physical-run.
   * Must NOT be a shared type mark like SW2.
   */
  targetPhysicalRunKey: z.string().trim().min(1).nullable().default(null),
  /** Optional wall-type mark observed on the same run (provenance only). */
  observedWallTypeMark: z.string().trim().min(1).nullable().default(null),
  sourcePageNumber: z.number().int().positive(),
  sourceTileId: z.string().trim().min(1).nullable().default(null),
  /** Free-text anchors as observed (not CAD coordinates). */
  startAnchorDescription: z.string().trim().min(1).nullable().default(null),
  endAnchorDescription: z.string().trim().min(1).nullable().default(null),
  orientation: z.enum(["horizontal", "vertical", "unknown"]).default("unknown"),
  /** True when this dimension is one piece of an explicit chain. */
  isChainSegment: z.boolean().default(false),
  /** Sibling raw texts in the same chain when known. */
  chainSiblingTexts: z.array(z.string().trim().min(1)).default([]),
  confidenceLabel: z.enum(["high", "medium", "low"]),
  notes: z.array(z.string().trim().min(1)).default([]),
});

export const wallGeometryObservationPayloadSchema = z.object({
  observations: z.array(wallGeometryObservationSchema),
});

export type WallGeometryAuthorityMethod = z.infer<
  typeof wallGeometryAuthorityMethodSchema
>;
export type WallGeometryTargetKind = z.infer<typeof wallGeometryTargetKindSchema>;
export type WallGeometryObservation = z.infer<
  typeof wallGeometryObservationSchema
>;
export type WallGeometryObservationPayload = z.infer<
  typeof wallGeometryObservationPayloadSchema
>;

/**
 * Subject keys that represent shared wall-type / schedule marks rather than
 * a single physical run. Length attachment fails closed for these.
 */
export function isWallTypeMarkSubjectKey(subjectKey: string): boolean {
  const key = subjectKey.trim().toUpperCase();
  if (/^SW\d+[A-Z]?$/.test(key)) {
    return true;
  }
  if (key === "EXTERIOR-WALLS" || key === "EXTERIOR WALLS") {
    return true;
  }
  if (key === "BRACED-WALLS" || key === "BRACED WALLS") {
    return true;
  }
  if (key.includes("GENERAL-WALL-NOTE") || key.includes("GENERAL WALL NOTE")) {
    return true;
  }
  if (key.includes("BEARING") && key.includes("WALL") && !key.includes("2X")) {
    // Aggregate note subjects like BEARING-AND-EXTERIOR-WALLS
    if (key.includes("AND") || key.includes("SHEAR")) {
      return true;
    }
  }
  return false;
}
