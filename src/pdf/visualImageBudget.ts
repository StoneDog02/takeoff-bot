/**
 * Anthropic applies a stricter per-image pixel cap above this many images in
 * one request. Keep extraction bundles at or below this budget.
 */
export const MAX_VISUAL_IMAGES_PER_EXTRACTION_REQUEST = 20;
