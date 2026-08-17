import type { Scope } from "../../core/scope/Scope.js";
import { createFramingStages } from "./stages/createFramingStages.js";

export const framingScope: Scope = {
  name: "framing",
  stages: createFramingStages(),
};
