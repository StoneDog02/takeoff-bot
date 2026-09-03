import type { SemanticDefinition } from "../schemas/semanticDefinition.schema.js";
import type { ReferenceMechanism } from "./referenceMechanism.schema.js";

export type SemanticReferenceInstance = {
  referenceId: string;
  referenceKey: string | null;
  referenceMechanism: ReferenceMechanism;
  conventionClass: string;
  sourcePageNumber: number;
  sourceRegion: { x0: number; y0: number; x1: number; y1: number };
  observationKind: "text-identifier" | "enclosed-identifier" | "leader-callout" | "graphic-convention";
  legendProvenance?: string | null;
  ownership: {
    physicalRunKey: string | null;
    authorityGrade: "A" | "B" | null;
    method: string | null;
  };
  provenance: {
    observationId: string;
    conventionEntryIds: string[];
  };
};

export type DereferencedSemanticBinding = {
  bindingId: string;
  physicalRunKey: string;
  referenceKey: string;
  definitionId: string;
  relationship: "dereferenced-reference" | "graphic-convention";
  authorityGrade: "A" | "B";
  status: "assigned" | "ambiguous" | "conflict" | "rejected";
  emit: boolean;
  sourcePageNumber: number;
  provenance: {
    referenceObservationId: string;
    conventionEntryIds: string[];
    definitionId: string;
    dereferenceMethod: "key-equality";
    referenceMechanism: ReferenceMechanism;
  };
  notes: string[];
};

/**
 * Deterministic cross-page dereference: reference key ↔ definition key only.
 * Never establishes physical-run ownership.
 */
export function dereferenceSemanticBindings(input: {
  references: readonly SemanticReferenceInstance[];
  definitions: readonly SemanticDefinition[];
  pageNumber?: number;
}): DereferencedSemanticBinding[] {
  const defByKey = new Map(
    input.definitions.map((d) => [d.semanticTypeKey.toUpperCase(), d]),
  );
  const bindings: DereferencedSemanticBinding[] = [];

  for (const ref of input.references) {
    if (!ref.referenceKey || !ref.ownership.physicalRunKey) continue;
    const key = ref.referenceKey.toUpperCase();
    const def = defByKey.get(key);
    if (!def) {
      bindings.push({
        bindingId: `deref-reject-${ref.referenceId}`,
        physicalRunKey: ref.ownership.physicalRunKey,
        referenceKey: ref.referenceKey,
        definitionId: "",
        relationship:
          ref.observationKind === "graphic-convention"
            ? "graphic-convention"
            : "dereferenced-reference",
        authorityGrade: ref.ownership.authorityGrade ?? "B",
        status: "rejected",
        emit: false,
        sourcePageNumber: ref.sourcePageNumber,
        provenance: {
          referenceObservationId: ref.provenance.observationId,
          conventionEntryIds: ref.provenance.conventionEntryIds,
          definitionId: "",
          dereferenceMethod: "key-equality",
          referenceMechanism: ref.referenceMechanism,
        },
        notes: [`no matching definition for key ${ref.referenceKey}`],
      });
      continue;
    }

    bindings.push({
      bindingId: `deref-${ref.referenceId}-${def.definitionId}`,
      physicalRunKey: ref.ownership.physicalRunKey,
      referenceKey: ref.referenceKey,
      definitionId: def.definitionId,
      relationship:
        ref.observationKind === "graphic-convention"
          ? "graphic-convention"
          : "dereferenced-reference",
      authorityGrade: ref.ownership.authorityGrade ?? "A",
      status: "assigned",
      emit: true,
      sourcePageNumber: ref.sourcePageNumber,
      provenance: {
        referenceObservationId: ref.provenance.observationId,
        conventionEntryIds: ref.provenance.conventionEntryIds,
        definitionId: def.definitionId,
        dereferenceMethod: "key-equality",
        referenceMechanism: ref.referenceMechanism,
      },
      notes: [],
    });
  }

  return bindings;
}
