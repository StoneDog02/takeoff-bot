import type { CompiledDrawingPage } from "../schemas/compiledDrawingPage.schema.js";
import { buildSemanticBindingAuditFromCompiledPage } from "../type-marks/buildSemanticBindingAudit.js";

export type SemanticMarkRecoveryAudit = {
  phase0Decision: CompiledDrawingPage["semanticMarkRecovery"]["phase0Decision"];
  candidateRegionsGenerated: number;
  ocrCallsRequired: number;
  marksRecovered: number;
  typeIdentifierRecovered: number;
  candidatePrecisionEstimate: number | null;
  semanticIdentifierRecoveryRate: number | null;
  recoveredWithPlausibleDirectOwnership: number;
  recoveredButUnboundIdentifiers: number;
  markRecoveryFailures: number;
  ownershipFailures: number;
  semanticEnrichmentFailures: number;
  timingMs: number;
};

export function buildSemanticMarkRecoveryAuditFromPage(
  page: CompiledDrawingPage,
): SemanticMarkRecoveryAudit {
  const binding = buildSemanticBindingAuditFromCompiledPage(page);
  const recovery = page.semanticMarkRecovery;
  const recoveredMarks = recovery.observations.filter((o) => o.rawText);
  const boundKeys = new Set(
    page.semanticBinding.bindings
      .filter((b) => b.emit)
      .map((b) => b.semanticSubjectKey),
  );

  const recoveredWithOwnership = page.semanticBinding.ownershipAssociations.filter(
    (a) =>
      a.status === "associated" &&
      recoveredMarks.some((o) => o.observationId === a.textPrimitiveId),
  ).length;

  const recoveredButUnbound = recovery.observations.filter((o) => {
    if (!o.normalizedKey) return false;
    return !boundKeys.has(o.normalizedKey);
  }).length;

  const ownershipFailures =
    recoveredMarks.length > 0
      ? page.semanticBinding.ownershipAssociations.filter(
          (a) =>
            recoveredMarks.some((o) => o.observationId === a.textPrimitiveId) &&
            (a.status === "ambiguous" || a.status === "unassociated"),
        ).length
      : 0;

  const markRecoveryFailures =
    recovery.phase0Decision &&
    recovery.phase0Decision !== "STOP" &&
    recovery.phase0Decision !== "SCHEDULE_REFERENCE" &&
    recovery.metrics.typeIdentifierRecovered === 0
      ? 1
      : recovery.metrics.markRecoveryFailures;

  return {
    phase0Decision: recovery.phase0Decision,
    candidateRegionsGenerated: recovery.metrics.candidateRegionsGenerated,
    ocrCallsRequired: recovery.metrics.ocrCallsRequired,
    marksRecovered: recovery.metrics.marksRecovered,
    typeIdentifierRecovered: recovery.metrics.typeIdentifierRecovered,
    candidatePrecisionEstimate: recovery.metrics.candidatePrecisionEstimate,
    semanticIdentifierRecoveryRate:
      recoveredMarks.length > 0
        ? recovery.metrics.typeIdentifierRecovered / recoveredMarks.length
        : null,
    recoveredWithPlausibleDirectOwnership: recoveredWithOwnership,
    recoveredButUnboundIdentifiers: recoveredButUnbound,
    markRecoveryFailures,
    ownershipFailures,
    semanticEnrichmentFailures: binding.directEmitCount > 0 ? 0 : 0,
    timingMs: recovery.metrics.timingMs,
  };
}

export function summarizeSemanticMarkRecoveryPages(
  pages: readonly CompiledDrawingPage[],
): {
  markRecoveryFailures: number;
  ownershipFailures: number;
  semanticEnrichmentFailures: number;
  typeIdentifierRecovered: number;
  directEmitCount: number;
  candidatePrecisionEstimate: number | null;
  ocrCallsRequired: number;
} {
  let markRecoveryFailures = 0;
  let ownershipFailures = 0;
  let semanticEnrichmentFailures = 0;
  let typeIdentifierRecovered = 0;
  let directEmitCount = 0;
  let ocrCallsRequired = 0;
  const precisions: number[] = [];

  for (const page of pages) {
    const audit = buildSemanticMarkRecoveryAuditFromPage(page);
    markRecoveryFailures += audit.markRecoveryFailures;
    ownershipFailures += audit.ownershipFailures;
    semanticEnrichmentFailures += audit.semanticEnrichmentFailures;
    typeIdentifierRecovered += audit.typeIdentifierRecovered;
    directEmitCount += page.semanticBinding.emitBindingIds.length;
    ocrCallsRequired += audit.ocrCallsRequired;
    if (audit.candidatePrecisionEstimate != null) {
      precisions.push(audit.candidatePrecisionEstimate);
    }
  }

  return {
    markRecoveryFailures,
    ownershipFailures,
    semanticEnrichmentFailures,
    typeIdentifierRecovered,
    directEmitCount,
    candidatePrecisionEstimate:
      precisions.length > 0
        ? precisions.reduce((a, b) => a + b, 0) / precisions.length
        : null,
    ocrCallsRequired,
  };
}
