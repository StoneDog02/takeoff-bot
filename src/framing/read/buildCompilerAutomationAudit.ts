import type { CompiledDrawingPage } from "../../compiler/schemas/compiledDrawingPage.schema.js";
import type { CompilerAutomationAuditPayload } from "../schemas/framing-artifacts.schema.js";

export function buildCompilerAutomationAudit(
  pages: readonly CompiledDrawingPage[],
): CompilerAutomationAuditPayload {
  const byReason = {
    automated: 0,
    "compiler-unresolved": 0,
    "source-authority-missing": 0,
    "page-role-blocked": 0,
    "scale-unresolved": 0,
    "scale-rejected": 0,
    "virtual-text-blocked": 0,
    "conflicting-authority": 0,
  };

  let detected = 0;
  let highAuthority = 0;
  let governedEmit = 0;

  const perPage: Record<number, number> = {};

  for (const page of pages) {
    perPage[page.pageNumber] = page.timingMs.total;
    highAuthority += page.geometry.pbgRuns.filter(
      (r) => r.wallAuthority === "high",
    ).length;
    detected += page.geometry.pbgRuns.length;
    governedEmit += page.governance.emitDimIds.length;
    byReason.automated += page.governance.emitDimIds.length;

    for (const d of page.governance.decisions) {
      if (d.emit) continue;
      if (!d.pageRoleOk) byReason["page-role-blocked"]++;
      else if (!d.sourceOk) byReason["virtual-text-blocked"]++;
      else if (!d.ownershipOk) {
        if (d.reasons.some((r) => r.includes("feet-below-evidence-floor"))) {
          byReason["source-authority-missing"]++;
        } else {
          byReason["compiler-unresolved"]++;
        }
      } else if (d.scale?.status === "reject") byReason["scale-rejected"]++;
      else if (d.scale?.status === "unresolved") byReason["scale-unresolved"]++;
      else byReason["compiler-unresolved"]++;
    }
  }

  return {
    compiledPageNumbers: pages.map((p) => p.pageNumber),
    physicalRuns: {
      detected,
      highAuthority,
      governedEmit,
      lengthResolved: governedEmit,
    },
    byReason,
    conflicts: [],
    timingMs: {
      total: pages.reduce((sum, p) => sum + p.timingMs.total, 0),
      perPage,
    },
  };
}
