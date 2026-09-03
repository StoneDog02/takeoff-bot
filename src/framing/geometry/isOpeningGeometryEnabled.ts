/**
 * Feature gate for B2.2M.3 deterministic opening geometry Evidence.
 */
export function isOpeningGeometryEnabled(): boolean {
  return process.env.TAKEOFF_OPENING_GEOMETRY === "1";
}
