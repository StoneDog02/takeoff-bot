export {
  bboxSchema,
  provenanceRefSchema,
  projectObservationSchema,
  projectConventionHypothesisSchema,
  projectSemanticDefinitionSchema,
  projectReferenceBindingSchema,
  projectUnresolvedSchema,
  projectContradictionSchema,
  experimentBranchSchema,
  projectDictionaryMetricsSchema,
  projectDictionarySchema,
  governedProjectDictionarySchema,
  type Bbox,
  type ProvenanceRef,
  type ProjectObservation,
  type ProjectConventionHypothesis,
  type ProjectSemanticDefinition,
  type ProjectReferenceBinding,
  type ProjectUnresolved,
  type ProjectContradiction,
  type ExperimentBranch,
  type ProjectDictionary,
  type GovernedProjectDictionary,
} from "./schemas/projectDictionary.schema.js";

export {
  evaluateDiscoveryLevels,
  mapLevelsToRecommendation,
  type DiscoveryLevels,
  type L5Recommendation,
} from "./evaluateDiscoveryLevels.js";

export {
  CompilerInvestigationFacade,
  type SheetSummary,
  type TextHit,
  type RegionImageRef,
  type RegionOcrCacheEntry,
} from "./compilerInvestigationFacade.js";

export {
  DictionaryGovernor,
  governDefinitions,
  type ValidatorResult,
  type GovernanceReport,
} from "./dictionaryGovernor.js";

export {
  BRANCH_CONFIGS,
  type InterpreterToolName,
  type InterpreterBranchConfig,
  type ProjectInterpreter,
} from "./projectInterpreterTypes.js";

export {
  ClaudeProjectInterpreter,
  CompilerSeedProjectInterpreter,
  createProjectInterpreter,
  INTERPRETER_TOOLS,
} from "./claudeProjectInterpreter.js";

export {
  type ProjectOrientationContext,
  isGraphicConventionAuthorized,
  crossPageDefinitionsFromContext,
} from "./projectOrientationContext.js";

export {
  buildOrientationDictionary,
  type BuildOrientationDictionaryInput,
  type BuildOrientationDictionaryResult,
} from "./buildOrientationDictionary.js";

export {
  probeP1KeyedNoteSignal,
  extractKeyedNoteCitationSnippet,
  evaluateKeyedNoteShearWallSignal,
  type KeyedNoteProbeResult,
} from "./probeP1KeyedNoteSignal.js";
