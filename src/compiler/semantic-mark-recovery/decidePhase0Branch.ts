import type {
  Phase0Decision,
  StrategyTrialMetrics,
} from "./phase0Decision.schema.js";
import type { VisualMarkPageAudit } from "./auditVisualMarkPage.js";

export type Phase0DecisionResult = {
  phase0Decision: Phase0Decision;
  rationale: string[];
  evidence: {
    pagesAudited: number;
    totalTypeIdentifiersRecovered: number;
    strategyTotals: Record<string, StrategyTrialMetrics>;
    planPageAudits: VisualMarkPageAudit[];
    schedulePageAudits: VisualMarkPageAudit[];
  };
  candidatePrecisionEstimate: number | null;
};

function sumTrials(
  audits: VisualMarkPageAudit[],
): Record<string, StrategyTrialMetrics> {
  const totals: Record<string, StrategyTrialMetrics> = {};

  for (const page of audits) {
    for (const trial of page.strategyTrials) {
      const existing = totals[trial.strategy] ?? {
        strategy: trial.strategy,
        candidateRegionsGenerated: 0,
        ocrCallsRequired: 0,
        marksRecovered: 0,
        typeIdentifierRecovered: 0,
        recoveredSamples: [],
      };
      existing.candidateRegionsGenerated += trial.candidateRegionsGenerated;
      existing.ocrCallsRequired += trial.ocrCallsRequired;
      existing.marksRecovered += trial.marksRecovered;
      existing.typeIdentifierRecovered += trial.typeIdentifierRecovered;
      existing.recoveredSamples = [
        ...existing.recoveredSamples,
        ...trial.recoveredSamples,
      ].slice(0, 12);
      totals[trial.strategy] = existing;
    }
  }
  return totals;
}

/**
 * Select smallest generic recovery branch from Phase 0 audit evidence.
 */
