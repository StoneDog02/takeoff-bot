import type { PlanPage } from "./PlanPage.js";

/**
 * True when the indexed page has no usable machine-readable text layer and
 * therefore needs a page visual for Stage 5 source fidelity.
 */
export function pageNeedsVisual(page: PlanPage): boolean {
  return page.textContent.trim().length === 0;
}
