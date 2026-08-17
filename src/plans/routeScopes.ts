import type { PlanIndex } from "./PlanIndex.js";

export interface ScopeRoutingEntry {
  scopeName: string;
  relevantPages: number[];
  reason: string;
}

/**
 * Routes plan pages to applicable scopes.
 * Placeholder logic — real routing will use page map extraction.
 */
export function routeScopes(planIndex: PlanIndex): ScopeRoutingEntry[] {
  const allPages = planIndex.pages.map((p) => p.pageNumber);

  return [
    {
      scopeName: "framing",
      relevantPages: allPages.filter((n) => n <= 7),
      reason: "Mock routing: architectural and structural sheets",
    },
    {
      scopeName: "concrete",
      relevantPages: allPages.filter((n) => n === 4),
      reason: "Mock routing: structural foundation sheets",
    },
  ];
}
