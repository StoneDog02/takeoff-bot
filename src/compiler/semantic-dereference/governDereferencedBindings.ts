import type { DereferencedSemanticBinding } from "./dereferenceSemanticBindings.js";
import type { SemanticReferenceInstance } from "./dereferenceSemanticBindings.js";

/**
 * Govern dereferenced bindings: requires plan reference ownership + key match.
 * Schedule-only keys never bind runs.
 */
export function governDereferencedBindings(input: {
  bindings: readonly DereferencedSemanticBinding[];
  references: readonly SemanticReferenceInstance[];
}): {
  bindings: DereferencedSemanticBinding[];
  emitBindingIds: string[];
  rejectedScheduleOnly: number;
} {
  const refById = new Map(
    input.references.map((r) => [r.provenance.observationId, r]),
  );
  const byRun = new Map<string, DereferencedSemanticBinding[]>();

  for (const b of input.bindings) {
    const ref = refById.get(b.provenance.referenceObservationId);
    if (!ref || ref.ownership.physicalRunKey == null) continue;
    const list = byRun.get(b.physicalRunKey) ?? [];
    list.push(b);
    byRun.set(b.physicalRunKey, list);
  }

  const out: DereferencedSemanticBinding[] = [];
  const emitBindingIds: string[] = [];
  let rejectedScheduleOnly = 0;

  for (const [, assocs] of byRun) {
    const assigned = assocs.filter((a) => a.status === "assigned");
    if (assigned.length > 1) {
      for (const a of assocs) {
        out.push({ ...a, status: "conflict", emit: false, notes: [...a.notes, "multiple dereferenced keys on same run"] });
      }
      continue;
    }
    for (const a of assocs) {
      if (a.status === "assigned" && a.emit) {
        emitBindingIds.push(a.bindingId);
      }
      if (a.status === "rejected" && a.notes.some((n) => n.includes("no matching definition"))) {
        rejectedScheduleOnly++;
      }
      out.push(a);
    }
  }

  return { bindings: out, emitBindingIds, rejectedScheduleOnly };
}
