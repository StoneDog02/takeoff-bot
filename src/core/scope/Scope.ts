import type { PipelineStage } from "../pipeline/types.js";

export interface Scope {
  name: string;
  stages: PipelineStage[];
}
