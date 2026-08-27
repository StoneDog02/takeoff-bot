import type { Opening } from "../schemas/opening.schema.js";
import { OPENING_QUANTITY_KEYS } from "../validators/rule-ids.js";

/**
 * Opening categories eligible for wall-framing opening material claims
 * (king / jack). Garage doors and unknown are not eligible.
 */
export const OPENING_WALL_FRAMING_ELIGIBLE_CATEGORIES = [
  "door",
  "window",
  "cased",
] as const;

/** Rough sill is window-only. */
export const OPENING_ROUGH_SILL_ELIGIBLE_CATEGORIES = ["window"] as const;

/** Cripples below sill are window-only. */
export const OPENING_CRIPPLES_BELOW_ELIGIBLE_CATEGORIES = ["window"] as const;

/**
 * Cripples above: windows always; cased only when header + rough height exist.
 * Category-only admission uses window|cased; calculator applies header gates.
 */
export const OPENING_CRIPPLES_ABOVE_ELIGIBLE_CATEGORIES = [
  "window",
  "cased",
] as const;

const WALL_FRAMING_SET = new Set<string>(OPENING_WALL_FRAMING_ELIGIBLE_CATEGORIES);
const ROUGH_SILL_SET = new Set<string>(OPENING_ROUGH_SILL_ELIGIBLE_CATEGORIES);
const CRIPPLES_BELOW_SET = new Set<string>(
  OPENING_CRIPPLES_BELOW_ELIGIBLE_CATEGORIES,
);
const CRIPPLES_ABOVE_SET = new Set<string>(
  OPENING_CRIPPLES_ABOVE_ELIGIBLE_CATEGORIES,
);

/**
 * Category sets that must be true before an opening emit key is a candidate.
 * Keys without an entry are not category-gated at admission.
 */
export function eligibleOpeningCategoriesForQuantityKey(
  quantityKey: string,
): ReadonlySet<string> | undefined {
  switch (quantityKey) {
    case OPENING_QUANTITY_KEYS.kingStuds:
    case OPENING_QUANTITY_KEYS.jackStuds:
      return WALL_FRAMING_SET;
    case OPENING_QUANTITY_KEYS.roughSill:
      return ROUGH_SILL_SET;
    case OPENING_QUANTITY_KEYS.cripplesAbove:
      return CRIPPLES_ABOVE_SET;
    case OPENING_QUANTITY_KEYS.cripplesBelow:
      return CRIPPLES_BELOW_SET;
    default:
      return undefined;
  }
}

export function isOpeningCategoryEligibleForQuantityKey(
  quantityKey: string,
  category: Opening["category"] | string | null | undefined,
): boolean {
  const allowed = eligibleOpeningCategoriesForQuantityKey(quantityKey);
  if (allowed === undefined) {
    return true;
  }
  if (category == null || typeof category !== "string" || category.trim().length === 0) {
    return false;
  }
  return allowed.has(category);
}
