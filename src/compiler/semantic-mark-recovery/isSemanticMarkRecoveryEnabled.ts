export function isSemanticMarkRecoveryEnabled(): boolean {
  return process.env.TAKEOFF_SEMANTIC_MARK_RECOVERY === "1";
}