export function decidePhase0Branch(
  audits: readonly VisualMarkPageAudit[],
): Phase0DecisionResult {
  const planPages = audits.filter((a) => !a.label.includes("p1-schedule"));
  const schedulePages = audits.filter((a) => a.label.includes("p1-schedule"));
  const strategyTotals = sumTrials([...audits]);

  const totalTypeIds = Object.values(strategyTotals).reduce(
    (sum, t) => sum + t.typeIdentifierRecovered,
    0,
  );

  const runBand = strategyTotals["run-band"];
  const enc = strategyTotals["enclosure-interior"];
  const ldr = strategyTotals["leader-endpoint"];
  const native = strategyTotals["native-text"];

  const rationale: string[] = [];

  const totalRegions =
    (runBand?.candidateRegionsGenerated ?? 0) +
    (enc?.candidateRegionsGenerated ?? 0);

  const bestOcrTypeIds = Math.max(
    runBand?.typeIdentifierRecovered ?? 0,
    enc?.typeIdentifierRecovered ?? 0,
    ldr?.typeIdentifierRecovered ?? 0,
  );

  const candidatePrecisionEstimate =
    totalRegions > 0 && bestOcrTypeIds > 0
      ? bestOcrTypeIds / Math.max(runBand?.ocrCallsRequired ?? 1, 1)
      : null;

  if (totalTypeIds === 0 && planPages.every((p) => p.enclosureCount === 0 && p.leaderCount === 0)) {
    rationale.push("No type identifiers recovered; no enclosure/leader structure on plan pages.");
    if (schedulePages.some((p) => p.scheduleLikeTextCount > 0)) {
      rationale.push("Schedule-like text present on p1 — identity may be schedule-referenced only.");
      return {
        phase0Decision: "SCHEDULE_REFERENCE",
        rationale,
        evidence: {
          pagesAudited: audits.length,
          totalTypeIdentifiersRecovered: 0,
          strategyTotals,
          planPageAudits: planPages,
          schedulePageAudits: schedulePages,
        },
        candidatePrecisionEstimate,
      };
    }
    return {
      phase0Decision: "STOP",
      rationale: [...rationale, "No generic recovery path identified."],
      evidence: {
        pagesAudited: audits.length,
        totalTypeIdentifiersRecovered: 0,
        strategyTotals,
        planPageAudits: planPages,
        schedulePageAudits: schedulePages,
      },
      candidatePrecisionEstimate,
    };
  }

  if ((native?.typeIdentifierRecovered ?? 0) > 0 && (runBand?.typeIdentifierRecovered ?? 0) === 0) {
    rationale.push("Native text supplies type identifiers without OCR.");
    return {
      phase0Decision: "DIRECT_OCR",
      rationale: [...rationale, "Use native-text path first; OCR for graphical gaps only."],
      evidence: {
        pagesAudited: audits.length,
        totalTypeIdentifiersRecovered: totalTypeIds,
        strategyTotals,
        planPageAudits: planPages,
        schedulePageAudits: schedulePages,
      },
      candidatePrecisionEstimate,
    };
  }

  const encScore = enc?.typeIdentifierRecovered ?? 0;
  const ldrScore = ldr?.typeIdentifierRecovered ?? 0;
  const runScore = runBand?.typeIdentifierRecovered ?? 0;

  const totalEnclosures = planPages.reduce((s, p) => s + p.enclosureCount, 0);
  const totalLeaders = planPages.reduce((s, p) => s + p.leaderCount, 0);

  if (ldrScore > 0 && ldrScore >= runScore && totalLeaders > 0) {
    rationale.push(
      `Leader-endpoint trial recovered ${ldrScore} type id(s) with ${totalLeaders} leader(s).`,
    );
    if (encScore > 0) {
      return {
        phase0Decision: "HYBRID",
        rationale: [
          ...rationale,
          "Enclosure interior also recovered identifiers — HYBRID: leader-callout ownership + enclosure OCR.",
        ],
        evidence: {
          pagesAudited: audits.length,
          totalTypeIdentifiersRecovered: totalTypeIds,
          strategyTotals,
          planPageAudits: planPages,
          schedulePageAudits: schedulePages,
        },
        candidatePrecisionEstimate,
      };
    }
    return {
      phase0Decision: "LEADER_CALLOUT",
      rationale,
      evidence: {
        pagesAudited: audits.length,
        totalTypeIdentifiersRecovered: totalTypeIds,
        strategyTotals,
        planPageAudits: planPages,
        schedulePageAudits: schedulePages,
      },
      candidatePrecisionEstimate,
    };
  }

  if (
    encScore > runScore &&
    encScore > 0 &&
    totalEnclosures >= Math.max(3, totalLeaders)
  ) {
    rationale.push(
      `Enclosure interior trial recovered ${encScore} type id(s) across ${totalEnclosures} enclosures — better than run-band (${runScore}).`,
    );
    return {
      phase0Decision: "ENCLOSURE_OCR",
      rationale,
      evidence: {
        pagesAudited: audits.length,
        totalTypeIdentifiersRecovered: totalTypeIds,
        strategyTotals,
        planPageAudits: planPages,
        schedulePageAudits: schedulePages,
      },
      candidatePrecisionEstimate,
    };
  }

  if (runScore > 0) {
    rationale.push(`Run-band OCR recovered ${runScore} type identifier(s).`);
    if (encScore > 0 || ldrScore > 0) {
      return {
        phase0Decision: "HYBRID",
        rationale: [
          ...rationale,
          "Additional recoveries from enclosure/leader trials — combine structure-first routing.",
        ],
        evidence: {
          pagesAudited: audits.length,
          totalTypeIdentifiersRecovered: totalTypeIds,
          strategyTotals,
          planPageAudits: planPages,
          schedulePageAudits: schedulePages,
        },
        candidatePrecisionEstimate,
      };
    }
    return {
      phase0Decision: "DIRECT_OCR",
      rationale,
      evidence: {
        pagesAudited: audits.length,
        totalTypeIdentifiersRecovered: totalTypeIds,
        strategyTotals,
        planPageAudits: planPages,
        schedulePageAudits: schedulePages,
      },
      candidatePrecisionEstimate,
    };
  }

  if (totalEnclosures > 10 && planPages.every((p) => p.nativeTextItemCount === 0)) {
    rationale.push(
      "No OCR recovery yet but dense enclosure structure on text-free plan — ENCLOSURE_OCR primary.",
    );
    return {
      phase0Decision: "ENCLOSURE_OCR",
      rationale,
      evidence: {
        pagesAudited: audits.length,
        totalTypeIdentifiersRecovered: totalTypeIds,
        strategyTotals,
        planPageAudits: planPages,
        schedulePageAudits: schedulePages,
      },
      candidatePrecisionEstimate,
    };
  }

  if (totalTypeIds === 0) {
    return {
      phase0Decision: "STOP",
      rationale: ["Trials did not recover bindable type identifiers."],
      evidence: {
        pagesAudited: audits.length,
        totalTypeIdentifiersRecovered: 0,
        strategyTotals,
        planPageAudits: planPages,
        schedulePageAudits: schedulePages,
      },
      candidatePrecisionEstimate,
    };
  }

  return {
    phase0Decision: "DIRECT_OCR",
    rationale: ["Default to run-adjacent OCR as fallback branch."],
    evidence: {
      pagesAudited: audits.length,
      totalTypeIdentifiersRecovered: totalTypeIds,
      strategyTotals,
      planPageAudits: planPages,
      schedulePageAudits: schedulePages,
    },
    candidatePrecisionEstimate,
  };
}
