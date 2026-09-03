import type { ExperimentBranch } from "./schemas/projectDictionary.schema.js";

export type InterpreterToolName =
  | "listSheets"
  | "getSheetRole"
  | "getCompiledPageSummary"
  | "getPhysicalRuns"
  | "getPhysicalRun"
  | "getLineStyleObservations"
  | "getAnnotationInventory"
  | "getSemanticDefinitions"
  | "getSemanticDereferenceAudit"
  | "searchProjectText"
  | "findTextPattern"
  | "getCrossPageInventory"
  | "inspectRegion"
  | "compareRunGraphics"
  | "getNearbyObservations";

export type InterpreterBranchConfig = {
  branch: ExperimentBranch;
  allowInspectRegion: boolean;
  maxInspectRegionCalls: number;
  maxToolTurns: number;
};

export const BRANCH_CONFIGS: Record<ExperimentBranch, InterpreterBranchConfig> = {
  compiler_heavy: {
    branch: "compiler_heavy",
    allowInspectRegion: false,
    maxInspectRegionCalls: 0,
    maxToolTurns: 12,
  },
  hybrid: {
    branch: "hybrid",
    allowInspectRegion: true,
    maxInspectRegionCalls: 3,
    maxToolTurns: 12,
  },
  visual_heavy: {
    branch: "visual_heavy",
    allowInspectRegion: true,
    maxInspectRegionCalls: 3,
    maxToolTurns: 12,
  },
};

export interface ProjectInterpreter {
  investigate(input: {
    projectId: string;
    branch: ExperimentBranch;
    seedObservations?: string[];
  }): Promise<import("./schemas/projectDictionary.schema.js").ProjectDictionary>;
}
