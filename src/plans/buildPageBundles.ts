import type { PageBundle } from "./PageBundle.js";
import type { PlanIndex } from "./PlanIndex.js";

/**
 * @deprecated Mock-only scaffold from early architecture docs. Use
 * `buildExtractionPageBundles` with explicit role assignments instead.
 * This function remains only so old imports fail loudly rather than silently
 * producing fake A2.01/S1.01 sheet maps.
 */
export function buildPageBundles(_planIndex: PlanIndex): PageBundle[] {
  throw new Error(
    "buildPageBundles is deprecated mock scaffolding. Use buildExtractionPageBundles({ planIndex, scopeName, intent, roleAssignments }).",
  );
}
