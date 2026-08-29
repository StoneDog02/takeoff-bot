/**
 * Feature gate for Project Learning / Document Dictionary V1.
 *
 * Requires TAKEOFF_PROJECT_LEARNING=1.
 * Hybrid harvest needs Java 11+ and (for textless schedule pages) an optional
 * local opendataloader-pdf hybrid server; when Hybrid is unavailable the
 * pipeline falls back to OCR / existing schedule extractors without failing
 * the takeoff.
 */
export function isProjectLearningEnabled(): boolean {
  return process.env.TAKEOFF_PROJECT_LEARNING === "1";
}
