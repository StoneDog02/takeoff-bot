import type { CompiledDrawingPage } from "../schemas/compiledDrawingPage.schema.js";
import type { SemanticBindingAudit } from "../schemas/semanticBinding.schema.js";
import {
  classifySemanticTextCandidate,
  type SemanticTextCategory,
} from "../type-marks/classifySemanticTextCandidate.js";
import { inventorySemanticTextCandidates } from "../type-marks/detectTypeIdentifierPrimitives.js";

function countByCategory(
  items: Array<{ category: SemanticTextCategory }>,
): Record<SemanticTextCategory, number> {
  const counts: Record<SemanticTextCategory, number> = {
    "type-or-assembly-identifier": 0,
    "wall-property-or-classification": 0,
    "general-note": 0,
    "schedule-or-legend-text": 0,
    unknown: 0,
  };
  for (const item of items) {
    counts[item.category]++;
  }
  return counts;
}

export function buildSemanticBindingAuditFromCompiledPage(
  page: CompiledDrawingPage,
): SemanticBindingAudit {
  const inventory = inventorySemanticTextCandidates(page.text.primitives);
  const categoryCounts = countByCategory(inventory);
  const emitBindings = page.semanticBinding.bindings.filter((b) => b.emit);
  const boundRunKeys = new Set(emitBindings.map((b) => b.physicalRunKey));
  const eligibleRuns = page.geometry.pbgRuns.filter(
    (r) => r.wallAuthority === "high" || r.wallAuthority === "medium",
  );

  return {
    typeIdentifierCount: categoryCounts["type-or-assembly-identifier"],
    propertyPhraseCount: categoryCounts["wall-property-or-classification"],
    generalNoteCount:
      categoryCounts["general-note"] + categoryCounts["schedule-or-legend-text"],
    directEmitCount: emitBindings.length,
    ambiguousCount: page.semanticBinding.bindings.filter(
      (b) => b.status === "ambiguous",
    ).length,
    conflictCount: page.semanticBinding.bindings.filter(
      (b) => b.status === "conflict",
    ).length,
    rejectedCategoryCount: page.semanticBinding.ownershipAssociations.filter(
      (a) => a.status === "rejected-category",
    ).length,
    propagationOpportunityCount:
      page.semanticBinding.propagationOpportunities.length,
    eligibleButUnboundRuns: eligibleRuns.filter(
      (r) => !boundRunKeys.has(r.physicalRunKey),
    ).length,
    emitBindingIds: page.semanticBinding.emitBindingIds,
    bindings: page.semanticBinding.bindings,
    propagationOpportunities: page.semanticBinding.propagationOpportunities,
    ownershipAssociations: page.semanticBinding.ownershipAssociations,
  };
}

export function summarizeSemanticBindingPages(
  pages: readonly CompiledDrawingPage[],
): {
  directSemanticBindingAutomationRate: number;
  eligibleButUnboundRuns: number;
  semanticPropertySignalsNotUsedAsIdentity: number;
  ambiguousDirectBindings: number;
  bindingConflicts: number;
  calculablePhysicalRunRate: number;
  topologyPropagationOpportunities: number;
  directEmitCount: number;
  eligibleRunCount: number;
} {
  let directEmit = 0;
  let eligible = 0;
  let unbound = 0;
  let propertySignals = 0;
  let ambiguous = 0;
  let conflicts = 0;
  let propagationOps = 0;

  for (const page of pages) {
    const audit = buildSemanticBindingAuditFromCompiledPage(page);
    directEmit += audit.directEmitCount;
    eligible += page.geometry.pbgRuns.filter(
      (r) => r.wallAuthority === "high" || r.wallAuthority === "medium",
    ).length;
    unbound += audit.eligibleButUnboundRuns;
    propertySignals += audit.propertyPhraseCount;
    ambiguous += audit.ambiguousCount;
    conflicts += audit.conflictCount;
    propagationOps += audit.propagationOpportunityCount;
  }

  return {
    directSemanticBindingAutomationRate:
      eligible > 0 ? directEmit / eligible : 0,
    eligibleButUnboundRuns: unbound,
    semanticPropertySignalsNotUsedAsIdentity: propertySignals,
    ambiguousDirectBindings: ambiguous,
    bindingConflicts: conflicts,
    calculablePhysicalRunRate: 0,
    topologyPropagationOpportunities: propagationOps,
    directEmitCount: directEmit,
    eligibleRunCount: eligible,
  };
}

/** Re-export for L0 probe categorization of arbitrary text. */
export { classifySemanticTextCandidate, inventorySemanticTextCandidates };
