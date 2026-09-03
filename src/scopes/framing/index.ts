import type { Scope } from "../../core/scope/Scope.js";
import { createFramingStages } from "./stages/createFramingStages.js";

/**
 * Framing scope registration.
 *
 * Production CLI (`src/app.ts`) uses `runFramingResetTakeoff` (D1–D24), not
 * these stages. `createFramingStages()` remains for audit/dev/legacy
 * (`--legacy-pipeline`) and must not be treated as the production path.
 */
export const framingScope: Scope = {
  name: "framing",
  stages: createFramingStages(),
};
