export function isProjectOrientationEnabled(): boolean {
  return process.env.TAKEOFF_PROJECT_ORIENTATION === "1";
}
