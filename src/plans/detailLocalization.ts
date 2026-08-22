import { z } from "zod";

/**
 * Navigation-only result for locating a referenced detail on a target page.
 * Must not carry framing quantities or construction Evidence candidates.
 */
export const detailLocalizationVisibilitySchema = z.enum([
  "visible",
  "not-visible",
  "ambiguous",
]);

export const detailLocalizationResultSchema = z.object({
  requestedDetailNumber: z.string().trim().min(1),
  targetSheetId: z.string().trim().min(1).nullable().default(null),
  targetPageNumber: z.number().int().positive(),
  visibility: detailLocalizationVisibilitySchema,
  /** Geometry tile ids (e.g. t-r1-c2) that contain the detail label/body. */
  matchingTileIds: z.array(z.string().trim().min(1)).default([]),
  /** Optional normalized page region when tiles are insufficient. */
  matchingRegion: z
    .object({
      normalizedX: z.number().min(0).max(1),
      normalizedY: z.number().min(0).max(1),
      normalizedWidth: z.number().gt(0).max(1),
      normalizedHeight: z.number().gt(0).max(1),
    })
    .nullable()
    .default(null),
  confidenceLabel: z.enum(["high", "medium", "low"]),
  /** Source label/text that established the match (navigation cue only). */
  matchEvidenceText: z.string().trim().min(1).nullable().default(null),
  notes: z.array(z.string().trim().min(1)).default([]),
});

export type DetailLocalizationVisibility = z.infer<
  typeof detailLocalizationVisibilitySchema
>;
export type DetailLocalizationResult = z.infer<
  typeof detailLocalizationResultSchema
>;

/**
 * Validates that returned tile ids belong to the known page tile set.
 * Fails closed: unknown ids are stripped and visibility may become ambiguous.
 */
export function filterLocalizationTilesToValidSet(
  result: DetailLocalizationResult,
  validTileIds: ReadonlySet<string>,
): DetailLocalizationResult {
  const matchingTileIds = result.matchingTileIds.filter((tileId) =>
    validTileIds.has(tileId),
  );
  const notes = [...result.notes];
  const dropped = result.matchingTileIds.filter(
    (tileId) => !validTileIds.has(tileId),
  );
  if (dropped.length > 0) {
    notes.push(
      `Dropped invalid tile ids not in page grid: ${dropped.join(", ")}.`,
    );
  }

  let visibility = result.visibility;
  if (
    visibility === "visible" &&
    matchingTileIds.length === 0 &&
    result.matchingRegion === null
  ) {
    visibility = "ambiguous";
    notes.push(
      "Visibility was visible but no valid tile/region remained after validation.",
    );
  }

  return detailLocalizationResultSchema.parse({
    ...result,
    matchingTileIds,
    visibility,
    notes,
  });
}
