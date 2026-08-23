import type {
  PhysicalRunSemanticBinding,
  TopologicalPropagationOpportunity,
} from "../schemas/semanticBinding.schema.js";
import type { PbgRun } from "../pbg/consolidatePhysicalRuns.js";

/**
 * Record connected-run propagation opportunities for audit only — never emit in B2.2L.
 */
export function recordTopologicalPropagationOpportunities(input: {
  pbgRuns: readonly PbgRun[];
  emitBindings: readonly PhysicalRunSemanticBinding[];
}): TopologicalPropagationOpportunity[] {
  const seedByRunKey = new Map<string, string>();
  for (const binding of input.emitBindings) {
    if (binding.emit) {
      seedByRunKey.set(binding.physicalRunKey, binding.bindingId);
    }
  }

  const runById = new Map(input.pbgRuns.map((r) => [r.id, r]));
  const opportunities: TopologicalPropagationOpportunity[] = [];

  for (const run of input.pbgRuns) {
    if (seedByRunKey.has(run.physicalRunKey)) continue;

    for (const connectedId of run.connectedRunIds) {
      const neighbor = runById.get(connectedId);
      if (!neighbor) continue;
      const seedId = seedByRunKey.get(neighbor.physicalRunKey);
      if (!seedId) continue;

      const junctionKind =
        run.junctions.find((j) => j.otherRunId === connectedId)?.kind ?? null;

      opportunities.push({
        physicalRunKey: run.physicalRunKey,
        connectedRunKey: neighbor.physicalRunKey,
        seedBindingId: seedId,
        reasonNotEmitted: "propagation-deferred-to-L.1",
        junctionKind,
        notes: ["connected to seeded run; propagation deferred to B2.2L.1"],
      });
    }
  }

  return opportunities;
}
