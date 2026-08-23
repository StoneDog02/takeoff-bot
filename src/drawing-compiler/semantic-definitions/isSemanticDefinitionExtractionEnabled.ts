/** B2.2L.3 — schedule definition extraction gate (p1 schedule pages). */
export function isSemanticDefinitionExtractionEnabled(): boolean {
  return process.env.TAKEOFF_SEMANTIC_DEFINITION_EXTRACTION === "1";
}

/** B2.2L.3 proof integration gate — not global semantic binding. */
export function isB2_2L3ProofEnabled(): boolean {
  return process.env.TAKEOFF_B2_2L3_PROOF === "1";
}
