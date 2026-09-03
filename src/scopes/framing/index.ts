import type { Scope } from "../../core/scope/Scope.js";

/**
 * Framing scope registration.
 *
 * Production CLI (`src/app.ts`) uses `runFramingResetTakeoff`.
 */
export const framingScope: Scope = {
  name: "framing",
};
