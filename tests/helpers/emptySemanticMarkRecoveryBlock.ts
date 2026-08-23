export const emptySemanticMarkRecoveryBlock = {
  phase0Decision: null,
  observations: [],
  candidateRegions: [],
  metrics: {
    candidateRegionsGenerated: 0,
    ocrCallsRequired: 0,
    marksRecovered: 0,
    typeIdentifierRecovered: 0,
    candidatePrecisionEstimate: null,
    markRecoveryFailures: 0,
    ownershipFailures: 0,
    timingMs: 0,
  },
} as const;
