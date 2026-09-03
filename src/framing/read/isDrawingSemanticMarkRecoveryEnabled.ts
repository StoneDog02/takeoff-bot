export function isDrawingSemanticMarkRecoveryEnabled(): boolean {
  return process.env.TAKEOFF_SEMANTIC_MARK_RECOVERY === "1";
}
