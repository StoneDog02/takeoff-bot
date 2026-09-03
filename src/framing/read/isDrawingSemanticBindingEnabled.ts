export function isDrawingSemanticBindingEnabled(): boolean {
  return process.env.TAKEOFF_SEMANTIC_BINDING === "1";
}
