/**
 * Project orientation is default-on when the compiler path runs.
 * Force-off via TAKEOFF_PROJECT_ORIENTATION=0 for cheap fixtures.
 */
export function isProjectOrientationEnabled(): boolean {
  return process.env.TAKEOFF_PROJECT_ORIENTATION !== "0";
}
