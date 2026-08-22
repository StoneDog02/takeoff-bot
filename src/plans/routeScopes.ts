import type { PlanIndex } from "./PlanIndex.js";

export interface ScopeRoutingEntry {
  scopeName: string;
  relevantPages: number[];
  reason: string;
}

/**
 * @deprecated Mock-only scaffold. Scope-level page membership for framing is
 * expressed through ExtractionPageBundle role assignments, not this helper.
 */
export function routeScopes(_planIndex: PlanIndex): ScopeRoutingEntry[] {
  throw new Error(
    "routeScopes is deprecated mock scaffolding. Use buildExtractionPageBundles with explicit ExtractionPageRoleAssignment[].",
  );
}
